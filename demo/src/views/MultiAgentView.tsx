// ============================================================
// MultiAgentView — multi-agent orchestration mode
//   [control bar: scenarios / run mode / task / topology / experts / run]
//   [MultiAgentFlow]
//   [RunHistoryPanel]
//   [compare modal]
// ============================================================

import { useState } from 'react'
import type { MultiAgentScenario, MultiAgentEngineState } from '@/engine/types'
import type { Topology } from '@/engine/orchestrationEngine'
import type { SavedRun } from '@/engine/runHistory'
import { extractFinalAnswer } from '@/engine/runHistory'
import { Button } from '@/components/Button'
import MultiAgentFlow from '@/components/MultiAgentFlow'
import RunHistoryPanel from '@/components/RunHistoryPanel'
import { ContextBudgetPanel } from '@/components/ContextBudgetPanel'

interface CostEstimate {
  promptTokens: number
  completionTokens: number
  costCNY: string
}

interface MultiAgentViewProps {
  scenarios: MultiAgentScenario[]
  runMode: 'demo' | 'live'
  onSwitchRunMode: (m: 'demo' | 'live') => void
  engineState: MultiAgentEngineState
  liveTask: string
  onLiveTaskChange: (v: string) => void
  isOrchestrating: boolean
  liveSpecialists: MultiAgentScenario['nodes']
  selectedExperts: string[]
  onToggleExpert: (id: string) => void
  topology: Topology
  onChangeTopology: (t: Topology) => void
  concurrency: number
  onChangeConcurrency: (c: number) => void
  maxRunTurns: number
  onChangeMaxTurns: (t: number) => void
  costEstimate: CostEstimate
  usage: MultiAgentEngineState['usage']
  apiKey: string
  isDeployed: boolean
  onLoadScenario: (s: MultiAgentScenario) => void
  onNext: () => void
  onPrev: () => void
  onPlay: () => void
  onPause: () => void
  onReset: () => void
  onRun: () => void
  onStop: () => void
  runs: SavedRun[]
  viewingRunId: string | null
  historyOpen: boolean
  onToggleHistory: () => void
  compareIds: string[]
  onViewRun: (run: SavedRun) => void
  onExitView: () => void
  onToggleCompare: (id: string) => void
  onDeleteRun: (id: string) => void
  onClearRuns: () => void
  onCompare: () => void
  compareOpen: boolean
  onCloseCompare: () => void
}

