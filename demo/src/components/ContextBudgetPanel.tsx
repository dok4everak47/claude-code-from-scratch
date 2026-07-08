// ============================================================
// ContextBudgetPanel — visualizes context-window fill, per-agent
// token breakdown, growth timeline, and the three-tier memory
// model mapping. Ties directly to the "三层分级记忆模型与动态
// 摘要缓存" claim on the resume.
// ============================================================

import type { MultiAgentScenario, ContextSample } from '@/engine/types'

interface ContextBudgetPanelProps {
  usage: { promptTokens: number; completionTokens: number }
  perAgentUsage: Record<string, { promptTokens: number; completionTokens: number }>
  contextTimeline: ContextSample[]
  contextWindowLimit: number
  scenario: MultiAgentScenario | null
}

/** Compression thresholds (fraction of the context window). */
const COMPRESS_WARN = 0.75
const COMPRESS_TRIGGER = 0.9

const AGENT_COLORS = [
  '#a78bfa', // violet-400
  '#60a5fa', // blue-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#f472b6', // pink-400
  '#22d3ee', // cyan-400
  '#fb923c', // orange-400
]

export function ContextBudgetPanel({
  usage,
  perAgentUsage,
  contextTimeline,
  contextWindowLimit,
  scenario,
}: ContextBudgetPanelProps) {
  const total = usage.promptTokens + usage.completionTokens
  const fillPct = contextWindowLimit > 0 ? Math.min(1, total / contextWindowLimit) : 0
  const fillPctRounded = Math.round(fillPct * 100)

  const nodeName = (id: string): string =>
    scenario?.nodes.find((n) => n.id === id)?.name ?? id

  const agentEntries = Object.entries(perAgentUsage)
    .map(([id, u]) => ({ id, name: nodeName(id), ...u, total: u.promptTokens + u.completionTokens }))
    .sort((a, b) => b.total - a.total)

  const maxAgentTotal = Math.max(1, ...agentEntries.map((a) => a.total))

  // Growth timeline: render up to 40 bars (downsample if more)
  const samples = contextTimeline
  const step = Math.max(1, Math.ceil(samples.length / 40))
  const bars = samples.filter((_, i) => i % step === 0).slice(-40)
  const maxCumulative = Math.max(1, ...samples.map((s) => s.cumulativeTotal))

  // Three-tier memory model mapping
  const recentSamples = samples.slice(-3)
  const immediateTokens = recentSamples.reduce((s, x) => s + x.promptTokens + x.completionTokens, 0)
  const workingTokens = total - immediateTokens
  const archiveTokens = fillPct > COMPRESS_WARN
    ? Math.round(total * (fillPct - COMPRESS_WARN))
    : 0

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/70 backdrop-blur-xl p-3 space-y-3 ring-1 ring-white/5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <span className="text-sm">📊</span> 上下文窗口预算
        </span>
        <span className="text-[10px] text-slate-500 font-mono">
          {formatK(total)} / {formatK(contextWindowLimit)} tok
        </span>
      </div>

      {/* Fill bar */}
      <div className="relative h-6 rounded-lg bg-slate-800/80 overflow-hidden ring-1 ring-white/5">
        <div
          className="h-full rounded-lg transition-all duration-500"
          style={{
            width: `${Math.max(2, fillPct * 100)}%`,
            background:
              fillPct >= COMPRESS_TRIGGER
                ? 'linear-gradient(90deg, #ef4444, #f97316)'
                : fillPct >= COMPRESS_WARN
                  ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                  : 'linear-gradient(90deg, #8b5cf6, #6366f1)',
          }}
        />
        {/* Threshold markers */}
        <ThresholdMark pct={COMPRESS_WARN} label="75%" />
        <ThresholdMark pct={COMPRESS_TRIGGER} label="90%" />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-semibold text-white/90 drop-shadow">
          {fillPctRounded}%
        </span>
      </div>

      {/* Compression status */}
      {fillPct >= COMPRESS_TRIGGER ? (
        <div className="text-[10px] text-red-400 flex items-center gap-1">
          <span>🔄</span> 已触发上下文压缩 — 早期对话已摘要归档（模拟）
        </div>
      ) : fillPct >= COMPRESS_WARN ? (
        <div className="text-[10px] text-amber-400 flex items-center gap-1">
          <span>⚠️</span> 即将触发动态摘要压缩（{Math.round((1 - fillPct) * 100)}% 余量）
        </div>
      ) : (
        <div className="text-[10px] text-emerald-400/70 flex items-center gap-1">
          <span>✓</span> 上下文充裕，无需压缩
        </div>
      )}

      {/* Per-agent breakdown */}
      {agentEntries.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            🧩 各 Agent 用量
          </div>
          {agentEntries.map((a, i) => (
            <div key={a.id} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 w-20 truncate text-right">{a.name}</span>
              <div className="flex-1 h-3 rounded bg-slate-800/60 overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-300"
                  style={{
                    width: `${(a.total / maxAgentTotal) * 100}%`,
                    backgroundColor: AGENT_COLORS[i % AGENT_COLORS.length],
                  }}
                />
              </div>
              <span className="text-[10px] text-slate-400 font-mono w-12 text-right">
                {formatK(a.total)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Growth timeline */}
      {bars.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            📈 上下文增长
          </div>
          <div className="flex items-end gap-[2px] h-12 bg-slate-800/30 rounded-lg p-1">
            {bars.map((s, i) => {
              const h = Math.max(2, (s.cumulativeTotal / maxCumulative) * 100)
              const agentIdx = agentEntries.findIndex((a) => a.id === s.agentId)
              return (
                <div
                  key={i}
                  className="flex-1 min-w-[2px] rounded-t transition-all duration-200"
                  style={{
                    height: `${h}%`,
                    backgroundColor: AGENT_COLORS[agentIdx >= 0 ? agentIdx : 0],
                    opacity: i === bars.length - 1 ? 1 : 0.7,
                  }}
                  title={`${nodeName(s.agentId)}: +${formatK(s.promptTokens + s.completionTokens)} → 累计 ${formatK(s.cumulativeTotal)}`}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Three-tier memory model */}
      <div className="space-y-1">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          🧠 三层分级记忆模型
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <MemoryTier
            label="即时上下文"
            sublabel="当前轮次"
            tokens={immediateTokens}
            color="#60a5fa"
          />
          <MemoryTier
            label="工作记忆"
            sublabel="活跃 Agent"
            tokens={workingTokens}
            color="#a78bfa"
          />
          <MemoryTier
            label="压缩归档"
            sublabel="摘要缓存"
            tokens={archiveTokens}
            color="#f472b6"
            dim={archiveTokens === 0}
          />
        </div>
      </div>
    </div>
  )
}

// ---- helpers ----

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function ThresholdMark({ pct, label }: { pct: number; label: string }) {
  return (
    <div
      className="absolute top-0 bottom-0 border-l border-dashed border-white/30"
      style={{ left: `${pct * 100}%` }}
    >
      <span className="absolute -top-0.5 -translate-x-1/2 text-[8px] text-white/50 font-mono whitespace-nowrap">
        {label}
      </span>
    </div>
  )
}

function MemoryTier({
  label,
  sublabel,
  tokens,
  color,
  dim = false,
}: {
  label: string
  sublabel: string
  tokens: number
  color: string
  dim?: boolean
}) {
  return (
    <div
      className={`rounded-lg p-2 text-center border ${dim ? 'border-slate-800/50 bg-slate-900/30' : 'border-slate-700/40 bg-slate-800/40'}`}
    >
      <div className="w-2 h-2 rounded-full mx-auto mb-1" style={{ backgroundColor: color, opacity: dim ? 0.3 : 1 }} />
      <div className={`text-[9px] font-semibold ${dim ? 'text-slate-600' : 'text-slate-300'}`}>{label}</div>
      <div className="text-[8px] text-slate-500 mb-0.5">{sublabel}</div>
      <div className={`text-[10px] font-mono ${dim ? 'text-slate-600' : 'text-slate-200'}`}>
        {formatK(tokens)}
      </div>
    </div>
  )
}
