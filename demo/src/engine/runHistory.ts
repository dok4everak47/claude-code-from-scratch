// ============================================================
// runHistory — persistent store for completed live orchestration runs.
// Saved to localStorage so a real run can be replayed / compared later
// (the in-memory engine timeline is lost on refresh otherwise).
// ============================================================

import type { MultiAgentScenario, MultiAgentEvent } from './types'
import type { Topology } from './orchestrationEngine'

export interface SavedRun {
  id: string
  savedAt: number
  scenarioId: string
  scenarioName: string
  topology: Topology
  task: string
  model: string
  usage: { promptTokens: number; completionTokens: number }
  scenario: MultiAgentScenario
  timeline: MultiAgentEvent[]
}

const KEY = 'multiagent-runs-v1'
const MAX = 30

export function loadRuns(): SavedRun[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function persist(runs: SavedRun[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(runs.slice(0, MAX)))
  } catch {
    // private mode / quota — silently ignore
  }
}

export function addRun(run: SavedRun): SavedRun[] {
  const next = [run, ...loadRuns()].slice(0, MAX)
  persist(next)
  return next
}

export function deleteRun(id: string): SavedRun[] {
  const next = loadRuns().filter((r) => r.id !== id)
  persist(next)
  return next
}

export function clearRuns(): SavedRun[] {
  persist([])
  return []
}

/** Pull the final coordinator answer out of a stored timeline. */
export function extractFinalAnswer(timeline: MultiAgentEvent[]): string {
  const toUser = timeline.filter(
    (e) => e.type === 'message_send' && (e.data?.message as any)?.to === 'user',
  )
  const last = toUser[toUser.length - 1] as any
  return last?.message?.content ?? ''
}
