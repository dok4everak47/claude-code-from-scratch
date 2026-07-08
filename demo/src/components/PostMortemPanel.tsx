// ============================================================
// PostMortemPanel — run post-mortem analysis panel.
// Combines:
//   B1: run summary stats + per-agent breakdown + LLM insights
//   B2: trace waterfall (event timeline with time deltas)
//   B3: export (JSON download + print)
// ============================================================

import { useState } from 'react'
import type { MultiAgentEvent, MultiAgentScenario } from '@/engine/types'
import type { Topology } from '@/engine/orchestrationEngine'
import { formatCostCNY, estimateUsageCostUSD } from '@/engine/cost'

interface PostMortemPanelProps {
  timeline: MultiAgentEvent[]
  perAgentUsage: Record<string, { promptTokens: number; completionTokens: number }>
  usage: { promptTokens: number; completionTokens: number }
  scenario: MultiAgentScenario | null
  topology: Topology
  model: string
  onGenerateInsights: () => void
  insights: string | null
  isGenerating: boolean
}

const AGENT_PALETTE = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#fb923c']

export function PostMortemPanel({
  timeline,
  perAgentUsage,
  usage,
  scenario,
  topology,
  model,
  onGenerateInsights,
  insights,
  isGenerating,
}: PostMortemPanelProps) {
  const [showTrace, setShowTrace] = useState(false)

  const nodeName = (id: string): string =>
    scenario?.nodes.find((n) => n.id === id)?.name ?? id

  // Compute stats
  const totalEvents = timeline.length
  const toolCallEvents = timeline.filter(
    (e) => e.type === 'agent_status_change' && e.data?.status === 'using_tools',
  ).length
  const totalTokens = usage.promptTokens + usage.completionTokens
  const costUSD = estimateUsageCostUSD(model, usage.promptTokens, usage.completionTokens)

  const agentEntries = Object.entries(perAgentUsage)
    .filter(([id]) => id !== '__insights__')
    .map(([id, u]) => {
      const steps = scenario?.nodes.find((n) => n.id === id)?.steps ?? []
      const toolCalls = steps.filter((s) => s.type === 'tool_call').length
      return {
        id,
        name: nodeName(id),
        steps: steps.length,
        toolCalls,
        promptTokens: u.promptTokens,
        completionTokens: u.completionTokens,
        total: u.promptTokens + u.completionTokens,
      }
    })
    .sort((a, b) => b.total - a.total)

  // Compute time deltas for trace
  const traceRows = timeline
    .filter((e) => e.ms != null)
    .map((e, i, arr) => {
      const prev = i > 0 ? arr[i - 1] : null
      const delta = prev && prev.ms != null && e.ms != null ? e.ms - prev.ms : 0
      return { event: e, delta, prevMs: prev?.ms ?? e.ms }
    })

  const maxDelta = Math.max(1, ...traceRows.map((r) => r.delta))
  const totalTime =
    timeline.length > 1 && timeline[0].ms != null && timeline[timeline.length - 1].ms != null
      ? timeline[timeline.length - 1].ms! - timeline[0].ms!
      : 0

  const slowestGap = traceRows.reduce(
    (max, r) => (r.delta > max.delta ? r : max),
    { delta: 0, event: timeline[0], prevMs: 0 },
  )

  // Export JSON
  const handleExportJSON = () => {
    const data = {
      model,
      topology,
      usage,
      perAgentUsage,
      timeline,
      scenario: scenario
        ? {
            id: scenario.id,
            name: scenario.name,
            nodes: scenario.nodes.map((n) => ({
              id: n.id,
              name: n.name,
              role: n.role,
              steps: n.steps,
            })),
          }
        : null,
      insights,
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agent-run-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/70 backdrop-blur-xl p-3 space-y-3 ring-1 ring-white/5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <span className="text-sm">📋</span> 运行复盘
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleExportJSON}
            className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors"
            title="导出运行数据为 JSON"
          >
            ⬇ JSON
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors"
            title="打印复盘报告"
          >
            🖨 打印
          </button>
        </div>
      </div>

      {/* Summary stats grid */}
      <div className="grid grid-cols-4 gap-1.5">
        <StatCard label="事件" value={String(totalEvents)} />
        <StatCard label="工具调用" value={String(toolCallEvents)} />
        <StatCard label="Token" value={formatK(totalTokens)} />
        <StatCard label="成本" value={formatCostCNY(costUSD)} />
      </div>

      {/* Total time */}
      {totalTime > 0 && (
        <div className="text-[10px] text-slate-500 text-center">
          总耗时 {(totalTime / 1000).toFixed(1)}s · 最慢间隙{' '}
          <span className="text-amber-400">{(slowestGap.delta / 1000).toFixed(1)}s</span>
          {slowestGap.event && (
            <span className="text-slate-600">（{slowestGap.event.description}）</span>
          )}
        </div>
      )}

      {/* Per-agent breakdown */}
      {agentEntries.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            🧩 各 Agent 表现
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="border-b border-slate-700/30 text-slate-500">
                  <th className="text-left py-0.5 pr-2">Agent</th>
                  <th className="text-center py-0.5 px-1">步骤</th>
                  <th className="text-center py-0.5 px-1">工具</th>
                  <th className="text-center py-0.5 px-1">Token</th>
                </tr>
              </thead>
              <tbody>
                {agentEntries.map((a, i) => (
                  <tr key={a.id} className="border-b border-slate-800/40 last:border-0">
                    <td className="py-0.5 pr-2 text-slate-300">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                        style={{ backgroundColor: AGENT_PALETTE[i % AGENT_PALETTE.length] }}
                      />
                      {a.name}
                    </td>
                    <td className="text-center py-0.5 px-1 font-mono text-slate-400">{a.steps}</td>
                    <td className="text-center py-0.5 px-1 font-mono text-slate-400">{a.toolCalls}</td>
                    <td className="text-center py-0.5 px-1 font-mono text-slate-300">{formatK(a.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trace waterfall toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowTrace((v) => !v)}
          className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-400 transition-colors"
        >
          {showTrace ? '▾' : '▸'} 📈 Trace 瀑布图
        </button>
        {showTrace && traceRows.length > 0 && (
          <div className="mt-1.5 space-y-0.5 max-h-48 overflow-y-auto">
            {traceRows.map((r, i) => {
              const isSlow = r.delta > 2000
              const agentColor =
                AGENT_PALETTE[
                  agentEntries.findIndex((a) => a.id === r.event.agentId) >= 0
                    ? agentEntries.findIndex((a) => a.id === r.event.agentId)
                    : 0
                ]
              return (
                <div key={i} className="flex items-center gap-1.5 text-[9px]">
                  <span className="text-slate-600 font-mono w-14 truncate">{r.event.time}</span>
                  <div className="flex-1 h-2.5 bg-slate-800/40 rounded relative overflow-hidden">
                    <div
                      className="h-full rounded transition-all"
                      style={{
                        width: `${Math.max(1, (r.delta / maxDelta) * 100)}%`,
                        backgroundColor: isSlow ? '#f59e0b' : agentColor,
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <span
                    className={`font-mono w-10 text-right ${
                      isSlow ? 'text-amber-400' : 'text-slate-500'
                    }`}
                  >
                    {r.delta > 0 ? `${(r.delta / 1000).toFixed(1)}s` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* LLM insights */}
      <div className="space-y-1.5 border-t border-slate-700/30 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            🤖 AI 复盘分析
          </span>
          <button
            type="button"
            onClick={onGenerateInsights}
            disabled={isGenerating}
            className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30 transition-colors disabled:opacity-50"
          >
            {isGenerating ? (
              <span className="flex items-center gap-1">
                <span className="spin inline-block w-2 h-2 border border-violet-300/30 border-t-violet-300 rounded-full" />
                分析中…
              </span>
            ) : insights ? (
              '🔄 重新分析'
            ) : (
              '▶ 生成分析'
            )}
          </button>
        </div>
        {insights && (
          <div className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-800/40 rounded-lg p-2 max-h-64 overflow-y-auto">
            {insights}
          </div>
        )}
      </div>
    </div>
  )
}

// ---- helpers ----

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-800/40 p-1.5 text-center border border-slate-700/30">
      <div className="text-sm font-bold font-mono text-slate-100">{value}</div>
      <div className="text-[8px] text-slate-500">{label}</div>
    </div>
  )
}
