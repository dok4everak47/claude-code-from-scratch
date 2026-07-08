// ============================================================
// ComparisonAgent — runs 3 LiveAgent instances in parallel
// with different system prompts for strategy comparison
// ============================================================

import { LiveAgent } from './liveAgent'
import { liveTools } from './liveTools'
import { streamChat, type LLMConfig } from './llm'
import type { AgentStep, LiveMessage } from './types'

// ---- 3 System Prompts ----

export const COMPARISON_PROMPTS: Record<string, { label: string; prompt: string }> = {
  default: {
    label: '默认策略',
    prompt: `你是一个强制使用工具的 AI 助手。你有以下工具可用：get_weather（查询天气）、calculate（数学计算）、get_time（获取时间）。

核心规则：
1. 天气/气候问题必须调用 get_weather 查询当前数据
2. 数学计算问题必须调用 calculate
3. 时间日期问题必须调用 get_time
4. 不要依赖你的训练数据，你的知识可能过时
5. 每次回答前优先考虑调用工具，除非问题是纯常识/闲聊

请用中文回答用户的问题。`,
  },
  aggressive: {
    label: '激进策略',
    prompt: `你是一个极强制使用工具的 AI 助手。你的核心原则：

1. 每个问题都必须尽可能调用工具，即使你觉得知道答案
2. 调用次数越多越好 — 至少调用 2 次工具再给出回答
3. 城市/天气问题必须调用 get_weather 获取当前数据，不能凭记忆
4. 先使用工具，再回答 — 最终回答必须引用工具结果中的具体信息
5. 如果一次工具调用不够详细，换个参数再试一次

请用中文回答用户的问题。`,
  },
  conservative: {
    label: '保守策略',
    prompt: `你是一个谨慎使用工具的 AI 助手。你首先依赖自身知识回答，只在以下情况调用工具：
1. 问题涉及实时数据（天气、时间等）
2. 问题涉及你训练数据之后的事件
3. 数学计算超出心算范围

谨慎选择是否需要调用工具，不要过度依赖工具。

请用中文回答用户的问题。`,
  },
}

export const COMPARISON_KEYS = ['default', 'aggressive', 'conservative'] as const
export type ComparisonKey = (typeof COMPARISON_KEYS)[number]

// ---- State ----

export interface ColumnMetrics {
  /** 工具调用次数 */
  toolCallCount: number
  /** 工具调用成功率（成功/总调用） */
  successRate: number
  /** 首次工具调用延迟（从 startTime 到第一个 tool_call 的时间差，秒） */
  firstToolLatency: number | null
  /** 总运行时长（秒） */
  totalDuration: number
  /** 总步骤数（thought + tool_call + response） */
  totalSteps: number
}

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
  metrics: ColumnMetrics | null
}

export interface ColumnVerdict {
  /** Strategy key */
  key: ComparisonKey
  /** Human label */
  label: string
  /** Answer relevance to the question, 1-5 */
  relevance: number
  /** Factual accuracy, 1-5 */
  accuracy: number
  /** Tool-use efficiency (did it call the right tools, not over/under), 1-5 */
  efficiency: number
  /** One-line comment */
  comment: string
}

export interface ComparisonVerdict {
  columns: ColumnVerdict[]
  /** Best overall strategy key, or null if no clear winner */
  winner: ComparisonKey | null
  /** 2-3 sentence conclusion */
  rationale: string
}

export interface ComparisonState {
  columns: ComparisonColumnState[]
  isRunning: boolean
  userMessage: string
  /** LLM judge verdict (null until a run completes with >=2 answers) */
  verdict: ComparisonVerdict | null
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
    metrics: null,
  }
}

