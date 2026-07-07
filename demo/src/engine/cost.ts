// ============================================================
// Cost estimation for the real orchestration runtime.
// Prices are USD per 1M tokens (input / output), approximate
// and meant for a rough pre-run budget hint — NOT a billing
// system. Adjust the table as models/prices change.
// ============================================================

export interface ModelPricing {
  /** USD per 1M input tokens */
  in: number
  /** USD per 1M output tokens */
  out: number
}

// keyed by substring match (lowercased) against the model id
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'deepseek-v4-flash': { in: 0.13, out: 0.55 },
  'deepseek-chat': { in: 0.27, out: 1.1 },
  'deepseek-reasoner': { in: 0.55, out: 2.19 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4-turbo': { in: 10, out: 30 },
  'gpt-3.5-turbo': { in: 0.5, out: 1.5 },
  'o3-mini': { in: 1.1, out: 4.4 },
  'o1-mini': { in: 1.1, out: 4.4 },
  'o1': { in: 15, out: 60 },
  'claude-3-5-sonnet': { in: 3, out: 15 },
  'claude-3-5-haiku': { in: 0.8, out: 4 },
  'claude-3-opus': { in: 15, out: 75 },
  'qwen': { in: 0.4, out: 1.2 },
  'gemini-1.5-pro': { in: 1.25, out: 5 },
  'gemini-1.5-flash': { in: 0.075, out: 0.3 },
}

export const USD_TO_CNY = 7.2

/** Fuzzy-match a model id to a pricing entry; fall back to a conservative default. */
export function getModelPricing(model: string): ModelPricing {
  const m = model.toLowerCase()
  for (const key of Object.keys(MODEL_PRICING)) {
    if (m.includes(key)) return MODEL_PRICING[key]
  }
  return { in: 1, out: 3 }
}

export interface RunEstimate {
  calls: number
  promptTokens: number
  completionTokens: number
}

/**
 * Rough pre-run token estimate.
 * Model: Coordinator delegates (1 call) + each enabled specialist runs up to
 * `maxTurns` calls + Coordinator integrates (~2 calls). Context grows with turns.
 */
export function estimateRunTokens(
  expertCount: number,
  maxTurns: number,
): RunEstimate {
  const turns = Math.max(1, maxTurns)
  const calls = 1 + expertCount * turns + 2
  const promptTokens = Math.round(calls * 600 + expertCount * turns * 250)
  const completionTokens = Math.round(calls * 350)
  return { calls, promptTokens, completionTokens }
}

export function estimateRunCostUSD(
  model: string,
  expertCount: number,
  maxTurns: number,
): number {
  const { promptTokens, completionTokens } = estimateRunTokens(expertCount, maxTurns)
  const p = getModelPricing(model)
  return (promptTokens / 1e6) * p.in + (completionTokens / 1e6) * p.out
}

/** Format a USD amount as a CNY string (rough). */
export function formatCostCNY(usd: number): string {
  const cny = usd * USD_TO_CNY
  if (cny < 0.01) return '¥0.01 内'
  return `¥${cny.toFixed(2)}`
}
