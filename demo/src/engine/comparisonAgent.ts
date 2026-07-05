// ============================================================
// ComparisonAgent — runs 3 LiveAgent instances in parallel
// with different system prompts for strategy comparison
// ============================================================

import { LiveAgent } from './liveAgent'
import { liveTools } from './liveTools'
import type { AgentStep, LiveMessage } from './types'

// ---- 3 System Prompts ----

export const COMPARISON_PROMPTS: Record<string, { label: string; prompt: string }> = {
  default: {
    label: '默认策略',
    prompt: `你是一个具备工具调用能力的 AI 助手。当用户提出问题时：
1. 分析用户需求，确定是否需要调用工具
2. 如果需要，调用合适的工具获取信息
3. 基于工具返回的结果，给出准确、有帮助的回答
4. 如果工具调用失败，分析原因并尝试修正后重试
请用中文回答用户的问题。`,
  },
  aggressive: {
    label: '激进策略',
    prompt: `你是一个数据驱动的 AI 助手。你的核心原则：
1. 任何时候，只要有可能，就调用工具获取最新数据
2. 不要依赖你的训练数据中的过时信息
3. 即使你确定答案，也要调用工具来验证
4. 多调用几个工具交叉验证，确保准确性
5. 宁可多调工具，也不要给出不准确的回答
请用中文回答用户的问题。`,
  },
  conservative: {
    label: '保守策略',
    prompt: `你是一个知识丰富的 AI 助手。你的核心原则：
1. 优先使用你自身的知识来回答问题
2. 只有在你完全不知道答案，或者用户明确要求时才调用工具
3. 调用工具是有成本的，要谨慎使用
4. 对于常识性问题，直接用你的知识回答
5. 对于需要最新数据的问题（如天气、时间），才调用工具
请用中文回答用户的问题。`,
  },
}

export const COMPARISON_KEYS = ['default', 'aggressive', 'conservative'] as const
export type ComparisonKey = (typeof COMPARISON_KEYS)[number]

// ---- State ----

export interface ComparisonColumnState {
  key: ComparisonKey
  label: string
  messages: LiveMessage[]
  steps: AgentStep[]
  isLoading: boolean
  error: string | null
  currentTurn: number
  startTime: number | null
  endTime: number | null
}

export interface ComparisonState {
  columns: ComparisonColumnState[]
  isRunning: boolean
  userMessage: string
}

function createColumnState(key: ComparisonKey): ComparisonColumnState {
  return {
    key,
    label: COMPARISON_PROMPTS[key].label,
    messages: [],
    steps: [],
    isLoading: false,
    error: null,
    currentTurn: 0,
    startTime: null,
    endTime: null,
  }
}

export function createComparisonState(): ComparisonState {
  return {
    columns: COMPARISON_KEYS.map(createColumnState),
    isRunning: false,
    userMessage: '',
  }
}

// ---- Callbacks ----

export interface ComparisonCallbacks {
  onStateChange: (state: ComparisonState) => void
}

// ---- Agent ----

export class ComparisonAgent {
  private agents: LiveAgent[]
  private callbacks: ComparisonCallbacks
  private state: ComparisonState

  constructor(
    config: {
      apiKey: string
      baseUrl: string
      model: string
      maxTurns: number
    },
    callbacks: ComparisonCallbacks,
  ) {
    this.callbacks = callbacks
    this.state = createComparisonState()

    // Create 3 LiveAgent instances, one per prompt
    this.agents = COMPARISON_KEYS.map((key) => {
      const agent = new LiveAgent(
        {
          ...config,
          systemPrompt: COMPARISON_PROMPTS[key].prompt,
        },
        {
          onStateChange: () => {
            // Handled by syncState below — each agent's polling
          },
        },
      )
      agent.setTools(liveTools)
      return agent
    })
  }

  /** Update config for all agents */
  setConfig(config: { apiKey: string; baseUrl: string; model: string; maxTurns: number }): void {
    for (let i = 0; i < this.agents.length; i++) {
      const key = COMPARISON_KEYS[i]
      this.agents[i].setConfig({
        ...config,
        systemPrompt: COMPARISON_PROMPTS[key].prompt,
      })
    }
  }

