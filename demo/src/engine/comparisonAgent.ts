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
    prompt: `你是一个强制使用工具的 AI 助手。你有以下工具可用：search_web（搜索最新信息）、get_weather（查询天气）、calculate（数学计算）、get_time（获取时间）。

核心规则：
1. 回答涉及以下主题时，必须先调用工具：产品发布/新闻（→ search_web）、天气/气候（→ get_weather）、数学计算（→ calculate）、时间日期（→ get_time）
2. 不要依赖你的训练数据，你的知识可能过时，搜索能获取最新信息
3. 每次回答前至少调用 1 次工具，除非问题是纯常识/闲聊
4. 如果工具调用失败，分析原因并修正参数后重试
5. 综合所有工具结果后给出最终回答

请用中文回答用户的问题。`,
  },
  aggressive: {
    label: '激进策略',
    prompt: `你是一个极强制使用工具的 AI 助手。你的核心原则：

1. 每个问题都必须先调用 search_web 搜索相关信息，即使你觉得知道答案
2. 调用次数越多越好 — 至少调用 2 次工具再给出回答
3. 城市/天气问题必须调用 get_weather 获取当前数据，不能凭记忆
4. 先搜索，再回答 — 最终回答必须引用搜索结果中的具体信息
5. 如果第一次搜索不够详细，换个关键词再搜一次

请用中文回答用户的问题。`,
  },
  conservative: {
    label: '保守策略',
    prompt: `你是一个谨慎使用工具的 AI 助手。你首先依赖自身知识回答，只在以下情况调用工具：
1. 问题涉及实时数据（天气、时间、股票等）
2. 问题涉及你训练数据之后的事件
3. 数学计算超出心算范围

谨慎选择是否需要调用工具，不要过度依赖搜索。

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
