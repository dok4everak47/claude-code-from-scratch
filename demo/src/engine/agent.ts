// ============================================================
// AgentLoop Simulator — time-sliced scenario playback
// ============================================================

import type { AgentState, Scenario } from './types'

/** Callbacks that the simulator invokes on state changes */
export interface AgentCallbacks {
  onStateChange: (state: AgentState) => void
}

/** Default initial state */
export function createInitialState(): AgentState {
  return {
    scenarioId: null,
    currentStepIndex: -1,
    isPlaying: false,
    scenario: null,
  }
}

export class AgentLoop {
  private state: AgentState
  private callbacks: AgentCallbacks
  private autoPlayTimer: ReturnType<typeof setInterval> | null = null

  constructor(callbacks: AgentCallbacks) {
    this.state = createInitialState()
    this.callbacks = callbacks
  }

  getState(): AgentState {
    return { ...this.state }
  }

  /** Load a scenario and reset playback */
  loadScenario(scenario: Scenario): void {
    this.pause()
    this.state = {
      scenarioId: scenario.id,
      currentStepIndex: -1,
      isPlaying: false,
      scenario,
    }
    this.emit()
  }

  /** Advance to the next step. Returns false if already at the end. */
  next(): boolean {
    if (!this.state.scenario) return false
    const maxIndex = this.state.scenario.steps.length - 1
    if (this.state.currentStepIndex >= maxIndex) {
      // Already at end
      if (this.state.isPlaying) {
        this.pause()
      }
      return false
    }
    this.state = {
      ...this.state,
      currentStepIndex: this.state.currentStepIndex + 1,
    }
    // Auto-pause at end
    if (this.state.currentStepIndex >= maxIndex && this.state.isPlaying) {
      this.state = { ...this.state, isPlaying: false }
    }
    this.emit()
    return true
  }

  /** Go back to the previous step. Returns false if already at the start. */
  prev(): boolean {
    if (this.state.currentStepIndex <= -1) return false
    const wasPlaying = this.state.isPlaying
    if (wasPlaying) this.pauseInternal()
    this.state = {
      ...this.state,
      currentStepIndex: this.state.currentStepIndex - 1,
      isPlaying: false,
    }
    this.emit()
    return true
  }

  /** Start auto-play (advances one step every `intervalMs` ms) */
  play(intervalMs: number = 2000): void {
    if (!this.state.scenario) return
    const maxIndex = this.state.scenario.steps.length - 1
    if (this.state.currentStepIndex >= maxIndex) return

    this.state = { ...this.state, isPlaying: true }
    this.emit()

    this.autoPlayTimer = setInterval(() => {
      if (!this.state.isPlaying) {
        this.stopTimer()
        return
      }
      const advanced = this.next()
      if (!advanced) {
        this.stopTimer()
      }
    }, intervalMs)
  }

  /** Pause auto-play */
  pause(): void {
    this.pauseInternal()
    this.emit()
  }

  /** Reset to the beginning of the current scenario */
  reset(): void {
    this.pauseInternal()
    this.state = {
      ...this.state,
      currentStepIndex: -1,
      isPlaying: false,
    }
    this.emit()
  }

  /** Clean up resources */
  destroy(): void {
    this.stopTimer()
  }

  // ---- internal helpers ----

  private pauseInternal(): void {
    this.stopTimer()
    this.state = { ...this.state, isPlaying: false }
  }

  private stopTimer(): void {
    if (this.autoPlayTimer !== null) {
      clearInterval(this.autoPlayTimer)
      this.autoPlayTimer = null
    }
  }

  private emit(): void {
    this.callbacks.onStateChange(this.getState())
  }
}