export function createComparisonState(): ComparisonState {
  return {
    columns: COMPARISON_KEYS.map(createColumnState),
    isRunning: false,
    userMessage: '',
    verdict: null,
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
  private config: LLMConfig
  private stopped = false

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
    this.config = { ...config }
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
    this.config = { ...config }
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
      verdict: this.state.verdict,
    }
  }

  /** Run all 3 agents in parallel with the same user message */
  async run(userMessage: string): Promise<void> {
    if (this.state.isRunning) return

    this.stopped = false

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
      verdict: null,
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

    // Calculate metrics for each column
    for (let i = 0; i < this.state.columns.length; i++) {
      const col = this.state.columns[i]
      const toolSteps = col.steps.filter((s) => s.type === 'tool_call' && s.toolCall)
      const successCount = toolSteps.filter((s) => s.toolCall?.status === 'success').length
      const firstToolStep = toolSteps[0]

      col.metrics = {
        toolCallCount: toolSteps.length,
        successRate: toolSteps.length > 0 ? successCount / toolSteps.length : 1,
        firstToolLatency:
          firstToolStep && col.startTime
            ? (() => {
                const ts = new Date(firstToolStep.timestamp).getTime()
                return Number.isFinite(ts) ? (ts - col.startTime) / 1000 : null
              })()
            : null,
        totalDuration:
          col.endTime && col.startTime ? (col.endTime - col.startTime) / 1000 : 0,
        totalSteps: col.steps.length,
      }
    }

    // LLM judge — qualitative comparison (skip if the user stopped the run)
    if (!this.stopped && this.state.columns.filter((c) => c.steps.some((s) => s.type === 'response')).length >= 2) {
      try {
        this.state.verdict = await this.judge()
      } catch {
        this.state.verdict = null
      }
      this.emit()
    }

    this.state.isRunning = false
    this.emit()
  }

  /** Build a single LLM call that scores/compares the three final answers */
  private async judge(): Promise<ComparisonVerdict | null> {
    const answers = this.state.columns
      .filter((c) => !c.error && c.steps.some((s) => s.type === 'response'))
      .map((c) => ({
        key: c.key,
        label: c.label,
        text: c.steps.find((s) => s.type === 'response')?.content ?? '',
      }))
    if (answers.length < 2) return null

    const prompt = [
      '你是一个严格的 AI 回答质量评审员。同一个问题被多种策略的 Agent 分别回答，请对比评估它们的回答质量。',
      `原始问题：${this.state.userMessage}`,
      '',
      ...answers.map((a, i) => `[${i + 1}] ${a.label}\n${a.text}`),
      '',
      '请只输出一个 JSON 对象（不要使用 markdown 代码块），结构严格如下：',
      '{"columns":[{"key":"<策略key>","label":"<策略名>","relevance":<1-5整数>,"accuracy":<1-5整数>,"efficiency":<1-5整数>,"comment":"<一句话点评>"}, ...],"winner":"<综合最佳策略的key，若无明显最佳填 null>","rationale":"<2-3 句综合结论>"}',
      `可用的 key 仅限：${answers.map((a) => a.key).join('、')}`,
    ].join('\n')

    const { content } = await streamChat(
      this.config,
      [{ role: 'user', content: prompt }],
      [],
      {},
    )
    return parseVerdict(content, answers)
  }

  /** Stop all or a specific agent */
  stop(index?: number): void {
    this.stopped = true
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

/** Clamp an LLM-provided score to the 1-5 integer range */
function clampScore(v: unknown): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return 0
  return Math.max(1, Math.min(5, n))
}

/** Defensively parse the judge's JSON verdict */
function parseVerdict(
  raw: string,
  answers: { key: ComparisonKey; label: string }[],
): ComparisonVerdict | null {
  const stripped = raw.replace(/```json|```/g, '').trim()
  let parsed: any = null
  try {
    parsed = JSON.parse(stripped)
  } catch {
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        parsed = JSON.parse(m[0])
      } catch {
        return null
      }
    }
  }
  if (!parsed || !Array.isArray(parsed.columns)) return null

  const columns: ColumnVerdict[] = parsed.columns
    .filter((c: any) => answers.some((a) => a.key === c.key))
    .map((c: any) => ({
      key: c.key,
      label: c.label ?? answers.find((a) => a.key === c.key)?.label ?? c.key,
      relevance: clampScore(c.relevance),
      accuracy: clampScore(c.accuracy),
      efficiency: clampScore(c.efficiency),
      comment: typeof c.comment === 'string' ? c.comment : '',
    }))
  if (columns.length === 0) return null

  const winnerKey = parsed.winner
  const winner = answers.some((a) => a.key === winnerKey) ? (winnerKey as ComparisonKey) : null
  const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : ''
  return { columns, winner, rationale }
}
