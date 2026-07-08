// ============================================================
// ComparisonView — comparison mode
//   [input bar] [history panel] [summary | timeline tabs]
//   [summary: metric bars + final answers + footer]
//   [timeline: synchronized multi-lane timeline w/ divergence]
// ============================================================

import { useState } from 'react'
import type { ComparisonColumnState, ComparisonVerdict } from '@/engine/comparisonAgent'
import { COMPARISON_KEYS, COMPARISON_PROMPTS, type ComparisonKey } from '@/engine/comparisonAgent'
import { estimateUsageCostUSD, formatCostCNY, KNOWN_MODELS } from '@/engine/cost'
import type { AgentStep } from '@/engine/types'
import { Button } from '@/components/Button'

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
  steps: AgentStep[]
  error: string | null
}

export interface ComparisonHistoryEntry {
  id: string
  userMessage: string
  timestamp: number
  columns: HistoryColumnData[]
}

type AnyColumn = ComparisonColumnState | HistoryColumnData

interface ComparisonViewProps {
  comparisonState: import('@/engine/comparisonAgent').ComparisonState
  comparisonDraft: string
  onDraftChange: (v: string) => void
  comparisonSubMode: 'summary' | 'timeline'
  onSubModeChange: (m: 'summary' | 'timeline') => void
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

// ---- Strategy visual styling ----
const STRATEGY_STYLE: Record<string, { dot: string; name: string; ring: string; lane: string; chip: string }> = {
  default: { dot: '🟢', name: '默认', ring: 'ring-emerald-500/40', lane: 'bg-emerald-500', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  aggressive: { dot: '🔴', name: '激进', ring: 'ring-red-500/40', lane: 'bg-red-500', chip: 'bg-red-500/15 text-red-300 border-red-500/30' },
  conservative: { dot: '🔵', name: '保守', ring: 'ring-blue-500/40', lane: 'bg-blue-500', chip: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
}
function styleFor(key: string) {
  return STRATEGY_STYLE[key] ?? STRATEGY_STYLE.default
}

const TOOL_ICON_MAP: Record<string, string> = {
  get_weather: '🌤️',
  search_hotel: '🏨',
  search_flight: '✈️',
  search_web: '🔍',
  calculate: '🔢',
  get_time: '🕐',
  wikipedia_search: '📚',
  get_exchange_rate: '💱',
  get_definition: '🔤',
  get_joke: '😄',
}
function getToolIcon(name: string) {
  return TOOL_ICON_MAP[name] ?? '🔧'
}

function isLiveCol(c: AnyColumn): c is ComparisonColumnState {
  return c.kind === 'live'
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
  onHistorySelect,
  onHistoryDelete,
  onHistoryRerun,
  comparisonKeys,
  onKeysChange,
  globalModel,
  onColumnModelChange,
}: ComparisonViewProps) {
  const liveColumns = comparisonState.columns
  const displayColumns: AnyColumn[] = viewingHistory ? viewingHistory.columns : liveColumns
  const verdict = viewingHistory ? null : comparisonState.verdict
  const isRunning = comparisonState.isRunning

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
                if (isRunning) return
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
                  disabled={isRunning}
                  title={COMPARISON_PROMPTS[key].label}
                  className={[
                    'px-2.5 py-1 text-xs rounded-full border transition-all duration-150',
                    isRunning ? 'opacity-50 cursor-not-allowed' : '',
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
            placeholder="输入一个问题，对比多种策略的 Tool Call 差异..."
            disabled={isRunning}
            className="flex-1 min-w-[200px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
          />
          {isRunning ? (
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
            disabled={isRunning}
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

      {/* Sub-mode tabs: summary / timeline */}
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
            onClick={() => onSubModeChange('timeline')}
            className={`
              px-3 py-1 text-xs font-medium rounded-full transition-all duration-150
              ${comparisonSubMode === 'timeline'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                : 'bg-slate-800 text-slate-400 border border-slate-700/50 hover:text-slate-100 hover:bg-slate-700'
              }
            `}
          >
            🕐 时间轴
          </button>

          {isRunning && (
            <span className="text-[10px] text-yellow-400 flex items-center gap-1 ml-2">
              <span className="spin inline-block w-2.5 h-2.5 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full" />
              运行中 — 实时同步时间轴
            </span>
          )}
        </div>
      </div>

      {/* Middle: summary bars + answers OR synchronized timeline */}
      {comparisonSubMode === 'summary' ? (
        <main className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <ComparisonMetricBars
            columns={displayColumns}
            verdict={verdict}
            globalModel={globalModel}
            onColumnModelChange={onColumnModelChange}
            editable={!viewingHistory && !isRunning}
          />

          <FinalAnswerCompare
            items={displayColumns.map((col) => ({
              key: col.key,
              label: col.label,
              error: col.error,
              text: isLiveCol(col)
                ? (col.steps.find((s) => s.type === 'response')?.content ?? '')
                : col.summary,
            }))}
          />

          <footer className="flex-shrink-0 border-t border-slate-700/50 bg-slate-900/90 backdrop-blur-sm">
            <div className="px-4 py-2.5">
              {viewingHistory ? (
                <ComparisonSummaryFromHistory columns={viewingHistory.columns} userMessage={viewingHistory.userMessage} />
              ) : liveColumns.some((c) => c.isLoading) ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="spin inline-block w-3 h-3 border-2 border-slate-400/30 border-t-slate-400 rounded-full" />
                  等待所有策略运行完成...
                </div>
              ) : liveColumns.every((c) => c.steps.length === 0) && !isRunning ? (
                <div className="text-xs text-slate-600 text-center">
                  输入问题并点击「运行」开始对比
                </div>
              ) : (
                <>
                  <ComparisonCostTotal columns={liveColumns} />
                  <div className="border-t border-slate-700/30 my-2" />
                  {verdict && <ComparisonVerdictBlock verdict={verdict} />}
                  <ComparisonSummary columns={liveColumns} />
                </>
              )}
            </div>
          </footer>
        </main>
      ) : (
        <ComparisonTimeline columns={displayColumns} />
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
      <div className={`grid grid-cols-1 ${items.length === 2 ? 'lg:grid-cols-2' : items.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-1'} gap-px bg-slate-700/30 max-h-72 overflow-y-auto`}>
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
// ComparisonMetricBars — ① horizontal metric bar cards (metrics to top)
//   ④ winner gets gold border + 🏆 badge
// ============================================================

function ComparisonMetricBars({
  columns,
  verdict,
  globalModel,
  onColumnModelChange,
  editable,
}: {
  columns: AnyColumn[]
  verdict: ComparisonVerdict | null
  globalModel: string
  onColumnModelChange?: (key: ComparisonKey, model: string) => void
  editable?: boolean
}) {
  const winnerKey = verdict?.winner ?? null
  return (
    <div className="flex-shrink-0 px-4 py-2 space-y-1.5 bg-slate-800/40 border-b border-slate-700/50">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">📊 策略指标对比</span>
        {winnerKey && (
          <span className="text-[10px] text-yellow-400 font-medium">
            🏆 综合最佳：{verdict?.columns.find((c) => c.key === winnerKey)?.label ?? winnerKey}
          </span>
        )}
      </div>
      {columns.map((col) => (
        <MetricBar
          key={col.key}
          data={col}
          isWinner={col.key === winnerKey}
          verdictCol={verdict?.columns.find((c) => c.key === col.key) ?? null}
          globalModel={globalModel}
          onModelChange={onColumnModelChange}
          editable={editable}
        />
      ))}
    </div>
  )
}

function MetricBar({
  data,
  isWinner,
  verdictCol,
  globalModel,
  onModelChange,
  editable,
}: {
  data: AnyColumn
  isWinner: boolean
  verdictCol: ComparisonVerdict['columns'][number] | null
  globalModel: string
  onModelChange?: (key: ComparisonKey, model: string) => void
  editable?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const style = styleFor(data.key)
  const live = isLiveCol(data) ? data : null
  const hist = live ? null : (data as HistoryColumnData)

  const toolCount = live
    ? live.steps.filter((s) => s.type === 'tool_call').length
    : hist!.toolCallCount

  const seq = live
    ? live.steps.filter((s): s is typeof s & { toolCall: NonNullable<typeof s.toolCall> } => s.type === 'tool_call' && !!s.toolCall).map((s) => s.toolCall.name)
    : hist!.toolCallSequence

  const duration = live
    ? live.endTime && live.startTime
      ? ((live.endTime - live.startTime) / 1000).toFixed(1) + 's'
      : live.isLoading ? '运行中...' : '—'
    : hist!.durationMs > 0 ? (hist!.durationMs / 1000).toFixed(1) + 's' : '—'

  const usage = data.usage
  const cost = usage
    ? estimateUsageCostUSD(data.model || globalModel || 'deepseek-chat', usage.promptTokens, usage.completionTokens)
    : 0

  const successRate = live?.metrics?.successRate
  const firstTool = live?.metrics?.firstToolLatency
  const totalSteps = live?.metrics?.totalSteps ?? (live ? live.steps.length : hist!.turnCount)

  return (
    <div
      className={[
        'rounded-lg border px-3 py-2 transition-all',
        isWinner
          ? 'border-yellow-400/70 bg-yellow-500/[0.06] shadow-[0_0_0_1px_rgba(250,204,21,0.25)]'
          : 'border-slate-700/50 bg-slate-900/30',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {isWinner && <span className="text-sm">🏆</span>}
        <span className="text-sm">{style.dot}</span>
        <span className="text-sm font-semibold text-slate-100">{data.label}</span>
        {editable && onModelChange ? (
          <ModelSelect
            value={data.model || globalModel}
            globalModel={globalModel}
            disabled={false}
            onChange={(m) => onModelChange(data.key as ComparisonKey, m)}
          />
        ) : data.model ? (
          <span className="text-[10px] text-slate-500 font-mono truncate max-w-[140px]" title={data.model}>{data.model}</span>
        ) : null}
        <span className="ml-auto flex items-center gap-3 text-xs font-mono text-slate-300">
          <span title="工具调用次数">🔧 {toolCount}</span>
          <span title="总运行时长">⏱ {duration}</span>
          {usage && usage.promptTokens + usage.completionTokens > 0 && (
            <span title="Token 用量" className="text-slate-400">
              {usage.promptTokens + usage.completionTokens} tok
            </span>
          )}
          {cost > 0 && (
            <span title="预估成本" className="text-yellow-400">{formatCostCNY(cost)}</span>
          )}
        </span>
        {verdictCol && (
          <span className="flex items-center gap-1.5">
            <ScoreDots label="相关" value={verdictCol.relevance} />
            <ScoreDots label="准确" value={verdictCol.accuracy} />
            <ScoreDots label="效率" value={verdictCol.efficiency} />
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 hover:bg-slate-700 text-slate-300 transition-colors"
        >
          {expanded ? '收起 ▴' : '展开 ▾'}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-slate-700/30 space-y-1.5">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Tool Call 调用序列</div>
            <div className="flex items-center flex-wrap gap-1">
              {seq.length === 0 ? (
                <span className="text-xs text-slate-500">—</span>
              ) : (
                seq.map((name, i) => (
                  <span key={i} className="flex items-center gap-0.5">
                    {i > 0 && <span className="text-slate-600 text-xs mx-0.5">→</span>}
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs border ${style.chip}`} title={name}>
                      <span>{getToolIcon(name)}</span>
                      <span>{name}</span>
                    </span>
                  </span>
                ))
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-slate-900/40 rounded-lg p-1.5 text-center">
              <div className="text-sm font-semibold font-mono text-slate-100">
                {successRate != null ? `${Math.round(successRate * 100)}%` : '—'}
              </div>
              <div className="text-[10px] text-slate-500">成功率</div>
            </div>
            <div className="bg-slate-900/40 rounded-lg p-1.5 text-center">
              <div className="text-sm font-semibold font-mono text-slate-100">
                {firstTool != null ? `${firstTool.toFixed(1)}s` : '—'}
              </div>
              <div className="text-[10px] text-slate-500">首工具延迟</div>
            </div>
            <div className="bg-slate-900/40 rounded-lg p-1.5 text-center">
              <div className="text-sm font-semibold font-mono text-slate-100">{totalSteps}</div>
              <div className="text-[10px] text-slate-500">总步骤</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// ComparisonTimeline — ② synchronized multi-lane timeline
//   ③ divergence highlighting (red ring on off-pattern tool calls)
// ============================================================

interface TimelineItem {
  step: AgentStep
  ms: number
  /** Tool invocation window — present only for tool_call steps with real timing */
  toolStart?: number
  toolEnd?: number
}

interface TimelineColumn {
  key: string
  label: string
  dot: string
  items: TimelineItem[]
  baseStart: number
  baseEnd: number
}

/** Majority-vote per position: a tool call differing from the majority is "divergent". */
function computeDivergentToolIds(
  cols: { key: string; tools: { id: string; name: string }[] }[],
): Set<string> {
  const divergent = new Set<string>()
  const maxLen = cols.reduce((m, c) => Math.max(m, c.tools.length), 0)
  for (let p = 0; p < maxLen; p++) {
    const namesAtP = cols.map((c) => c.tools[p]?.name).filter((n): n is string => !!n)
    if (namesAtP.length === 0) continue
    if (namesAtP.length === 1) {
      // Only one strategy called a tool here → it's divergent relative to the others
      const col = cols.find((c) => c.tools[p]?.name === namesAtP[0])
      const id = col?.tools[p]?.id
      if (id) divergent.add(id)
      continue
    }
    const freq: Record<string, number> = {}
    for (const n of namesAtP) freq[n] = (freq[n] ?? 0) + 1
    const maxFreq = Math.max(...Object.values(freq))
    const majority = Object.entries(freq).find(([, c]) => c === maxFreq)?.[0]
    for (const c of cols) {
      const t = c.tools[p]
      if (t && t.name !== majority) divergent.add(t.id)
    }
  }
  return divergent
}

function normalizeColumns(columns: AnyColumn[]): TimelineColumn[] {
  return columns.map((col) => {
    const live = isLiveCol(col) ? col : null
    const steps = col.steps
    const stepMs = steps
      .map((s) => (typeof s.ms === 'number' ? s.ms : NaN))
      .filter((n) => !Number.isNaN(n))
    const stepMin = stepMs.length > 0 ? Math.min(...stepMs) : 0
    const stepMax = stepMs.length > 0 ? Math.max(...stepMs) : 0
    const baseStart = live ? live.startTime ?? stepMin : stepMin
    const baseEnd = live
      ? live.endTime ?? stepMax
      : Math.max(stepMax, (col as HistoryColumnData).durationMs || 0)
    const items: TimelineItem[] = steps.map((s, i) => ({
      step: s,
      ms: typeof s.ms === 'number' ? s.ms : steps.length <= 1 ? baseStart : baseStart + (i / (steps.length - 1)) * (baseEnd - baseStart),
      toolStart: s.type === 'tool_call' && s.toolCall?.startedAt ? s.toolCall.startedAt : undefined,
      toolEnd: s.type === 'tool_call' && s.toolCall?.endedAt ? s.toolCall.endedAt : undefined,
    }))
    return {
      key: col.key,
      label: col.label,
      dot: styleFor(col.key).dot,
      items,
      baseStart,
      baseEnd,
    }
  })
}

function ComparisonTimeline({ columns }: { columns: AnyColumn[] }) {
  const [selected, setSelected] = useState<{ colKey: string; step: AgentStep } | null>(null)

  const norm = normalizeColumns(columns)

  // Global time range across all lanes
  let gMin = Infinity
  let gMax = -Infinity
  for (const c of norm) {
    for (const it of c.items) {
      gMin = Math.min(gMin, it.ms)
      gMax = Math.max(gMax, it.ms)
    }
    gMin = Math.min(gMin, c.baseStart)
    gMax = Math.max(gMax, c.baseEnd)
  }
  if (!isFinite(gMin)) {
    gMin = 0
    gMax = 1
  }
  if (gMax <= gMin) gMax = gMin + 1
  const span = gMax - gMin

  // Divergence detection on tool calls
  const toolLists = norm.map((c) => ({
    key: c.key,
    tools: c.items
      .filter((it) => it.step.type === 'tool_call' && it.step.toolCall)
      .map((it) => ({ id: it.step.id, name: it.step.toolCall!.name })),
  }))
  const divergent = computeDivergentToolIds(toolLists)

  const TICKS = 5
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => gMin + (span * i) / TICKS)

  const pos = (ms: number) => Math.max(1.5, Math.min(98.5, ((ms - gMin) / span) * 100))

  const hasSteps = norm.some((c) => c.items.length > 0)

  return (
    <div className="flex-1 overflow-auto p-4 min-h-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          🕐 同步时间轴 · 按真实时间戳对齐
        </span>
        <span className="text-[10px] text-slate-600">总时长 {((gMax - gMin) / 1000).toFixed(1)}s</span>
      </div>

      {divergent.size > 0 && (
        <div className="mb-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
          ⚠ 检测到 {divergent.size} 处工具调用分歧（红框标注）— 策略在工具选择 / 顺序上出现分化
        </div>
      )}

      {!hasSteps ? (
        <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
          <span className="text-2xl">🕐</span>
          <p className="text-xs text-center px-2">运行后将在此显示各策略的同步时间轴</p>
        </div>
      ) : (
        <div className="relative min-w-[640px]">
          {/* time axis header */}
          <div className="relative h-5 mb-1 ml-28 border-b border-slate-700/40">
            {ticks.map((t, i) => (
              <span
                key={i}
                className="absolute text-[9px] text-slate-600 font-mono -translate-x-1/2"
                style={{ left: `${pos(t)}%` }}
              >
                {((t - gMin) / 1000).toFixed(1)}s
              </span>
            ))}
          </div>

          {norm.map((c) => (
            <div key={c.key} className="flex items-stretch mb-2">
              {/* lane label */}
              <div className="w-28 flex-shrink-0 flex items-center gap-1 pr-2">
                <span>{c.dot}</span>
                <span className="text-xs text-slate-300 truncate">{c.label}</span>
              </div>
              {/* lane track */}
              <div className="relative flex-1 h-11 bg-slate-800/30 rounded border border-slate-700/40">
                {ticks.map((t, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 border-l border-slate-700/20"
                    style={{ left: `${pos(t)}%` }}
                  />
                ))}
                {c.items.map((it) => {
                  const isTool = it.step.type === 'tool_call'
                  const isResponse = it.step.type === 'response'
                  const isDiv = isTool && divergent.has(it.step.id)
                  // Tool-call execution window: render as a bar spanning start→end.
                  const hasToolSpan = isTool && typeof it.toolStart === 'number'
                  const barRunning = hasToolSpan && typeof it.toolEnd !== 'number'
                  let leftPct: number
                  let widthPct: number | undefined
                  if (hasToolSpan) {
                    const startPct = pos(it.toolStart!)
                    const endPct = typeof it.toolEnd === 'number' ? pos(it.toolEnd) : Math.min(98.5, startPct + 1.5)
                    leftPct = Math.min(startPct, 98.5 - 1.5)
                    widthPct = Math.max(1.5, endPct - startPct)
                  } else {
                    leftPct = pos(it.ms)
                  }
                  const bg = isResponse
                    ? 'bg-emerald-500/85'
                    : isTool
                      ? isDiv ? 'bg-red-500/85' : 'bg-blue-500/85'
                      : 'bg-slate-500/70'
                  const icon = isTool
                    ? getToolIcon(it.step.toolCall!.name)
                    : isResponse ? '💬' : '🧠'
                  const durLabel =
                    hasToolSpan && typeof it.toolEnd === 'number'
                      ? `${((it.toolEnd - it.toolStart!) / 1000).toFixed(1)}s`
                      : ''
                  return (
                    <button
                      key={it.step.id}
                      type="button"
                      onClick={() => setSelected({ colKey: c.key, step: it.step })}
                      title={
                        hasToolSpan
                          ? `${it.step.content.slice(0, 40)}${durLabel ? ' · 耗时 ' + durLabel : ' · 执行中…'}`
                          : it.step.content.slice(0, 60)
                      }
                      className={[
                        'absolute top-1/2 -translate-y-1/2 h-7 rounded text-[10px] text-white flex items-center gap-0.5 transition-all hover:brightness-125 hover:z-10 overflow-hidden',
                        widthPct ? 'px-1' : 'px-1.5',
                        bg,
                        isDiv ? 'ring-2 ring-red-300 z-[1]' : '',
                        barRunning ? 'animate-pulse' : '',
                      ].join(' ')}
                      style={widthPct ? { left: `${leftPct}%`, width: `${widthPct}%` } : { left: `${leftPct}%` }}
                    >
                      <span className="flex-shrink-0">{icon}</span>
                      {isTool && (
                        <span className="truncate">{it.step.toolCall!.name}</span>
                      )}
                      {durLabel && <span className="flex-shrink-0 opacity-80 hidden xl:inline">·{durLabel}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* selected step detail */}
      {selected && <TimelineDetail step={selected.step} />}

      {/* legend */}
      <div className="mt-3 flex items-center gap-4 text-[10px] text-slate-500 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-500/70 inline-block" />思考</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500/85 inline-block" />工具调用(条宽=耗时)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/85 inline-block" />最终回答</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded ring-2 ring-red-300 bg-red-500/85 inline-block" />分歧调用</span>
      </div>
    </div>
  )
}

function TimelineDetail({ step }: { step: AgentStep }) {
  const isTool = step.type === 'tool_call' && step.toolCall
  let input: unknown = null
  let output: unknown = null
  if (isTool) {
    try { input = JSON.parse(step.toolCall!.input) } catch { input = step.toolCall!.input }
    if (step.toolCall!.output) {
      try { output = JSON.parse(step.toolCall!.output) } catch { output = step.toolCall!.output }
    }
  }
  const typeLabel =
    step.type === 'response' ? '最终回答' : step.type === 'tool_call' ? '工具调用' : '思考'
  return (
    <div className="mt-3 border border-slate-700/50 rounded-lg bg-slate-900/50 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{typeLabel}</span>
        {isTool && (
          <span className="text-xs font-medium text-blue-300">
            {getToolIcon(step.toolCall!.name)} {step.toolCall!.name}
            <span className={`ml-1 text-[10px] ${step.toolCall!.status === 'success' ? 'text-emerald-400' : step.toolCall!.status === 'error' ? 'text-red-400' : 'text-slate-400'}`}>
              {step.toolCall!.status}
            </span>
          </span>
        )}
        {isTool && step.toolCall?.startedAt && (
          <span className="text-[10px] text-slate-500 font-mono">
            ⏱ {step.toolCall?.endedAt && step.toolCall.startedAt < step.toolCall.endedAt
              ? `${((step.toolCall.endedAt - step.toolCall.startedAt) / 1000).toFixed(2)}s`
              : (step.toolCall.status === 'running' ? '执行中…' : '—')}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
        {step.content}
      </p>
      {isTool && (
        <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">参数</div>
            <pre className="text-[11px] text-slate-400 bg-slate-800/60 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
              {JSON.stringify(input, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">结果</div>
            <pre className="text-[11px] text-slate-400 bg-slate-800/60 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
              {output != null ? JSON.stringify(output, null, 2) : '—'}
            </pre>
          </div>
        </div>
      )}
    </div>
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
// ScoreDots — 1-5 rating dots
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

// ============================================================
// ComparisonVerdictBlock — LLM judge qualitative comparison
// ============================================================

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