  getState(): ComparisonState {
    return {
      columns: this.state.columns.map((c) => ({ ...c, messages: [...c.messages], steps: [...c.steps] })),
      isRunning: this.state.isRunning,
      userMessage: this.state.userMessage,
    }
  }

  /** Run all 3 agents in parallel with the same user message */
  async run(userMessage: string): Promise<void> {
    if (this.state.isRunning) return

    // Reset all agents
    for (const agent of this.agents) {
      agent.reset()
    }

    // Reset state
    const now = Date.now()
    this.state = {
      columns: COMPARISON_KEYS.map((key) => ({
        ...createColumnState(key),
        startTime: now,
      })),
      isRunning: true,
      userMessage,
    }
    this.emit()

    // Start all 3 agents and poll their states
    const promises = this.agents.map((agent, i) =>
      agent.run(userMessage).then(
        () => {
          this.state.columns[i] = {
            ...this.state.columns[i],
            ...syncColumnFromAgent(agent),
            isLoading: false,
            endTime: Date.now(),
          }
          this.emit()
        },
        (err) => {
          // If agent was explicitly stopped, sync what we have
          const agentState = agent.getState()
          this.state.columns[i] = {
            ...this.state.columns[i],
            messages: agentState.messages,
            steps: agentState.steps,
            isLoading: false,
            currentTurn: agentState.currentTurn,
            error: err instanceof Error ? err.message : '未知错误',
            endTime: Date.now(),
          }
          this.emit()
        },
      ),
    )

    // Start a polling interval to sync each agent's streaming state
    const pollInterval = setInterval(() => {
      let changed = false
      for (let i = 0; i < this.agents.length; i++) {
        const agentState = this.agents[i].getState()
        const col = this.state.columns[i]
        if (
          col.messages !== agentState.messages ||
          col.steps !== agentState.steps ||
          col.isLoading !== agentState.isLoading ||
          col.currentTurn !== agentState.currentTurn ||
          col.error !== agentState.error
        ) {
          this.state.columns[i] = {
            ...col,
            messages: agentState.messages,
            steps: agentState.steps,
            isLoading: agentState.isLoading,
            currentTurn: agentState.currentTurn,
            error: agentState.error,
          }
          changed = true
        }
      }
      if (changed) this.emit()
    }, 100)

    // Wait for all to finish
    await Promise.allSettled(promises)
    clearInterval(pollInterval)

    // Final sync
    for (let i = 0; i < this.agents.length; i++) {
      const agentState = this.agents[i].getState()
      this.state.columns[i] = {
        ...this.state.columns[i],
        messages: agentState.messages,
        steps: agentState.steps,
        isLoading: false,
        currentTurn: agentState.currentTurn,
        error: agentState.error,
        endTime: this.state.columns[i].endTime ?? Date.now(),
      }
    }
    this.state.isRunning = false
    this.emit()
  }

  /** Stop all or a specific agent */
  stop(index?: number): void {
    if (index !== undefined) {
      this.agents[index].stop()
      this.state.columns[index] = {
        ...this.state.columns[index],
        isLoading: false,
        endTime: this.state.columns[index].endTime ?? Date.now(),
      }
    } else {
      for (let i = 0; i < this.agents.length; i++) {
        this.agents[i].stop()
        this.state.columns[i] = {
          ...this.state.columns[i],
          isLoading: false,
          endTime: this.state.columns[i].endTime ?? Date.now(),
        }
      }
      this.state.isRunning = false
    }
    this.emit()
  }

  /** Reset all state */
  reset(): void {
    this.stop()
    for (const agent of this.agents) {
      agent.reset()
    }
    this.state = createComparisonState()
    this.emit()
  }

  private emit(): void {
    this.callbacks.onStateChange(this.getState())
  }
}

/** Extract column-relevant data from a LiveAgent */
function syncColumnFromAgent(agent: LiveAgent) {
  const s = agent.getState()
  return {
    messages: s.messages,
    steps: s.steps,
    currentTurn: s.currentTurn,
    error: s.error,
  }
}