export function MultiAgentView({
  scenarios,
  runMode,
  onSwitchRunMode,
  engineState,
  liveTask,
  onLiveTaskChange,
  isOrchestrating,
  liveSpecialists,
  selectedExperts,
  onToggleExpert,
  topology,
  onChangeTopology,
  concurrency,
  onChangeConcurrency,
  maxRunTurns,
  onChangeMaxTurns,
  costEstimate,
  usage,
  apiKey,
  isDeployed,
  onLoadScenario,
  onNext,
  onPrev,
  onPlay,
  onPause,
  onReset,
  onRun,
  onStop,
  runs,
  viewingRunId,
  historyOpen,
  onToggleHistory,
  compareIds,
  onViewRun,
  onExitView,
  onToggleCompare,
  onDeleteRun,
  onClearRuns,
  onCompare,
  compareOpen,
  onCloseCompare,
}: MultiAgentViewProps) {
  const activeScenarioId =
    runMode === 'demo' ? engineState.scenarioId : engineState.scenarioId

  const [showContext, setShowContext] = useState(false)
  const hasUsage =
    !!usage &&
    usage.promptTokens + usage.completionTokens > 0
  const perAgentUsage = engineState.perAgentUsage ?? {}
  const contextTimeline = engineState.contextTimeline ?? []
  const contextWindowLimit = engineState.contextWindowLimit ?? 131072

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Control bar — horizontal scroll on narrow screens */}
      <div className="flex-shrink-0 border-b border-slate-700/50 bg-slate-900/40 px-4 py-3 overflow-x-auto">
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {scenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onLoadScenario(s)}
                className={`
                  px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-150 whitespace-nowrap
                  ${activeScenarioId === s.id
                    ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50'
                  }
                `}
              >
                {s.name}
              </button>
            ))}
            <div className="ml-2 inline-flex rounded-lg border border-slate-700/50 overflow-hidden">
              <button
                type="button"
                onClick={() => onSwitchRunMode('demo')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  runMode === 'demo' ? 'bg-slate-700 text-slate-100' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                演示
              </button>
              <button
                type="button"
                onClick={() => onSwitchRunMode('live')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  runMode === 'live' ? 'bg-emerald-500 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                真实运行
              </button>
            </div>
          </div>

          {runMode === 'live' && (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={liveTask}
                onChange={(e) => onLiveTaskChange(e.target.value)}
                placeholder="输入要编排的任务，或保留场景默认描述…"
                className="flex-1 min-w-[200px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
              />

              {/* Topology selector */}
              <div className="inline-flex items-center gap-1">
                <span className="text-[11px] text-slate-500">拓扑</span>
                {(['fan-out', 'debate', 'pipeline'] as Topology[]).map((t) => {
                  const labels: Record<Topology, string> = {
                    'fan-out': '扇出',
                    debate: '辩论',
                    pipeline: '流水线',
                  }
                  const disabled = t === 'debate' && liveSpecialists.length < 2
                  const on = topology === t
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={disabled || isOrchestrating}
                      onClick={() => onChangeTopology(t)}
                      title={disabled ? '辩论模式需要至少 2 个专家' : ''}
                      className={`px-2 py-1 text-[11px] rounded-full border transition-all duration-150 ${
                        on
                          ? 'bg-violet-500/80 text-white border-violet-500'
                          : 'bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-600'
                      } disabled:opacity-50`}
                    >
                      {labels[t]}
                    </button>
                  )
                })}
              </div>

              {/* Expert toggles */}
              {liveSpecialists.length > 0 && (
                <div className="inline-flex items-center gap-1 flex-wrap">
                  <span className="text-[11px] text-slate-500">专家</span>
                  {liveSpecialists.map((sp) => {
                    const on = selectedExperts.includes(sp.id)
                    return (
                      <button
                        key={sp.id}
                        type="button"
                        disabled={isOrchestrating}
                        onClick={() => onToggleExpert(sp.id)}
                        className={`px-2 py-1 text-[11px] rounded-full border transition-all duration-150 ${
                          on
                            ? 'bg-violet-500/80 text-white border-violet-500'
                            : 'bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-600'
                        } disabled:opacity-50`}
                      >
                        {sp.name}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Concurrency */}
              <select
                value={concurrency}
                disabled={isOrchestrating}
                onChange={(e) => onChangeConcurrency(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-violet-500 disabled:opacity-50"
              >
                <option value={0}>并发·全部</option>
                <option value={1}>并发·1</option>
                <option value={2}>并发·2</option>
                <option value={3}>并发·3</option>
              </select>

              {/* Max turns per worker */}
              <div className="inline-flex items-center gap-1">
                <span className="text-[11px] text-slate-500">轮次</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={maxRunTurns}
                  disabled={isOrchestrating}
                  onChange={(e) => onChangeMaxTurns(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                  className="w-14 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-violet-500 disabled:opacity-50"
                />
              </div>

              {/* Cost estimate (recomputed live) */}
              <span
                className="text-[11px] text-yellow-500 whitespace-nowrap"
                title="粗略预估，实际以用量统计为准"
              >
                ≈ {costEstimate.promptTokens + costEstimate.completionTokens} tok · {costEstimate.costCNY}
              </span>
              {usage &&
                usage.promptTokens + usage.completionTokens > 0 && (
                  <span className="text-[11px] text-emerald-300 whitespace-nowrap">
                    实测 {usage.promptTokens + usage.completionTokens} tok
                  </span>
                )}

              {/* Context budget toggle */}
              {hasUsage && (
                <button
                  type="button"
                  onClick={() => setShowContext((v) => !v)}
                  className={`text-[11px] px-2 py-1 rounded-full border transition-all duration-150 whitespace-nowrap ${
                    showContext
                      ? 'bg-violet-500/80 text-white border-violet-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600 hover:text-slate-300'
                  }`}
                  title="上下文窗口可视化"
                >
                  📊 上下文
                </button>
              )}

              {isOrchestrating ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={onStop}
                  leftIcon={
                    <span className="spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full" />
                  }
                >
                  ■ 停止
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onRun}
                  disabled={engineState.scenario === null || (!apiKey && !isDeployed)}
                >
                  ▶ 运行
                </Button>
              )}
              {!apiKey && !isDeployed && (
                <span className="text-[11px] text-yellow-500 whitespace-nowrap">需在设置中配置 API Key</span>
              )}
            </div>
          )}

          <RunHistoryPanel
            runs={runs}
            viewingRunId={viewingRunId}
            open={historyOpen}
            compareIds={compareIds}
            onToggleOpen={onToggleHistory}
            onView={onViewRun}
            onExit={onExitView}
            onToggleCompare={onToggleCompare}
            onDelete={onDeleteRun}
            onClear={onClearRuns}
            onCompare={onCompare}
          />
        </div>
      </div>

      {/* Main: MultiAgentFlow visualization */}
      <main className="flex-1 min-h-0 relative">
        <MultiAgentFlow
          engineState={engineState}
          onNext={onNext}
          onPrev={onPrev}
          onPlay={onPlay}
          onPause={onPause}
          onReset={onReset}
        />

        {/* Context budget overlay panel */}
        {showContext && hasUsage && (
          <div className="absolute top-3 right-3 w-72 max-w-[calc(100vw-2rem)] z-30 max-h-[calc(100%-1.5rem)] overflow-y-auto">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowContext(false)}
                className="absolute -top-1 -right-1 z-10 w-5 h-5 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] ring-1 ring-white/10"
                title="关闭"
              >
                ✕
              </button>
              <ContextBudgetPanel
                usage={usage!}
                perAgentUsage={perAgentUsage}
                contextTimeline={contextTimeline}
                contextWindowLimit={contextWindowLimit}
                scenario={engineState.scenario}
              />
            </div>
          </div>
        )}
      </main>

      {/* Run comparison modal */}
      {compareOpen && compareIds.length === 2 && (() => {
        const a = runs.find((r) => r.id === compareIds[0])
        const b = runs.find((r) => r.id === compareIds[1])
        if (!a || !b) return null
        const col = (r: SavedRun) => (
          <div className="flex-1 min-w-0 rounded-xl border border-slate-700 bg-slate-900/50 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                {r.topology === 'fan-out' ? '扇出' : r.topology === 'debate' ? '辩论' : '流水线'}
              </span>
              <span className="text-xs font-semibold text-slate-100 truncate">{r.scenarioName}</span>
            </div>
            <div className="text-[11px] text-slate-500 mb-1">任务：{r.task || '(默认)'}</div>
            <div className="text-[11px] text-slate-400 mb-1">模型：{r.model}</div>
            <div className="text-[11px] text-emerald-400/80 mb-2">
              用量：{r.usage.promptTokens + r.usage.completionTokens} tok
              （输入 {r.usage.promptTokens} / 输出 {r.usage.completionTokens}）
            </div>
            <div className="text-[11px] text-slate-400 mb-1 font-medium">最终答案：</div>
            <div className="text-[11px] text-slate-300 max-h-56 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {extractFinalAnswer(r.timeline) || '(无)'}
            </div>
          </div>
        )
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={onCloseCompare}
          >
            <div
              className="w-full max-w-3xl rounded-xl border border-slate-700 bg-slate-900 p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-100">运行对比</span>
                <button
                  type="button"
                  onClick={onCloseCompare}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                {col(a)}
                {col(b)}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
