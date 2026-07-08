// ============================================================
// OrchestrationEngine — REAL multi-agent runtime
// Coordinator (real LLM) decomposes a task and delegates to
// specialist agents via the delegate_to_agent tool. Specialists
// run concurrently (real LLM + real tools) and return results
// that the Coordinator integrates into a final answer.
// Emits the same MultiAgentEngineState shape as the scripted
// engine, so the existing 2D/3D visualization works unchanged.
// ============================================================

import type {
  MultiAgentScenario,
  MultiAgentEvent,
  MultiAgentSnapshot,
  MultiAgentEngineState,
  MultiAgentStatus,
  AgentMessage,
  AgentNode,
  AgentStep,
  HighlightedConnection,
  ContextSample,
  LiveToolDef,
} from './types'
import { liveTools } from './liveTools'
import { runAgentLoop, streamChat, type LLMConfig, type ChatMessage } from './llm'

// ---- helpers ----

function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
function ts(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}
function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}
function truncate(s: string, n = 48): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

/**
 * Run `fn` over `items` with at most `limit` in flight.
 * limit <= 0 => unbounded (equivalent to Promise.all).
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  if (items.length === 0) return results
  const effective = limit > 0 ? Math.min(limit, items.length) : items.length
  let cursor = 0
  const workers = new Array(effective).fill(0).map(async () => {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

export interface OrchestrationCallbacks {
  onStateChange: (state: MultiAgentEngineState) => void
}

/** Orchestration topology for a live run. */
export type Topology = 'fan-out' | 'debate' | 'pipeline' | 'dag'

export interface OrchestrationOptions {
  /** Only these specialist ids participate. Omit => all specialists. */
  enabledExperts?: string[]
  /** Max parallel workers. 0 (default) => run all concurrently. */
  concurrency?: number
  /** Max LLM turns per specialist worker. */
  maxTurns?: number
  /** Orchestration topology. Default 'fan-out'. */
  topology?: Topology
}

/** Fault-injection configuration for the Safety Net playground. */
export interface FaultConfig {
  /** Inject a transient tool failure on the first tool call of each specialist. */
  toolFailure?: boolean
  /** Override maxTurns per worker (set low to simulate hitting the turn limit). */
  forceMaxTurns?: number
}

export class OrchestrationEngine {
  private roster: MultiAgentScenario | null = null
  private liveScenario: MultiAgentScenario | null = null
  /** Nodes (coordinator + enabled specialists) currently in play. */
  private activeNodes: AgentNode[] = []
  private timeline: MultiAgentEvent[] = []
  private statuses: Record<string, MultiAgentStatus> = {}
  private activeMessages: AgentMessage[] = []
  private currentEventIndex = -1
  private isPlaying = false
  private isRunning = false
  private playTimer: ReturnType<typeof setInterval> | null = null
  private abort: AbortController | null = null
  private onStateChange: (state: MultiAgentEngineState) => void

  // run configuration
  private enabledExperts?: string[] = undefined
  private concurrency = 0
  private maxTurns = 4
  private topology: Topology = 'fan-out'
  private debateRounds = 2
  private usage: { promptTokens: number; completionTokens: number } = { promptTokens: 0, completionTokens: 0 }
  /** Per-agent token usage breakdown */
  private perAgentUsage: Record<string, { promptTokens: number; completionTokens: number }> = {}
  /** Timestamped usage samples for the context-growth timeline */
  private contextTimeline: ContextSample[] = []
  /** Monotonic counter for context samples */
  private contextSeq = 0
  /** Model context window limit (tokens) — default 128K (DeepSeek) */
  private contextWindowLimit = 131072
  /** Fault-injection config for the Safety Net playground */
  private faultConfig: FaultConfig = {}

  constructor(cb: OrchestrationCallbacks) {
    this.onStateChange = cb.onStateChange
  }

  // ============================================================
  // Public API
  // ============================================================

  /** Load a scenario template as the agent roster (no execution yet) */
  loadRoster(scenario: MultiAgentScenario, opts?: OrchestrationOptions): void {
    this.stopPlay()
    this.roster = scenario
    this.enabledExperts = opts?.enabledExperts
    this.concurrency = opts?.concurrency ?? 0
    this.maxTurns = opts?.maxTurns ?? 4
    this.topology = opts?.topology ?? 'fan-out'
    this.usage = { promptTokens: 0, completionTokens: 0 }
    this.perAgentUsage = {}
    this.contextTimeline = []
    this.contextSeq = 0

    const coordinator =
      scenario.nodes.find((n) => n.role === 'orchestrator') ?? scenario.nodes[0]
    const specialists = scenario.nodes.filter((n) => n.id !== coordinator.id)
    const enabled = specialists.filter(
      (s) => !this.enabledExperts || this.enabledExperts.includes(s.id),
    )
    this.activeNodes = [coordinator, ...enabled]

    this.liveScenario = this.buildLiveScenario(scenario, this.activeNodes)
    this.timeline = []
    this.statuses = {}
    this.activeMessages = []
    this.currentEventIndex = -1
    this.isPlaying = false
    this.isRunning = false
    for (const n of this.activeNodes) this.statuses[n.id] = 'pending'
    this.emit()
  }

