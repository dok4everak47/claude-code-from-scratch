// ============================================================
// ComparisonView — comparison mode
//   [input bar] [history panel] [summary/detail tabs]
//   [summary cards | detail columns] [footer]
// ============================================================

import { useState } from 'react'
import type { ComparisonColumnState, ComparisonVerdict } from '@/engine/comparisonAgent'
import { COMPARISON_KEYS, COMPARISON_PROMPTS, type ComparisonKey } from '@/engine/comparisonAgent'
import { estimateUsageCostUSD, formatCostCNY, KNOWN_MODELS } from '@/engine/cost'
import { Button } from '@/components/Button'
import AgentFlow from '@/components/AgentFlow'

// ---- Shared history types (kept here; App.tsx imports ComparisonHistoryEntry) ----
export interface HistoryColumnData {
  kind: 'history'
  key: string
  label: string
  /** Model used for this column ('' = follow global config). */
  model: string
  /** Real token usage measured during the run. */
  usage: { promptTokens: number; completionTokens: number } | null
  toolCallCount: number
  toolCallSequence: string[]
  durationMs: number
  turnCount: number
  summary: string
  /** Full agent step timeline (persisted so history can replay the flow) */
  steps: import('@/engine/types').AgentStep[]
  error: string | null
}

export interface ComparisonHistoryEntry {
  id: string
  userMessage: string
  timestamp: number
  columns: HistoryColumnData[]
}

interface ComparisonViewProps {
  comparisonState: import('@/engine/comparisonAgent').ComparisonState
  comparisonDraft: string
  onDraftChange: (v: string) => void
  comparisonSubMode: 'summary' | 'detail'
  onSubModeChange: (m: 'summary' | 'detail') => void
  comparisonHistory: ComparisonHistoryEntry[]
  viewingHistory: ComparisonHistoryEntry | null
  historyOpen: boolean
  onHistoryOpenChange: (open: boolean) => void
  onRun: () => void
  onStop: () => void
  onRetry: () => void
  onStopSingle: (i: number) => void
  onHistorySelect: (e: ComparisonHistoryEntry) => void
  onHistoryDelete: (id: string) => void
  onHistoryRerun: (e: ComparisonHistoryEntry) => void
  /** Which strategy columns are active (configurable) */
  comparisonKeys: ComparisonKey[]
  onKeysChange: (keys: ComparisonKey[]) => void
  /** The global model from API settings (used as the "follow global" default). */
  globalModel: string
  /** Change a single column's model override. */
  onColumnModelChange: (key: ComparisonKey, model: string) => void
}

