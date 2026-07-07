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

export interface OrchestrationOptions {
  /** Only these specialist ids participate. Omit => all specialists. */
  enabledExperts?: string[]
  /** Max parallel workers. 0 (default) => run all concurrently. */
  concurrency?: number
  /** Max LLM turns per specialist worker. */
  maxTurns?: number
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
  private usage: { promptTokens: number; completionTokens: number } = { promptTokens: 0, completionTokens: 0 }
  private usageCb: (u: { prompt_tokens?: number; completion_tokens?: number }) => void = () => {}

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
    this.usage = { promptTokens: 0, completionTokens: 0 }

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

  /** Run the real orchestration for a user task */
  async run(config: LLMConfig, task: string): Promise<void> {
    if (!this.roster || this.isRunning) return
    this.isRunning = true
    this.abort = new AbortController()
    this.timeline = []
    this.activeMessages = []
    this.statuses = {}
    this.usage = { promptTokens: 0, completionTokens: 0 }
    this.usageCb = (u) => {
      this.usage.promptTokens += u.prompt_tokens ?? 0
      this.usage.completionTokens += u.completion_tokens ?? 0
    }
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
        description: `${coordinator.name} 开始分析任务`,
      })
      this.setStatus(coordinator.id, 'thinking')

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
        // If some workers failed, still integrate what we have
      }

      // 3) Coordinator integrates results into final answer
      await this.runCoordinatorFinal(config, coordinator, task, results)
      this.setStatus(coordinator.id, 'completed')
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
        { onTextDelta: () => {}, onUsage: this.usageCb },
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
        tools: liveTools,
        maxTurns: this.maxTurns,
        signal: this.abort?.signal,
        onUsage: this.usageCb,
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
        onUsage: this.usageCb,
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

  private pushStep(nodeId: string, step: AgentStep): void {
    const node = this.liveScenario?.nodes.find((n) => n.id === nodeId)
    if (node) node.steps.push(step)
  }

  private record(event: Omit<MultiAgentEvent, 'id' | 'time'>): void {
    const full: MultiAgentEvent = { id: uid('ev'), time: ts(), ...event }
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