  /** Set fault-injection config (Safety Net playground) */
  setFaultConfig(config: FaultConfig): void {
    this.faultConfig = { ...config }
  }

  /** Run the real orchestration for a user task */
  async run(config: LLMConfig, task: string): Promise<void> {
    if (!this.roster || this.isRunning) return
    this.isRunning = true
    this.abort = new AbortController()
    this.timeline = []
    this.activeMessages = []
    this.statuses = {}
    this.usage = { promptTokens: 0, completionTokens: 0 }
    this.perAgentUsage = {}
    this.contextTimeline = []
    this.contextSeq = 0
    for (const n of this.activeNodes) this.statuses[n.id] = 'pending'
    this.liveScenario = this.buildLiveScenario(this.roster, this.activeNodes)
    this.currentEventIndex = -1

    const coordinator =
      this.activeNodes.find((n) => n.role === 'orchestrator') ?? this.activeNodes[0]
    const specialists = this.activeNodes.filter((n) => n.id !== coordinator.id)

    this.emit()

    try {
      this.record({
        type: 'agent_spawn',
        agentId: coordinator.id,
        data: { status: 'running' },
        description: `${coordinator.name} 开始分析任务（${this.topologyName()}）`,
      })
      this.setStatus(coordinator.id, 'thinking')

      if (this.topology === 'debate') {
        await this.runDebate(config, coordinator, specialists, task)
      } else if (this.topology === 'pipeline') {
        await this.runPipeline(config, coordinator, specialists, task)
      } else if (this.topology === 'dag') {
        await this.runDag(config, coordinator, specialists, task)
      } else {
        await this.runFanOut(config, coordinator, specialists, task)
      }
      this.setStatus(coordinator.id, 'completed')
      // Safety net: a topology may leave a specialist in a transient state
      // (e.g. debate sets both debaters to 'waiting' during the judge phase).
      // Now that the run has finished, finalize any non-terminal specialist status.
      for (const n of specialists) {
        const s = this.statuses[n.id]
        if (s && s !== 'completed' && s !== 'failed') this.setStatus(n.id, 'completed')
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // user stopped — leave current partial state
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        this.record({
          type: 'agent_fail',
          agentId: coordinator.id,
          description: `编排失败：${msg}`,
        })
        this.setStatus(coordinator.id, 'failed')
      }
    } finally {
      this.isRunning = false
      this.currentEventIndex = this.timeline.length - 1
      this.emit()
    }
  }

  next(): void {
    if (this.isRunning) return
    if (this.currentEventIndex < this.timeline.length - 1) {
      this.currentEventIndex++
      this.emit()
    }
  }

  prev(): void {
    if (this.isRunning) return
    if (this.currentEventIndex < 0) return
    this.currentEventIndex--
    this.emit()
  }

  play(intervalMs = 2000): void {
    if (this.isRunning || !this.roster || this.isPlaying) return
    if (this.currentEventIndex >= this.timeline.length - 1) {
      this.currentEventIndex = -1
    }
    this.isPlaying = true
    this.emit()
    this.playTimer = setInterval(() => {
      if (this.currentEventIndex >= this.timeline.length - 1) {
        this.isPlaying = false
        if (this.playTimer) {
          clearInterval(this.playTimer)
          this.playTimer = null
        }
        this.emit()
        return
      }
      this.currentEventIndex++
      this.emit()
    }, intervalMs)
  }

  pause(): void {
    this.stopPlay()
    this.isPlaying = false
    this.emit()
  }

  stop(): void {
    this.abort?.abort()
    this.isRunning = false
    this.stopPlay()
  }

  reset(): void {
    this.stopPlay()
    if (this.roster) {
      this.liveScenario = this.buildLiveScenario(this.roster, this.activeNodes)
      this.timeline = []
      this.activeMessages = []
      this.statuses = {}
      this.usage = { promptTokens: 0, completionTokens: 0 }
      this.perAgentUsage = {}
      this.contextTimeline = []
      this.contextSeq = 0
      for (const n of this.activeNodes) this.statuses[n.id] = 'pending'
    }
    this.currentEventIndex = -1
    this.isPlaying = false
    this.isRunning = false
    this.emit()
  }

  destroy(): void {
    this.stopPlay()
    this.roster = null
    this.liveScenario = null
    this.timeline = []
    this.statuses = {}
    this.activeMessages = []
    this.currentEventIndex = -1
    this.isPlaying = false
    this.isRunning = false
  }