export function ComparisonView({
  comparisonState,
  comparisonDraft,
  onDraftChange,
  comparisonSubMode,
  onSubModeChange,
  comparisonHistory,
  viewingHistory,
  historyOpen,
  onHistoryOpenChange,
  onRun,
  onStop,
  onRetry,
  onStopSingle,
  onHistorySelect,
  onHistoryDelete,
  onHistoryRerun,
  comparisonKeys,
  onKeysChange,
  globalModel,
  onColumnModelChange,
}: ComparisonViewProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top: input bar */}
      <div className="flex-shrink-0 border-b border-slate-700/50 px-4 py-3 bg-slate-800/50">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">
            📝 输入问题
          </span>
          <div className="flex items-center gap-1">
            {COMPARISON_KEYS.map((key) => {
              const active = comparisonKeys.includes(key)
              const toggle = () => {
                if (comparisonState.isRunning) return
                if (active) {
                  if (comparisonKeys.length <= 2) return // keep at least 2
                  onKeysChange(comparisonKeys.filter((k) => k !== key))
                } else {
                  onKeysChange([...comparisonKeys, key])
                }
              }
              return (
                <button
                  key={key}
                  type="button"
                  onClick={toggle}
                  disabled={comparisonState.isRunning}
                  title={COMPARISON_PROMPTS[key].label}
                  className={[
                    'px-2.5 py-1 text-xs rounded-full border transition-all duration-150',
                    comparisonState.isRunning ? 'opacity-50 cursor-not-allowed' : '',
                    active
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-200'
                      : 'bg-slate-800 border-slate-700/50 text-slate-500 hover:text-slate-300',
                  ].join(' ')}
                >
                  {COMPARISON_PROMPTS[key].label}
                </button>
              )
            })}
          </div>
          <input
            type="text"
            value={comparisonDraft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onRun()
              }
            }}
            placeholder="输入一个问题，对比 3 种策略的 Tool Call 差异..."
            disabled={comparisonState.isRunning}
            className="flex-1 min-w-[200px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
          />
          {comparisonState.isRunning ? (
            <Button variant="danger" size="md" onClick={onStop}>
              ⏹ 全部停止
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={onRun}
              disabled={!comparisonDraft.trim()}
            >
              ▶ 运行
            </Button>
          )}
          <Button
            variant="secondary"
            size="md"
            onClick={onRetry}
            disabled={comparisonState.isRunning}
          >
            🔄 重置
          </Button>
        </div>
      </div>

      {/* Historical comparison panel */}
      {comparisonHistory.length > 0 && (
        <div className="flex-shrink-0 border-b border-slate-700/50 bg-slate-800/30">
          <button
            type="button"
            onClick={() => onHistoryOpenChange(!historyOpen)}
            className="w-full px-4 py-1.5 flex items-center justify-between text-xs text-slate-400 hover:text-slate-100 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <span>📜</span>
              <span className="font-medium">历史对比</span>
              <span className="text-slate-600">({comparisonHistory.length})</span>
              {viewingHistory && (
                <span className="text-blue-400 ml-1">— 查看中：{viewingHistory.userMessage.slice(0, 20)}...</span>
              )}
            </span>
            <span className={`transition-transform ${historyOpen ? '' : 'rotate-180'}`}>▼</span>
          </button>
          {historyOpen && (
            <div className="px-4 pb-2 space-y-1 max-h-32 overflow-y-auto">
              {comparisonHistory.slice(0, 10).map((entry) => {
                const now = Date.now()
                const diff = now - entry.timestamp
                const relTime = diff < 60000 ? `${Math.floor(diff / 1000)}秒前`
                  : diff < 3600000 ? `${Math.floor(diff / 60000)}分钟前`
                    : diff < 86400000 ? `${Math.floor(diff / 3600000)}小时前`
                      : `${Math.floor(diff / 86400000)}天前`
                const totalCalls = entry.columns.reduce((s, c) => s + c.toolCallCount, 0)
                const isActive = viewingHistory?.id === entry.id
                return (
                  <div
                    key={entry.id}
                    className={`
                      flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors
                      ${isActive ? 'bg-blue-900/30 text-blue-200' : 'hover:bg-slate-700/50 text-slate-400'}
                    `}
                  >
                    <button
                      type="button"
                      onClick={() => onHistorySelect(entry)}
                      className="flex-1 flex items-center gap-2 min-w-0 text-left"
                    >
                      <span className="truncate">{entry.userMessage}</span>
                      <span className="text-slate-600 flex-shrink-0">· {totalCalls} 次调用</span>
                      <span className="text-slate-600 flex-shrink-0">· {relTime}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onHistoryRerun(entry)}
                      className="px-1.5 py-0.5 rounded bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 flex-shrink-0 transition-colors"
                      title="重新运行"
                    >
                      ▶
                    </button>
                    <button
                      type="button"
                      onClick={() => onHistoryDelete(entry.id)}
                      className="px-1.5 py-0.5 rounded hover:bg-red-500/15 text-slate-500 hover:text-red-400 flex-shrink-0 transition-colors"
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
              {comparisonHistory.length > 10 && (
                <div className="text-[10px] text-slate-600 text-center pt-1">
                  还有 {comparisonHistory.length - 10} 条历史记录
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sub-mode tabs: summary / detail */}
      <div className="flex-shrink-0 border-b border-slate-700/50 px-4 py-1.5 bg-slate-800/40">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onSubModeChange('summary')}
            className={`
              px-3 py-1 text-xs font-medium rounded-full transition-all duration-150
              ${comparisonSubMode === 'summary'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                : 'bg-slate-800 text-slate-400 border border-slate-700/50 hover:text-slate-100 hover:bg-slate-700'
              }
            `}
          >
            📊 总结
          </button>
          <button
            type="button"
            onClick={() => onSubModeChange('detail')}
            className={`
              px-3 py-1 text-xs font-medium rounded-full transition-all duration-150
              ${comparisonSubMode === 'detail'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                : 'bg-slate-800 text-slate-400 border border-slate-700/50 hover:text-slate-100 hover:bg-slate-700'
              }
            `}
          >
            🔍 详细
          </button>

          {comparisonState.isRunning && (
            <span className="text-[10px] text-yellow-400 flex items-center gap-1 ml-2">
              <span className="spin inline-block w-2.5 h-2.5 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full" />
              运行中 — 完成后自动切换到总结
            </span>
          )}
        </div>
      </div>

      {/* Middle: summary cards or detail columns */}
      {comparisonSubMode === 'summary' ? (
        <>
          <main className="flex-1 flex flex-col lg:flex-row min-h-0">
            {(viewingHistory ? viewingHistory.columns : comparisonState.columns).map((col, i) => (
              <ComparisonCard
                key={col.key}
                data={col}
                isLast={i === (viewingHistory ? viewingHistory.columns.length - 1 : comparisonState.columns.length - 1)}
                onStop={() => !viewingHistory && onStopSingle(i)}
                editable={!viewingHistory && !comparisonState.isRunning}
                globalModel={globalModel}
                onModelChange={onColumnModelChange}
              />
            ))}
          </main>

          <FinalAnswerCompare
            items={(viewingHistory ? viewingHistory.columns : comparisonState.columns).map((col) => ({
              key: col.key,
              label: col.label,
              error: col.error,
              text: col.kind === 'live'
                ? (col.steps.find((s) => s.type === 'response')?.content ?? '')
                : col.summary,
            }))}
          />

          <footer className="flex-shrink-0 border-t border-slate-700/50 bg-slate-900/90 backdrop-blur-sm">
            <div className="px-4 py-2.5">
              {viewingHistory ? (
                <ComparisonSummaryFromHistory columns={viewingHistory.columns} userMessage={viewingHistory.userMessage} />
              ) : comparisonState.columns.some((c) => c.isLoading) ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="spin inline-block w-3 h-3 border-2 border-slate-400/30 border-t-slate-400 rounded-full" />
                  等待所有策略运行完成...
                </div>
              ) : comparisonState.columns.every((c) => c.steps.length === 0) && !comparisonState.isRunning ? (
                <div className="text-xs text-slate-600 text-center">
                  输入问题并点击「运行」开始对比
                </div>
              ) : (
                  <>
                    <ComparisonMetrics columns={comparisonState.columns} />
                    <div className="mt-2">
                      <ComparisonCostTotal columns={comparisonState.columns} />
                    </div>
                    <div className="border-t border-slate-700/30 my-2" />
                    {comparisonState.verdict && (
                      <ComparisonVerdictBlock verdict={comparisonState.verdict} />
                    )}
                    <ComparisonSummary columns={comparisonState.columns} />
                  </>
              )}
            </div>
          </footer>
        </>
      ) : (
        <>
          <main className="flex-1 flex flex-col lg:flex-row min-h-0">
            {comparisonState.columns.map((col, i) => (
              <section
                key={col.key}
                className="flex-1 min-w-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-700/50"
              >
                <div className="px-3 py-1.5 border-b border-slate-700/30 bg-slate-800/50 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-semibold text-slate-300 truncate">
                      {col.key === 'default' ? '🟢' : col.key === 'aggressive' ? '🔴' : '🔵'} {col.label}
                    </span>
                    {col.isLoading && (
                      <span className="spin inline-block w-2.5 h-2.5 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <ModelSelect
                      value={col.model || globalModel}
                      globalModel={globalModel}
                      disabled={comparisonState.isRunning}
                      onChange={(m) => onColumnModelChange(col.key, m)}
                    />
                    <span className="text-[10px] text-slate-500 font-mono">
                      🔧{col.steps.filter((s) => s.type === 'tool_call').length} · 轮{col.currentTurn}
                    </span>
                    {col.isLoading && (
                      <button
                        type="button"
                        onClick={() => onStopSingle(i)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 hover:bg-red-900/50 text-red-400 border border-red-500/30 transition-colors"
                        title="停止此列"
                      >
                        ⏹
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 min-h-0">
                  {col.isLoading && col.steps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
                      <span className="spin inline-block w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full" />
                      <p className="text-[11px] text-center px-2">正在连接模型，等待首批结果…</p>
                    </div>
                  ) : col.steps.length === 0 && !col.isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
                      <span className="text-2xl">
                        {col.key === 'default' ? '🧠' : col.key === 'aggressive' ? '⚡' : '🛡️'}
                      </span>
                      <p className="text-[11px] text-center px-2">等待运行...</p>
                    </div>
                  ) : col.error ? (
                    <div className="flex flex-col items-center justify-center h-full text-red-400 gap-2 p-3">
                      <span className="text-2xl">⚠️</span>
                      <p className="text-xs text-center break-all">{col.error}</p>
                    </div>
                  ) : (
                    <AgentFlow
                      steps={col.steps}
                      currentStepIndex={col.steps.length - 1}
                      isLive
                    />
                  )}
                </div>
              </section>
            ))}
          </main>

          <footer className="flex-shrink-0 border-t border-slate-700/50 bg-slate-900/90 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-4 px-4 py-2">
              {comparisonState.columns.some((c) => c.isLoading) ? (
                <span className="text-xs text-slate-500">⏳ 运行中...</span>
              ) : comparisonState.columns.some((c) => c.steps.length > 0) ? (
                <button
                  type="button"
                  onClick={() => onSubModeChange('summary')}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  📊 查看总结对比
                </button>
              ) : (
                <span className="text-xs text-slate-600">输入问题并点击「运行」开始对比</span>
              )}
            </div>
          </footer>
        </>
      )}
    </div>
  )
}

// ============================================================
// ModelSelect — compact per-column model override picker
// ============================================================

function ModelSelect({
  value,
  globalModel,
  disabled,
  onChange,
}: {
  value: string
  globalModel: string
  disabled?: boolean
  onChange: (model: string) => void
}) {
  const effective = value || globalModel
  const options = (() => {
    const seen = new Set<string>()
    const list: { value: string; label: string }[] = [
      { value: '', label: `跟随全局 · ${globalModel}` },
    ]
    seen.add('')
    for (const m of [globalModel, ...KNOWN_MODELS]) {
      if (m && !seen.has(m)) {
        seen.add(m)
        list.push({ value: m, label: m })
      }
    }
    if (effective && !seen.has(effective)) list.push({ value: effective, label: effective })
    return list
  })()

  return (
    <select
      value={effective}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      title="为这一列单独选择模型（留空则跟随全局配置）"
      className="ml-1 bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-[10px] text-slate-300 font-mono max-w-[140px] focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

// ============================================================
// ComparisonCostTotal — aggregate token + cost across columns
// ============================================================

function ComparisonCostTotal({ columns }: { columns: ComparisonColumnState[] }) {
  const totalTokens = columns.reduce(
    (s, c) => s + (c.usage ? c.usage.promptTokens + c.usage.completionTokens : 0),
    0,
  )
  if (totalTokens === 0) return null
  const totalCost = columns.reduce(
    (s, c) =>
      s +
      (c.usage ? estimateUsageCostUSD(c.model || 'deepseek-chat', c.usage.promptTokens, c.usage.completionTokens) : 0),
    0,
  )
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">合计用量</span>
      <span className="font-mono text-slate-300">
        {totalTokens} tok · <span className="text-yellow-400">{formatCostCNY(totalCost)}</span>
      </span>
    </div>
  )
}

// ============================================================
// FinalAnswerCompare — side-by-side full final answers
// ============================================================

function FinalAnswerCompare({
  items,
}: {
  items: { key: string; label: string; error: string | null; text: string }[]
}) {
  return (
    <section className="flex-shrink-0 border-t border-slate-700/50 bg-slate-900/40">
      <div className="px-4 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
        💬 最终回答对比
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-slate-700/30 max-h-72 overflow-y-auto">
        {items.map((it) => (
          <div key={it.key} className="bg-slate-900/60 p-3">
            <div className="text-[10px] text-slate-500 mb-1 truncate">{it.label}</div>
            {it.error ? (
              <div className="text-xs text-red-400 break-all">{it.error}</div>
            ) : it.text ? (
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{it.text}</p>
            ) : (
              <div className="text-xs text-slate-600">（无回答）</div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ============================================================
// ComparisonCard — accepts either live state or history data
// ============================================================
function ComparisonCard({
  data,
  isLast,
  onStop,
  editable,
  globalModel,
  onModelChange,
}: {
  data: ComparisonColumnState | HistoryColumnData
  isLast: boolean
  onStop?: () => void
  editable?: boolean
  globalModel?: string
  onModelChange?: (key: ComparisonKey, model: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const TOOL_ICON_MAP: Record<string, string> = {
    get_weather: '🌤️',
    search_hotel: '🏨',
    search_flight: '✈️',
    search_web: '🔍',
    calculate: '🔢',
    get_time: '🕐',
  }
  const getToolIcon = (name: string) => TOOL_ICON_MAP[name] ?? '🔧'

  const isLive = data.kind === 'live'
  const live = data as ComparisonColumnState

  const label = data.label
  const key = data.key
  const error = data.error

  const toolCallData: { count: number; sequence: string[] } = isLive
    ? {
        count: live.steps.filter((s) => s.type === 'tool_call').length,
        sequence: live.steps
          .filter((s): s is typeof s & { toolCall: NonNullable<typeof s.toolCall> } => s.type === 'tool_call' && !!s.toolCall)
          .map((s) => s.toolCall.name),
      }
    : { count: data.toolCallCount, sequence: data.toolCallSequence }

  const duration = isLive
    ? live.endTime && live.startTime
      ? ((live.endTime - live.startTime) / 1000).toFixed(1) + 's'
      : live.isLoading ? '运行中...' : '—'
    : data.durationMs > 0 ? (data.durationMs / 1000).toFixed(1) + 's' : '—'

  const turnCount = isLive ? live.currentTurn : data.turnCount

  const responseSummary = isLive
    ? (live.steps.find((s) => s.type === 'response')?.content ?? '').slice(0, 100)
    : data.summary.slice(0, 100)

  const steps = isLive ? live.steps : []
  const hasDetail = steps.length > 0

  const colorMap: Record<string, { dot: string; bg: string; border: string }> = {
    default: { dot: '🟢', bg: 'from-emerald-500/10 to-transparent', border: 'border-emerald-500/30' },
    aggressive: { dot: '🔴', bg: 'from-red-500/10 to-transparent', border: 'border-red-500/30' },
    conservative: { dot: '🔵', bg: 'from-blue-500/10 to-transparent', border: 'border-blue-500/30' },
  }
  const colors = colorMap[key] ?? colorMap.default

  const isActuallyLoading = isLive ? (data as { isLoading?: boolean }).isLoading : false
  const statusIcon = isActuallyLoading
    ? <span className="spin inline-block w-3 h-3 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full" />
    : error
      ? <span className="text-red-400">❌</span>
      : toolCallData.count > 0
        ? <span className="text-emerald-400">✅</span>
        : <span className="text-slate-500">✅</span>

  return (
    <section
      className={`flex-1 min-w-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-700/50 ${isLast ? 'lg:border-r-0' : ''}`}
    >
      <div
        className="flex-1 overflow-y-auto min-h-0"
        onClick={() => hasDetail && setExpanded(!expanded)}
      >
        <div
          className={`h-full p-3 bg-gradient-to-b ${colors.bg} border-b ${colors.border} flex flex-col gap-2.5`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm">{colors.dot}</span>
              <span className="text-sm font-semibold text-slate-100 truncate">{label}</span>
              {editable && onModelChange && globalModel != null ? (
                <ModelSelect
                  value={data.model || globalModel}
                  globalModel={globalModel}
                  onChange={(m) => onModelChange(data.key as ComparisonKey, m)}
                />
              ) : data.model ? (
                <span className="text-[10px] text-slate-500 font-mono truncate max-w-[130px]" title={data.model}>
                  {data.model}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {statusIcon}
              {isActuallyLoading && onStop && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onStop() }}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 hover:bg-red-900/50 text-red-400 border border-red-500/30 transition-colors"
                  title="停止此列"
                >
                  ⏹
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
              Tool Call 调用序列
            </div>
            <div className="flex items-center flex-wrap gap-1">
              {toolCallData.sequence.length === 0 ? (
                <span className="text-xs text-slate-500">—</span>
              ) : (
                toolCallData.sequence.map((name, i) => (
                  <span key={i} className="flex items-center gap-0.5">
                    {i > 0 && <span className="text-slate-600 text-xs mx-0.5">→</span>}
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-slate-800/70 border border-slate-700/50"
                      title={name}
                    >
                      <span>{getToolIcon(name)}</span>
                      <span className="text-slate-300">{name}</span>
                    </span>
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-900/40 rounded-lg p-2 text-center">
              <div className="text-2xl font-bold font-mono text-slate-100">{toolCallData.count}</div>
              <div className="text-[10px] text-slate-500">工具调用</div>
            </div>
            <div className="bg-slate-900/40 rounded-lg p-2 text-center">
              <div className="text-lg font-semibold font-mono text-slate-100">{duration}</div>
              <div className="text-[10px] text-slate-500">耗时</div>
            </div>
            <div className="bg-slate-900/40 rounded-lg p-2 text-center">
              <div className="text-lg font-semibold font-mono text-slate-100">{turnCount}</div>
              <div className="text-[10px] text-slate-500">轮次</div>
            </div>
          </div>

          {data.usage && data.usage.promptTokens + data.usage.completionTokens > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <span>🪙</span>
              <span className="font-mono">{data.usage.promptTokens + data.usage.completionTokens} tok</span>
              <span className="text-yellow-400 font-mono">
                · {formatCostCNY(estimateUsageCostUSD(data.model || globalModel || 'deepseek-chat', data.usage.promptTokens, data.usage.completionTokens))}
              </span>
            </div>
          )}

          {responseSummary && !isActuallyLoading && (
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">最终回答</span>
                {hasDetail && (
                  <span className="text-[10px] text-slate-600">
                    — 点击{expanded ? '收起' : '展开'}详情
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/30 rounded-lg px-2.5 py-1.5">
                {responseSummary}
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-500/15 border border-red-500/30 rounded-lg px-2.5 py-1.5">
              <span className="text-xs text-red-400">{error}</span>
            </div>
          )}
        </div>

        {expanded && hasDetail && (
          <div className="border-t border-slate-700/30">
            <div className="px-3 py-1.5 bg-slate-800/50 border-b border-slate-700/30">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">🧠 详细 Agent 流程</span>
            </div>
            <div className="overflow-y-auto max-h-96 p-2">
              <AgentFlow
                steps={steps}
                currentStepIndex={steps.length - 1}
                isLive
              />
            </div>
          </div>
        )}
        {expanded && !hasDetail && (
          <div className="border-t border-slate-700/30 p-3 text-center text-xs text-slate-500">
            该策略未产生可展示的流程
          </div>
        )}
      </div>
    </section>
  )
}

// ============================================================
// ComparisonSummaryFromHistory — summary text for a history entry
// ============================================================

function ComparisonSummaryFromHistory({ columns, userMessage }: {
  columns: HistoryColumnData[]
  userMessage: string
}) {
  const lines: string[] = [`📄 问题：${userMessage}`]

  let totalTokens = 0
  let totalCost = 0

  for (const col of columns) {
    const seq = col.toolCallSequence.length > 0
      ? col.toolCallSequence.join(' → ')
      : '没有调用工具，直接使用自身知识回答'
    const dur = col.durationMs > 0 ? (col.durationMs / 1000).toFixed(1) : '?'
    if (col.error) {
      lines.push(`• ${col.label} 执行失败：${col.error}`)
    } else {
      let extra = ''
      if (col.usage && col.usage.promptTokens + col.usage.completionTokens > 0) {
        const toks = col.usage.promptTokens + col.usage.completionTokens
        totalTokens += toks
        const cost = estimateUsageCostUSD(col.model || 'deepseek-chat', col.usage.promptTokens, col.usage.completionTokens)
        totalCost += cost
        extra = `，用量 ${toks} tok（${formatCostCNY(cost)}）`
      }
      lines.push(`• ${col.label}${col.model ? ` [${col.model}]` : ''} 调用了 ${col.toolCallCount} 次工具（${seq}），耗时 ${dur}s，共 ${col.turnCount} 轮${extra}`)
    }
  }

  if (totalTokens > 0) {
    lines.push(`• 合计用量 ${totalTokens} tok · ${formatCostCNY(totalCost)}`)
  }

  const completed = columns.filter((c) => !c.error)
  if (completed.length >= 2) {
    const counts = completed.map((c) => ({ label: c.label, count: c.toolCallCount, dur: c.durationMs }))
    const maxCount = Math.max(...counts.map((c) => c.count))
    const minCount = Math.min(...counts.map((c) => c.count))
    const most = counts.filter((c) => c.count === maxCount).map((c) => c.label).join('、')
    const least = counts.filter((c) => c.count === minCount).map((c) => c.label).join('、')
    if (maxCount > 0) lines.push(`• ${most} 调用了最多工具（${maxCount} 次），${least} 调用最少（${minCount} 次）`)
  }

  return <div className="text-xs text-slate-400 leading-relaxed">{lines.map((l, i) => <div key={i} className="mt-0.5">{l}</div>)}</div>
}

// ============================================================
// ComparisonMetrics — quantifiable metrics table
// ============================================================

function ComparisonMetrics({ columns }: { columns: ComparisonColumnState[] }) {
  type Row = {
    label: string
    getValue: (c: ComparisonColumnState) => number | null
    format: (v: number | null) => string
    /** 'low' = smaller is better (highlight minimum), 'high' = larger is better, 'none' = no highlight */
    better: 'low' | 'high' | 'none'
  }

  const rows: Row[] = [
    { label: '工具调用次数', getValue: (c) => c.metrics?.toolCallCount ?? null, format: (v) => String(v ?? 0), better: 'none' },
    { label: '成功率', getValue: (c) => c.metrics?.successRate ?? null, format: (v) => (v != null ? `${Math.round(v * 100)}%` : '—'), better: 'high' },
    { label: '首次出工具', getValue: (c) => c.metrics?.firstToolLatency ?? null, format: (v) => (v != null ? `${v.toFixed(1)}s` : '—'), better: 'low' },
    { label: '总运行时长', getValue: (c) => c.metrics?.totalDuration ?? null, format: (v) => (v != null ? `${v.toFixed(1)}s` : '—'), better: 'low' },
    { label: '总步骤数', getValue: (c) => c.metrics?.totalSteps ?? null, format: (v) => String(v ?? 0), better: 'none' },
    {
      label: 'Token 用量',
      getValue: (c) => (c.usage ? c.usage.promptTokens + c.usage.completionTokens : null),
      format: (v) => (v != null ? String(v) : '—'),
      better: 'low',
    },
    {
      label: '预估成本',
      getValue: (c) => (c.usage ? estimateUsageCostUSD(c.model || 'deepseek-chat', c.usage.promptTokens, c.usage.completionTokens) : null),
      format: (v) => (v != null ? formatCostCNY(v) : '—'),
      better: 'low',
    },
  ]

  return (
    <div className="text-xs">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
        📊 评测指标
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-700/30">
              <th className="text-left py-1 pr-3 text-slate-500 font-medium w-32" />
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="py-1 px-2 text-center font-medium"
                >
                  {col.key === 'default' ? '🟢' : col.key === 'aggressive' ? '🔴' : '🔵'}{' '}
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const vals = columns
                .map((c) => row.getValue(c))
                .filter((v): v is number => v != null)
              const hasVariation = vals.length > 1 && Math.max(...vals) !== Math.min(...vals)
              const best = row.better === 'low' ? Math.min(...vals) : row.better === 'high' ? Math.max(...vals) : null
              return (
                <tr key={row.label} className="border-b border-slate-700/20 last:border-0">
                  <td className="py-1 pr-3 text-slate-400">{row.label}</td>
                  {columns.map((col) => {
                    const val = row.getValue(col)
                    const display = row.format(val ?? null)
                    const kind =
                      hasVariation && best != null && val != null && val === best
                        ? 'good'
                        : null
                    return (
                      <td
                        key={col.key}
                        className={`py-1 px-2 text-center font-mono ${
                          kind === 'good' ? 'text-emerald-400 font-semibold' : 'text-slate-300'
                        }`}
                      >
                        {display}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================
// ComparisonVerdictBlock — LLM judge qualitative comparison
// ============================================================

function ScoreDots({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center gap-1 flex-shrink-0">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`w-1.5 h-1.5 rounded-full ${n <= value ? 'bg-blue-500' : 'bg-slate-700'}`}
          />
        ))}
      </span>
    </span>
  )
}

function ComparisonVerdictBlock({ verdict }: { verdict: ComparisonVerdict }) {
  const winnerLabel = verdict.winner
    ? verdict.columns.find((c) => c.key === verdict.winner)?.label ?? verdict.winner
    : null
  return (
    <div className="mb-2">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
        🧑‍⚖️ LLM 评审
      </div>
      <div className="space-y-1.5">
        {verdict.columns.map((c) => (
          <div key={c.key} className="flex items-center gap-2 text-xs">
            <span className="w-16 truncate text-slate-300 flex-shrink-0">{c.label}</span>
            <ScoreDots label="相关" value={c.relevance} />
            <ScoreDots label="准确" value={c.accuracy} />
            <ScoreDots label="效率" value={c.efficiency} />
            <span className="text-slate-400 truncate flex-1">{c.comment}</span>
          </div>
        ))}
      </div>
      {winnerLabel && (
        <div className="mt-1.5 text-xs">
          <span className="text-slate-500">综合最佳：</span>
          <span className="text-emerald-400 font-semibold">{winnerLabel}</span>
        </div>
      )}
      {verdict.rationale && (
        <p className="mt-1 text-xs text-slate-400 leading-relaxed">{verdict.rationale}</p>
      )}
    </div>
  )
}

// ============================================================
// ComparisonSummary — auto-generated text at the bottom
// ============================================================
function ComparisonSummary({ columns }: { columns: ComparisonColumnState[] }) {
  const lines: string[] = []

  for (const col of columns) {
    const toolSteps = col.steps.filter((s) => s.type === 'tool_call' && s.toolCall)
    const toolNames = toolSteps.map((s) => s.toolCall!.name)
    const toolSequence = toolNames.length > 0
      ? toolNames.join(' → ')
      : '没有调用工具，直接使用自身知识回答'
    const duration = col.endTime && col.startTime
      ? ((col.endTime - col.startTime) / 1000).toFixed(1) : '?'

    if (col.error) {
      lines.push(`• ${col.label} 执行失败：${col.error}`)
    } else {
      lines.push(`• ${col.label} 调用了 ${toolNames.length} 次工具（${toolSequence}），耗时 ${duration}s，共 ${col.currentTurn} 轮`)
    }
  }

  const completed = columns.filter((c) => !c.isLoading && !c.error)
  if (completed.length >= 2) {
    const counts = completed.map((c) => ({
      label: c.label,
      count: c.steps.filter((s) => s.type === 'tool_call').length,
      dur: c.endTime && c.startTime ? c.endTime - c.startTime : Infinity,
    }))

    const maxCount = Math.max(...counts.map((c) => c.count))
    const minCount = Math.min(...counts.map((c) => c.count))
    const maxDur = Math.max(...counts.map((c) => c.dur))
    const minDur = Math.min(...counts.map((c) => c.dur))

    const mostTools = counts.filter((c) => c.count === maxCount).map((c) => c.label).join('、')
    const leastTools = counts.filter((c) => c.count === minCount).map((c) => c.label).join('、')
    const fastest = counts.filter((c) => c.dur === minDur).map((c) => c.label).join('、')
    const slowest = counts.filter((c) => c.dur === maxDur).map((c) => c.label).join('、')

    if (maxCount > 0) {
      lines.push(`• ${mostTools} 调用了最多工具（${maxCount} 次），${leastTools} 调用最少（${minCount} 次）`)
    }
    if (minDur < Infinity) {
      lines.push(`• ${fastest} 速度最快（${(minDur / 1000).toFixed(1)}s），${slowest} 最慢（${(maxDur / 1000).toFixed(1)}s）`)
    }
  }

  if (lines.length === 0) return null

  return (
    <div className="text-xs text-slate-400 leading-relaxed">
      <span className="font-semibold text-slate-300">📊 对比总结</span>
      {lines.map((line, i) => (
        <div key={i} className="mt-0.5">{line}</div>
      ))}
    </div>
  )
}
