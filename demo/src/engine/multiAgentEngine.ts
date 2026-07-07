// ============================================================
// Multi-Agent Simulation Engine
// State-driven playback with precomputed snapshots
// ============================================================

import type {
  MultiAgentScenario,
  MultiAgentEvent,
  MultiAgentSnapshot,
  MultiAgentEngineState,
  MultiAgentStatus,
  AgentMessage,
  HighlightedConnection,
} from './types'

/**
 * Deep-clone helper for plain objects (no Date, Map, etc.)
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

export class MultiAgentEngine {
  private scenario: MultiAgentScenario | null = null
  private snapshots: MultiAgentSnapshot[] = []
  private currentEventIndex = -1
  private isPlaying = false
  private playTimer: ReturnType<typeof setInterval> | null = null
  private onStateChange: (state: MultiAgentEngineState) => void

  constructor(opts: { onStateChange: (state: MultiAgentEngineState) => void }) {
    this.onStateChange = opts.onStateChange
  }

  // ============================================================
  // Public API
  // ============================================================

  /** Load a scenario and reset playback */
  loadScenario(scenario: MultiAgentScenario): void {
    this.stopPlay()
    this.scenario = scenario
    this.currentEventIndex = -1
    this.isPlaying = false
    this.snapshots = this.buildSnapshots(scenario)
    this.emit()
  }

  /** Go to the next step */
  next(): void {
    if (!this.scenario || this.currentEventIndex >= this.snapshots.length - 2) return
    this.currentEventIndex++
    this.emit()
  }

  /** Go to the previous step */
  prev(): void {
    if (this.currentEventIndex < 0) return
    this.currentEventIndex--
    this.emit()
  }

  /** Start auto-play with given interval (ms) */
  play(intervalMs = 2000): void {
    if (!this.scenario || this.isPlaying) return
    if (this.currentEventIndex >= this.snapshots.length - 1) {
      this.currentEventIndex = -1
    }
    this.isPlaying = true
    this.emit()

    this.playTimer = setInterval(() => {
      if (this.currentEventIndex >= this.snapshots.length - 2) {
        // Reached the end
        this.currentEventIndex = this.snapshots.length - 1
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

  /** Pause auto-play */
  pause(): void {
    this.stopPlay()
    this.isPlaying = false
    this.emit()
  }

  /** Reset to initial state */
  reset(): void {
    this.stopPlay()
    this.currentEventIndex = -1
    this.isPlaying = false
    this.emit()
  }

  /** Destroy the engine, clean up timers */
  destroy(): void {
    this.stopPlay()
    this.scenario = null
    this.snapshots = []
    this.currentEventIndex = -1
    this.isPlaying = false
  }

  /** Get current state (useful for external sync) */
  getState(): MultiAgentEngineState {
    return {
      scenarioId: this.scenario?.id ?? null,
      scenario: this.scenario ? deepClone(this.scenario) : null,
      currentSnapshot:
        this.currentEventIndex >= 0 && this.currentEventIndex < this.snapshots.length
          ? deepClone(this.snapshots[this.currentEventIndex])
          : null,
      currentEventIndex: this.currentEventIndex,
      totalEvents: this.snapshots.length,
      isPlaying: this.isPlaying,
    }
  }

  // ============================================================
  // Snapshot building
  // ============================================================

  private buildSnapshots(scenario: MultiAgentScenario): MultiAgentSnapshot[] {
    const snapshots: MultiAgentSnapshot[] = []

    // Snapshot 0: initial state (before any event)
    const initialStatuses: Record<string, MultiAgentStatus> = {}
    for (const node of scenario.nodes) {
      initialStatuses[node.id] = 'pending'
    }

    snapshots.push({
      nodeStatuses: deepClone(initialStatuses),
      activeMessages: [],
      highlightedConnections: [],
      currentEventIndex: -1,
      totalEvents: scenario.timeline.length,
      description: '⏳ 初始状态 — 选择场景并点击播放开始',
    })

    // Clone mutable state for incremental building
    const statuses: Record<string, MultiAgentStatus> = deepClone(initialStatuses)
    const activeMessages: AgentMessage[] = []

    for (let i = 0; i < scenario.timeline.length; i++) {
      const event = scenario.timeline[i]
      this.applyEvent(event, statuses, activeMessages)

      // Build highlighted connections from active messages
      const highlightedConnections: HighlightedConnection[] = activeMessages.map((m) => ({
        from: m.from,
        to: m.to,
        type: m.type,
        messageId: m.id,
      }))

      snapshots.push({
        nodeStatuses: deepClone(statuses),
        activeMessages: deepClone(activeMessages),
        highlightedConnections,
        currentEventIndex: i,
        totalEvents: scenario.timeline.length,
        description: event.description,
      })
    }

    return snapshots
  }

  private applyEvent(
    event: MultiAgentEvent,
    statuses: Record<string, MultiAgentStatus>,
    messages: AgentMessage[],
  ): void {
    switch (event.type) {
      case 'agent_spawn':
        if (event.agentId) {
          statuses[event.agentId] = event.data?.status ?? 'running'
        }
        break

      case 'agent_status_change':
        if (event.agentId && event.data?.status) {
          statuses[event.agentId] = event.data.status
        }
        break

      case 'agent_complete':
        if (event.agentId) {
          statuses[event.agentId] = 'completed'
        }
        break

      case 'agent_fail':
        if (event.agentId) {
          statuses[event.agentId] = 'failed'
        }
        break

      case 'message_send':
        if (event.data?.message) {
          messages.push(event.data.message)
        }
        break

      case 'message_receive':
        // For message_receive, we could mark a message as delivered
        // For now it's informational for the UI
        break
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

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