  /** Return a deep copy of the recorded event timeline (for persistence). */
  getTimeline(): MultiAgentEvent[] {
    return clone(this.timeline)
  }

  /**
   * Ask the LLM to analyze the completed run and produce optimization
   * insights (bottleneck analysis, redundant steps, token-saving tips).
   */
  async generateInsights(config: LLMConfig): Promise<string> {
    if (this.timeline.length === 0) return '暂无运行数据可分析'

    const systemPrompt = `你是一个 Agent 系统性能分析师。请分析以下多 Agent 运行记录，给出：
1. 运行概览（Agent 数量、轮次、工具调用、token 消耗）
2. 瓶颈分析（哪个 Agent 消耗最多、哪些步骤可能冗余）
3. 优化建议（如何减少 token、提高效率、改善协作）

请简洁、具体、可操作，用中文回答。`

    try {
      const result = await streamChat(
        config,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: this.buildRunSummary() },
        ],
        [],
        { onUsage: (u) => this.recordUsage('__insights__', u) },
        undefined,
      )
      return result.content || '（分析完成但无输出）'
    } catch (e) {
      return `分析失败：${e instanceof Error ? e.message : e}`
    }
  }

  /** Build a text summary of the current run for LLM analysis. */
  private buildRunSummary(): string {
    const lines: string[] = []
    lines.push(`拓扑: ${this.topologyName()}`)
    lines.push(`事件数: ${this.timeline.length}`)
    lines.push(`Token: 输入 ${this.usage.promptTokens} / 输出 ${this.usage.completionTokens}`)
    lines.push('')
    lines.push('各 Agent 统计:')
    for (const [agentId, u] of Object.entries(this.perAgentUsage)) {
      const node = this.roster?.nodes.find((n) => n.id === agentId)
      const steps = this.liveScenario?.nodes.find((n) => n.id === agentId)?.steps ?? []
      const toolCalls = steps.filter((s) => s.type === 'tool_call').length
      lines.push(
        `- ${node?.name ?? agentId}: ${steps.length} 步, ${toolCalls} 次工具调用, ${u.promptTokens + u.completionTokens} tok`,
      )
    }
    lines.push('')
    lines.push('事件时间线:')
    for (const ev of this.timeline) {
      lines.push(`  [${ev.time}] ${ev.description}`)
    }
    return lines.join('\n')
  }

  /**
   * Load a previously-saved run for offline replay. No LLM calls are made;
   * the visualization + playback controls operate purely on the stored timeline.
   */
  loadFromHistory(data: {
    scenario: MultiAgentScenario
    timeline: MultiAgentEvent[]
    usage: { promptTokens: number; completionTokens: number }
  }): void {
    this.stopPlay()
    this.roster = data.scenario
    this.activeNodes = data.scenario.nodes
    this.liveScenario = data.scenario
    this.timeline = clone(data.timeline)
    this.usage = { ...data.usage }
    this.perAgentUsage = {}
    this.contextTimeline = []
    this.contextSeq = 0
    this.statuses = {}
    for (const n of this.activeNodes) this.statuses[n.id] = 'pending'
    this.activeMessages = []
    this.currentEventIndex = this.timeline.length - 1
    this.isRunning = false
    this.isPlaying = false
    this.emit()
  }

  getState(): MultiAgentEngineState {
    return {
      scenarioId: this.liveScenario?.id ?? null,
      scenario: this.liveScenario ? clone(this.liveScenario) : null,
      currentSnapshot:
        this.liveScenario
          ? this.snapshotAt(this.currentEventIndex)
          : null,
      currentEventIndex: this.currentEventIndex,
      totalEvents: this.timeline.length,
      isPlaying: this.isPlaying,
      usage: { promptTokens: this.usage.promptTokens, completionTokens: this.usage.completionTokens },
      perAgentUsage: { ...this.perAgentUsage },
      contextTimeline: [...this.contextTimeline],
      contextWindowLimit: this.contextWindowLimit,
    }
  }

  // ============================================================
  // Internal: Coordinator delegation round
  // ============================================================

  private async runCoordinatorDelegation(
    config: LLMConfig,
    coordinator: AgentNode,
    specialists: AgentNode[],
    task: string,
  ): Promise<{ agentId: string; task: string }[]> {
    const specList = specialists
      .map((s) => `- ${s.id}: ${s.name} — ${s.description}`)
      .join('\n')

    const systemPrompt = `你是多 Agent 系统的【编排者】${coordinator.name}。
${coordinator.description}

可用专家（只能委派给以下 id）：
${specList}

请分析用户的任务，并使用 delegate_to_agent 工具把子任务委派给合适的专家。
- 每个专家调用一次 delegate_to_agent（可并行委派多个）。
- agent_id 必须严格是上面列出的 id 之一。
- task 要写清楚交给该专家的具体子任务。
如果任务很简单、无需拆分，也可以选择不委派。`

    const delegateTool: LiveToolDef = {
      name: 'delegate_to_agent',
      description: '把一个子任务委派给指定 id 的专家 Agent。',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: '目标专家 Agent 的 id（必须是可用专家之一）' },
          task: { type: 'string', description: '委派给该专家的具体子任务描述' },
        },
        required: ['agent_id', 'task'],
      },
      execute: async () => '已委派',
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task },
    ]

    let parsed: { id: string; name: string; arguments: string }[] = []
    try {
      const res = await streamChat(
        config,
        messages,
        [delegateTool],
        { onTextDelta: () => {}, onUsage: (u) => this.recordUsage(coordinator.id, u) },
        this.abort?.signal,
        { toolChoice: 'required' },
      )
      parsed = res.toolCalls ?? []
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      this.record({
        type: 'agent_fail',
        agentId: coordinator.id,
        description: `编排者委派阶段出错：${e instanceof Error ? e.message : e}`,
      })
      this.setStatus(coordinator.id, 'failed')
      return []
    }

    const delegations: { agentId: string; task: string }[] = []
    for (const tc of parsed) {
      try {
        const args = JSON.parse(tc.arguments || '{}')
        if (args.agent_id && specialists.some((s) => s.id === args.agent_id)) {
          delegations.push({ agentId: String(args.agent_id), task: String(args.task ?? '') })
          this.record({
            type: 'message_send',
            data: {
              message: {
                id: uid('m'),
                from: coordinator.id,
                to: String(args.agent_id),
                content: String(args.task ?? ''),
                type: 'delegate',
                timestamp: ts(),
              },
            },
            description: `委派给 ${args.agent_id}`,
          })
        }
      } catch { /* ignore malformed args */ }
    }
    return delegations
  }

  // ============================================================
  // Internal: Specialist worker execution
  // ============================================================

  private async runWorker(
    config: LLMConfig,
    coordinator: AgentNode,
    delegation: { agentId: string; task: string },
  ): Promise<{ agentId: string; content: string } | null> {
    const node = this.roster?.nodes.find((n) => n.id === delegation.agentId)
    if (!node) return null

    this.record({
      type: 'agent_spawn',
      agentId: node.id,
      data: { status: 'running' },
      description: `${node.name} 开始处理子任务`,
    })
    this.setStatus(node.id, 'running')

    const systemPrompt = `你是多 Agent 系统中的专家 Agent【${node.name}】。
角色：${node.description}

你收到了编排者委派的一个子任务。请独立、彻底地完成它，并给出简洁、可直接交给编排者整合的结果。
如果有助于完成任务，可以使用可用工具。`

    let finalText = ''
    try {
      finalText = await runAgentLoop({
        config,
        systemPrompt,
        task: delegation.task,
        tools: this.wrapToolsWithFault(liveTools, node.id, node.name),
        maxTurns: this.faultConfig.forceMaxTurns ?? this.maxTurns,
        signal: this.abort?.signal,
        onUsage: (u) => this.recordUsage(node.id, u),
        onToolStart: (tc) => {
          this.setStatus(node.id, 'using_tools')
          this.pushStep(node.id, {
            id: uid('step'),
            type: 'thought',
            content: `调用工具 ${tc.name}(${truncate(tc.arguments)})`,
            timestamp: ts(),
          })
          this.record({
            type: 'agent_status_change',
            agentId: node.id,
            data: { status: 'using_tools' },
            description: `${node.name} 使用工具 ${tc.name}`,
          })
        },
        onToolEnd: (tc) => {
          this.setStatus(node.id, 'thinking')
          this.pushStep(node.id, {
            id: uid('step'),
            type: 'tool_call',
            content: `${tc.name} → ${truncate(tc.result ?? tc.error ?? '', 120)}`,
            timestamp: ts(),
          })
        },
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      this.record({
        type: 'agent_fail',
        agentId: node.id,
        description: `${node.name} 出错：${e instanceof Error ? e.message : e}`,
      })
      this.setStatus(node.id, 'failed')
      return { agentId: node.id, content: '（执行失败）' }
    }

    this.pushStep(node.id, {
      id: uid('step'),
      type: 'response',
      content: finalText,
      timestamp: ts(),
    })
    this.record({
      type: 'agent_complete',
      agentId: node.id,
      description: `${node.name} 完成`,
    })
    this.setStatus(node.id, 'completed')
    this.record({
      type: 'message_send',
      data: {
        message: {
          id: uid('m'),
          from: node.id,
          to: coordinator.id,
          content: finalText,
          type: 'result',
          timestamp: ts(),
        },
      },
      description: `${node.name} 回传结果`,
    })
    return { agentId: node.id, content: finalText }
  }

  // ============================================================
  // Internal: Coordinator final integration
  // ============================================================

  private async runCoordinatorFinal(
    config: LLMConfig,
    coordinator: AgentNode,
    task: string,
    results: { agentId: string; content: string }[],
  ): Promise<void> {
    if (results.length === 0) return

    const resultText = results
      .map((r) => {
        const n = this.roster?.nodes.find((x) => x.id === r.agentId)
        return `【${n?.name ?? r.agentId}】\n${r.content}`
      })
      .join('\n\n')

    const systemPrompt = `你是多 Agent 系统的【编排者】${coordinator.name}。
${coordinator.description}

你已委派专家完成了子任务，下面是他们返回的结果。
请整合这些结果，针对用户最初的任务给出一份连贯、完整的最终答复。`

    const userMsg = `用户原始任务：
${task}

专家返回结果：
${resultText}

请输出最终整合答复。`

    let final = ''
    try {
      final = await runAgentLoop({
        config,
        systemPrompt,
        task: userMsg,
        tools: [],
        maxTurns: 4,
        signal: this.abort?.signal,
        onUsage: (u) => this.recordUsage(coordinator.id, u),
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      final = '（整合时出现错误，但各专家结果已完成。）'
    }

    this.pushStep(coordinator.id, {
      id: uid('step'),
      type: 'response',
      content: final,
      timestamp: ts(),
    })
    this.record({
      type: 'message_send',
      data: {
        message: {
          id: uid('m'),
          from: coordinator.id,
          to: 'user',
          content: final,
          type: 'response',
          timestamp: ts(),
        },
      },
      description: '编排者给出最终答复',
    })
  }

  // ============================================================
  // Internal: Fan-out topology (original behavior)
  // ============================================================

  private async runFanOut(
    config: LLMConfig,
    coordinator: AgentNode,
    specialists: AgentNode[],
    task: string,
  ): Promise<void> {
    // 1) Coordinator decides delegation
    const delegations = await this.runCoordinatorDelegation(config, coordinator, specialists, task)

    // 2) Specialists run (optionally with a concurrency limit)
    let results: { agentId: string; content: string }[] = []
    if (delegations.length === 0) {
      this.record({
        type: 'message_send',
        data: {
          message: {
            id: uid('m'),
            from: coordinator.id,
            to: 'user',
            content: '（编排者未委派，直接作答）',
            type: 'response',
            timestamp: ts(),
          },
        },
        description: '编排者选择直接作答',
      })
    } else {
      const settled = await mapWithConcurrency(
        delegations,
        this.concurrency,
        (d) => this.runWorker(config, coordinator, d),
      )
      results = settled.filter((r): r is { agentId: string; content: string } => r !== null)
    }

    // 3) Coordinator integrates results into final answer
    await this.runCoordinatorFinal(config, coordinator, task, results)
  }

  // ============================================================
  // Internal: Debate topology (two experts exchange rounds)
  // ============================================================

  private topologyName(): string {
    return this.topology === 'debate'
      ? '辩论模式'
      : this.topology === 'pipeline'
        ? '流水线模式'
        : this.topology === 'dag'
          ? 'DAG 拓扑模式'
          : '扇出模式'
  }

  private async runDebate(
    config: LLMConfig,
    coordinator: AgentNode,
    specialists: AgentNode[],
    task: string,
  ): Promise<void> {
    const debaters = specialists.length > 2 ? specialists.slice(0, 2) : specialists
    if (debaters.length < 2) {
      // Not enough participants — fall back to fan-out.
      await this.runFanOut(config, coordinator, specialists, task)
      return
    }
    const [a, b] = debaters
    const transcript: { speaker: string; text: string }[] = []

    this.record({
      type: 'agent_status_change',
      agentId: coordinator.id,
      data: { status: 'thinking' },
      description: `${coordinator.name} 组织辩论：${a.name} ⇄ ${b.name}`,
    })

    // Opening positions
    this.setStatus(a.id, 'thinking'); this.setStatus(b.id, 'waiting')
    const openA = await this.runDebaterTurn(config, a, task, transcript, `请就以下议题给出你的开场立场与论证：${task}`)
    transcript.push({ speaker: a.name, text: openA })
    this.pushStep(a.id, { id: uid('step'), type: 'response', content: openA, timestamp: ts() })
    this.record({ type: 'message_send', data: { message: { id: uid('m'), from: a.id, to: b.id, content: openA, type: 'response', timestamp: ts() } }, description: `${a.name} 开场立场` })
    this.setStatus(a.id, 'completed')

    this.setStatus(b.id, 'thinking'); this.setStatus(a.id, 'waiting')
    const openB = await this.runDebaterTurn(config, b, task, transcript, `这是 ${a.name} 的立场。请提出你的不同观点并给出论证（保持简洁）。`)
    transcript.push({ speaker: b.name, text: openB })
    this.pushStep(b.id, { id: uid('step'), type: 'response', content: openB, timestamp: ts() })
    this.record({ type: 'message_send', data: { message: { id: uid('m'), from: b.id, to: a.id, content: openB, type: 'question', timestamp: ts() } }, description: `${b.name} 反驳` })
    this.setStatus(b.id, 'completed')

    // Rounds of critique / rebuttal
    for (let r = 1; r <= this.debateRounds; r++) {
      this.setStatus(a.id, 'thinking'); this.setStatus(b.id, 'waiting')
      const rebA = await this.runDebaterTurn(config, a, task, transcript, `第 ${r} 轮：${b.name} 刚才反驳了你。请针对性地回应、捍卫或修正你的立场。`)
      transcript.push({ speaker: a.name, text: rebA })
      this.pushStep(a.id, { id: uid('step'), type: 'response', content: rebA, timestamp: ts() })
      this.record({ type: 'message_send', data: { message: { id: uid('m'), from: a.id, to: b.id, content: rebA, type: 'question', timestamp: ts() } }, description: `${a.name} 第${r}轮回应` })
      this.setStatus(a.id, 'completed')

      this.setStatus(b.id, 'thinking'); this.setStatus(a.id, 'waiting')
      const rebB = await this.runDebaterTurn(config, b, task, transcript, `第 ${r} 轮：${a.name} 作出了回应。请评估其论证并给出你的总结性观点。`)
      transcript.push({ speaker: b.name, text: rebB })
      this.pushStep(b.id, { id: uid('step'), type: 'response', content: rebB, timestamp: ts() })
      this.record({ type: 'message_send', data: { message: { id: uid('m'), from: b.id, to: a.id, content: rebB, type: 'question', timestamp: ts() } }, description: `${b.name} 第${r}轮总结` })
      this.setStatus(b.id, 'completed')
    }

    // Coordinator judges / synthesizes
    this.setStatus(a.id, 'waiting'); this.setStatus(b.id, 'waiting')
    await this.runCoordinatorJudge(config, coordinator, task, transcript.map((t) => `${t.speaker}：${t.text}`).join('\n\n'))
    // Both debaters have finished all their speaking turns — finalize them as completed
    // (otherwise they remain stuck on the 'waiting' label after the run ends).
    this.setStatus(a.id, 'completed')
    this.setStatus(b.id, 'completed')
  }

  private async runDebaterTurn(
    config: LLMConfig,
    debater: AgentNode,
    task: string,
    transcript: { speaker: string; text: string }[],
    instruction: string,
  ): Promise<string> {
    const transcriptText = transcript.length
      ? transcript.map((t) => `${t.speaker}：${t.text}`).join('\n\n')
      : '（尚无交锋记录）'
    const systemPrompt = `你是多 Agent 辩论系统中的专家【${debater.name}】。
角色：${debater.description}

你们正在就一个议题展开辩论，目标是逼近更优结论。以下是目前的交锋记录：
${transcriptText}

你的任务：${instruction}
要求：有理有据、立场鲜明、简洁（不超过 300 字）。`

    try {
      return await runAgentLoop({
        config,
        systemPrompt,
        task: `议题：${task}`,
        tools: liveTools,
        maxTurns: Math.min(this.maxTurns, 3),
        signal: this.abort?.signal,
        onUsage: (u) => this.recordUsage(debater.id, u),
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      this.record({ type: 'agent_fail', agentId: debater.id, description: `${debater.name} 辩论出错：${e instanceof Error ? e.message : e}` })
      this.setStatus(debater.id, 'failed')
      return '（发言失败）'
    }
  }

  private async runCoordinatorJudge(
    config: LLMConfig,
    coordinator: AgentNode,
    task: string,
    transcriptText: string,
  ): Promise<void> {
    const systemPrompt = `你是多 Agent 系统的【编排者 / 裁判】${coordinator.name}。
${coordinator.description}

两位专家就议题展开了辩论，以下是完整交锋记录：
${transcriptText}

请作为裁判整合双方论点，给出一份连贯、平衡、面向用户的最终答复（可指出双方优劣、给出你的结论）。`

    const userMsg = `用户原始议题：\n${task}\n\n请输出最终整合答复。`
    let final = ''
    try {
      final = await runAgentLoop({
        config,
        systemPrompt,
        task: userMsg,
        tools: [],
        maxTurns: 4,
        signal: this.abort?.signal,
        onUsage: (u) => this.recordUsage(coordinator.id, u),
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      final = '（裁判阶段出错，但辩论记录已完成。）'
    }
    this.pushStep(coordinator.id, { id: uid('step'), type: 'response', content: final, timestamp: ts() })
    this.record({
      type: 'message_send',
      data: {
        message: { id: uid('m'), from: coordinator.id, to: 'user', content: final, type: 'response', timestamp: ts() },
      },
      description: '编排者给出最终裁定',
    })
  }

  // ============================================================
  // Internal: Pipeline topology (sequential specialists)
  // ============================================================

  private async runPipeline(
    config: LLMConfig,
    coordinator: AgentNode,
    specialists: AgentNode[],
    task: string,
  ): Promise<void> {
    if (specialists.length === 0) {
      await this.runCoordinatorFinal(config, coordinator, task, [])
      return
    }
    const results: { agentId: string; content: string }[] = []
    let acc = ''
    for (let i = 0; i < specialists.length; i++) {
      const sp = specialists[i]
      const stageTask =
        i === 0
          ? task
          : `${task}\n\n——前序环节产出（请在其基础上继续）——
${acc}`
      this.record({
        type: 'agent_status_change',
        agentId: coordinator.id,
        data: { status: 'thinking' },
        description: `${coordinator.name} 流水线第 ${i + 1}/${specialists.length} 环：${sp.name}`,
      })
      const out = await this.runWorker(config, coordinator, { agentId: sp.id, task: stageTask })
      if (out) {
        results.push(out)
        acc += `\n【${sp.name}】\n${out.content}\n`
      }
    }
    await this.runCoordinatorFinal(config, coordinator, task, results)
  }

  // ============================================================
  // Internal: DAG topology (dependency-graph-driven execution)
  // ============================================================

  private async runDag(
    config: LLMConfig,
    coordinator: AgentNode,
    specialists: AgentNode[],
    task: string,
  ): Promise<void> {
    if (specialists.length === 0) {
      await this.runCoordinatorFinal(config, coordinator, task, [])
      return
    }

    const graph = this.roster?.graph ?? {}
    // Build dependency sets (only among specialists; coordinator is the root/sink)
    const deps = new Map<string, string[]>()
    for (const sp of specialists) {
      const raw = graph[sp.id] ?? []
      deps.set(
        sp.id,
        raw.filter((d) => specialists.some((s) => s.id === d)),
      )
    }

    const completed = new Set<string>()
    const results: { agentId: string; content: string }[] = []
    let wave = 0

    this.record({
      type: 'agent_status_change',
      agentId: coordinator.id,
      data: { status: 'thinking' },
      description: `${coordinator.name} 按 DAG 依赖图调度（${specialists.length} 个专家）`,
    })

    while (completed.size < specialists.length) {
      // Find specialists whose deps are all satisfied
      const ready = specialists.filter(
        (sp) =>
          !completed.has(sp.id) &&
          (deps.get(sp.id) ?? []).every((d) => completed.has(d)),
      )

      if (ready.length === 0) {
        this.record({
          type: 'agent_fail',
          agentId: coordinator.id,
          description: '⚠️ DAG 死锁：检测到循环依赖或无法满足的依赖',
        })
        break
      }

      wave++
      const readyNames = ready.map((s) => s.name).join(', ')
      this.record({
        type: 'agent_status_change',
        agentId: coordinator.id,
        data: { status: 'thinking' },
        description: `DAG 第 ${wave} 波：${readyNames} 开始（依赖已满足）`,
      })

      const waveResults = await mapWithConcurrency(
        ready,
        this.concurrency,
        async (sp) => {
          // Inject dependency outputs into the task
          const depIds = deps.get(sp.id) ?? []
          const depResults = depIds
            .map((d) => {
              const r = results.find((x) => x.agentId === d)
              const n = this.roster?.nodes.find((x) => x.id === d)
              return r ? `【${n?.name ?? d}】\n${r.content}` : null
            })
            .filter(Boolean)

          const taskWithDeps =
            depResults.length > 0
              ? `${task}\n\n——前序依赖产出（请在其基础上继续）——\n${depResults.join('\n\n')}`
              : task

          const out = await this.runWorker(config, coordinator, {
            agentId: sp.id,
            task: taskWithDeps,
          })
          if (out) {
            results.push(out)
            completed.add(sp.id)
          }
          return out
        },
      )

      // Mark any that didn't produce output as completed to avoid deadlock
      for (let i = 0; i < ready.length; i++) {
        if (!waveResults[i]) completed.add(ready[i].id)
      }
    }

    this.record({
      type: 'agent_status_change',
      agentId: coordinator.id,
      data: { status: 'thinking' },
      description: `DAG 全部 ${wave} 波完成，开始整合结果`,
    })

    await this.runCoordinatorFinal(config, coordinator, task, results)
  }

  // ============================================================
  // Internal: state recording + snapshot
  // ============================================================

  private buildLiveScenario(r: MultiAgentScenario, nodes: AgentNode[]): MultiAgentScenario {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      nodes: nodes.map((n) => ({ ...n, steps: [], messages: [] })),
      timeline: [],
    }
  }

  private setStatus(id: string, status: MultiAgentStatus): void {
    this.statuses[id] = status
    this.record({
      type: 'agent_status_change',
      agentId: id,
      data: { status },
      description: `${id} → ${status}`,
    })
  }

  /**
   * Record a token-usage sample from an LLM call.
   * Accumulates into the aggregate total, the per-agent breakdown,
   * and pushes a timestamped sample onto the context-growth timeline.
   */
  private recordUsage(
    agentId: string,
    u: { prompt_tokens?: number; completion_tokens?: number },
  ): void {
    const pt = u.prompt_tokens ?? 0
    const ct = u.completion_tokens ?? 0
    if (pt === 0 && ct === 0) return
    this.usage.promptTokens += pt
    this.usage.completionTokens += ct
    const prev = this.perAgentUsage[agentId] ?? { promptTokens: 0, completionTokens: 0 }
    this.perAgentUsage[agentId] = {
      promptTokens: prev.promptTokens + pt,
      completionTokens: prev.completionTokens + ct,
    }
    this.contextTimeline.push({
      time: ts(),
      agentId,
      seq: this.contextSeq++,
      promptTokens: pt,
      completionTokens: ct,
      cumulativeTotal: this.usage.promptTokens + this.usage.completionTokens,
    })
    this.emit()
  }

  /**
   * Wrap tools so the first call throws a simulated transient error.
   * The agent loop's safety net catches the error, feeds it back to the
   * LLM, and the LLM retries — demonstrating recovery.
   */
  private wrapToolsWithFault(tools: LiveToolDef[], agentId: string, agentName: string): LiveToolDef[] {
    if (!this.faultConfig.toolFailure) return tools
    let failed = false
    return tools.map((t) => ({
      ...t,
      execute: async (args: Record<string, unknown>) => {
        if (!failed) {
          failed = true
          this.record({
            type: 'agent_fail',
            agentId,
            description: `⚠️ [故障注入] ${agentName} 调用 ${t.name} 失败（模拟：网络超时）`,
          })
          this.pushStep(agentId, {
            id: uid('step'),
            type: 'tool_call',
            content: `${t.name} → ❌ 模拟故障：网络超时`,
            timestamp: ts(),
          })
          throw new Error('模拟故障：工具执行超时（网络不可达），请重试或换用其他方式')
        }
        return t.execute(args)
      },
    }))
  }

  private pushStep(nodeId: string, step: AgentStep): void {
    const node = this.liveScenario?.nodes.find((n) => n.id === nodeId)
    if (node) node.steps.push(step)
  }

  private record(event: Omit<MultiAgentEvent, 'id' | 'time' | 'ms'>): void {
    const full: MultiAgentEvent = { id: uid('ev'), time: ts(), ms: Date.now(), ...event }
    this.timeline.push(full)
    this.applyEvent(full, this.statuses, this.activeMessages)
    this.currentEventIndex = this.timeline.length - 1
    this.emit()
  }

  private applyEvent(
    event: MultiAgentEvent,
    statuses: Record<string, MultiAgentStatus>,
    messages: AgentMessage[],
  ): void {
    switch (event.type) {
      case 'agent_spawn':
        if (event.agentId) statuses[event.agentId] = event.data?.status ?? 'running'
        break
      case 'agent_status_change':
        if (event.agentId && event.data?.status) statuses[event.agentId] = event.data.status
        break
      case 'agent_complete':
        if (event.agentId) statuses[event.agentId] = 'completed'
        break
      case 'agent_fail':
        if (event.agentId) statuses[event.agentId] = 'failed'
        break
      case 'message_send':
        if (event.data?.message) messages.push(event.data.message)
        break
      case 'message_receive':
        break
    }
  }

  private snapshotAt(index: number): MultiAgentSnapshot {
    const statuses: Record<string, MultiAgentStatus> = {}
    for (const n of this.roster?.nodes ?? []) statuses[n.id] = 'pending'
    const messages: AgentMessage[] = []

    const upto = index < 0 ? -1 : Math.min(index, this.timeline.length - 1)
    for (let i = 0; i <= upto; i++) {
      this.applyEvent(this.timeline[i], statuses, messages)
    }

    const highlightedConnections: HighlightedConnection[] = messages.map((m) => ({
      from: m.from,
      to: m.to,
      type: m.type,
      messageId: m.id,
    }))

    const description =
      upto >= 0
        ? this.timeline[upto].description
        : this.isRunning
          ? '⏳ 编排运行中…'
          : '⏳ 已加载花名册 — 点击「真实运行」开始'

    return {
      nodeStatuses: statuses,
      activeMessages: messages,
      highlightedConnections,
      currentEventIndex: upto,
      totalEvents: this.timeline.length,
      description,
    }
  }

  private stopPlay(): void {
    if (this.playTimer) {
      clearInterval(this.playTimer)
      this.playTimer = null
    }
  }

  private emit(): void {
    this.onStateChange(this.getState())
  }
}
