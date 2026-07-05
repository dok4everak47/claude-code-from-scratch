// ============================================================
// App — main layout with tab switching:
//   [📋 场景模式] [✨ 自由模式] [🔬 对比模式] + [⚙️ API 设置]
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { AgentLoop, createInitialState } from '@/engine/agent'
import { LiveAgent } from '@/engine/liveAgent'
import { ComparisonAgent, createComparisonState } from '@/engine/comparisonAgent'
import type { ComparisonState } from '@/engine/comparisonAgent'
import { liveTools } from '@/engine/liveTools'
import { scenarios } from '@/engine/scenarios'
import type {
  AgentState,
  ApiConfig,
  Scenario,
  LiveSessionState,
} from '@/engine/types'
import { createLiveSessionState, defaultApiConfig } from '@/engine/types'
import ChatPanel from '@/components/ChatPanel'
import AgentFlow from '@/components/AgentFlow'
import StepTimeline from '@/components/StepTimeline'
import ScenarioSelector from '@/components/ScenarioSelector'
import ApiSettings from '@/components/ApiSettings'

type AppMode = 'scenario' | 'live' | 'comparison'

export default function App() {
  // ---- Mode ----
  const [mode, setMode] = useState<AppMode>('scenario')

  // ---- API Config ----
  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => {
    try {
      const stored = localStorage.getItem('agent-demo-api-config')
      if (stored) return { ...defaultApiConfig(), ...JSON.parse(stored) }
    } catch { /* ignore */ }
    return defaultApiConfig()
  })
  const [settingsOpen, setSettingsOpen] = useState(false)

  // ---- Scenario mode state ----
  const [scenarioState, setScenarioState] = useState<AgentState>(createInitialState())
  const scenarioAgentRef = useRef<AgentLoop | null>(null)

  // ---- Live mode state ----
  const [liveState, setLiveState] = useState<LiveSessionState>(createLiveSessionState())
  const liveAgentRef = useRef<LiveAgent | null>(null)

  // ---- Comparison mode state ----
  const [comparisonState, setComparisonState] = useState<ComparisonState>(createComparisonState())
  const comparisonAgentRef = useRef<ComparisonAgent | null>(null)
  const [comparisonDraft, setComparisonDraft] = useState('')

  // ============================================================
  // Initialize all agents
  // ============================================================

  useEffect(() => {
    // Scenario agent
    const scenarioAgent = new AgentLoop({
      onStateChange: (s) => setScenarioState(s),
    })
    scenarioAgentRef.current = scenarioAgent

    // Live agent
    const liveAgent = new LiveAgent(
      {
        apiKey: apiConfig.apiKey,
        baseUrl: apiConfig.baseUrl,
        model: apiConfig.model,
        maxTurns: apiConfig.maxTurns,
        systemPrompt: apiConfig.systemPrompt,
      },
      { onStateChange: (s) => setLiveState(s) },
    )
    liveAgent.setTools(liveTools)
    liveAgentRef.current = liveAgent

    // Comparison agent
    const comparisonAgent = new ComparisonAgent(
      {
        apiKey: apiConfig.apiKey,
        baseUrl: apiConfig.baseUrl,
        model: apiConfig.model,
        maxTurns: apiConfig.maxTurns,
      },
      { onStateChange: (s) => setComparisonState(s) },
    )
    comparisonAgentRef.current = comparisonAgent

    return () => {
      scenarioAgent.destroy()
      liveAgent.stop()
      comparisonAgent.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync config to live agent when config changes
  useEffect(() => {
    if (liveAgentRef.current) {
      liveAgentRef.current.setConfig({
        apiKey: apiConfig.apiKey,
        baseUrl: apiConfig.baseUrl,
        model: apiConfig.model,
        maxTurns: apiConfig.maxTurns,
        systemPrompt: apiConfig.systemPrompt,
      })
    }
    if (comparisonAgentRef.current) {
      comparisonAgentRef.current.setConfig({
        apiKey: apiConfig.apiKey,
        baseUrl: apiConfig.baseUrl,
        model: apiConfig.model,
        maxTurns: apiConfig.maxTurns,
      })
    }
  }, [apiConfig])

  // ============================================================
  // Scenario mode handlers
  // ============================================================

  const handleSelectScenario = useCallback((scenario: Scenario) => {
    scenarioAgentRef.current?.loadScenario(scenario)
  }, [])

  const handleScenarioPrev = useCallback(() => scenarioAgentRef.current?.prev(), [])
  const handleScenarioNext = useCallback(() => scenarioAgentRef.current?.next(), [])
  const handleScenarioPlay = useCallback(() => scenarioAgentRef.current?.play(2000), [])
  const handleScenarioPause = useCallback(() => scenarioAgentRef.current?.pause(), [])
  const handleScenarioReset = useCallback(() => scenarioAgentRef.current?.reset(), [])
  const handleScenarioJumpTo = useCallback(
    (i: number) => {
      const loop = scenarioAgentRef.current
      if (loop && scenarioState.scenario) {
        loop.pause()
        loop.reset()
        setTimeout(() => {
          for (let n = 0; n <= i; n++) {
            loop.next()
          }
        }, 50)
      }
    },
    [scenarioState.scenario],
  )

  // ============================================================
  // Live mode handlers
  // ============================================================

  const handleLiveSend = useCallback(
    (text: string) => {
      liveAgentRef.current?.run(text)
    },
    [],
  )

  const handleLiveStop = useCallback(() => {
    liveAgentRef.current?.stop()
  }, [])

  const handleLiveRetry = useCallback(() => {
    liveAgentRef.current?.reset()
  }, [])

  const handleLiveExport = useCallback(() => {
    const state = liveAgentRef.current?.getState()
    if (!state || state.messages.length === 0) return
    const json = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        config: {
          model: apiConfig.model,
          maxTurns: apiConfig.maxTurns,
        },
        messages: state.messages,
        steps: state.steps,
      },
      null,
      2,
    )
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agent-conversation-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [apiConfig])

  // ============================================================
  // Comparison mode handlers
  // ============================================================

  const handleComparisonRun = useCallback(() => {
    const text = comparisonDraft.trim()
    if (!text || comparisonState.isRunning) return
    setComparisonDraft('')
    comparisonAgentRef.current?.run(text)
  }, [comparisonDraft, comparisonState.isRunning])

  const handleComparisonStop = useCallback(() => {
    comparisonAgentRef.current?.stop()
  }, [])

  const handleComparisonRetry = useCallback(() => {
    comparisonAgentRef.current?.reset()
    setComparisonDraft('')
  }, [])

  const handleComparisonStopSingle = useCallback((index: number) => {
    comparisonAgentRef.current?.stop(index)
  }, [])

  // ============================================================
  // Derived scenario state
  // ============================================================

  const steps = scenarioState.scenario?.steps ?? []
  const totalSteps = steps.length
  const currentIdx = scenarioState.currentStepIndex
  const isComplete = currentIdx >= totalSteps - 1 && totalSteps > 0
  const responseStepIndex = steps.findIndex((s) => s.type === 'response')
  const responseStepReached = responseStepIndex !== -1 && currentIdx >= responseStepIndex
  const hasScenario = scenarioState.scenario !== null
  const canGoPrev = currentIdx >= 0
  const canGoNext = currentIdx < totalSteps - 1

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="h-screen bg-slate-900 text-slate-100 flex flex-col overflow-hidden">
      {/* === Top bar: Tabs + Settings toggle === */}
      <header className="flex-shrink-0 border-b border-slate-700/50 px-4 py-3 bg-slate-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-slate-100 whitespace-nowrap">
            🤖 Agent Tool System Demo
          </h1>

          {/* Mode tabs */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setMode('scenario')}
              className={`
                px-3 py-1.5 text-sm font-medium rounded-md transition-all
                ${mode === 'scenario'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
                }
              `}
            >
              📋 场景模式
            </button>
            <button
              type="button"
              onClick={() => setMode('live')}
              className={`
                px-3 py-1.5 text-sm font-medium rounded-md transition-all
                ${mode === 'live'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
                }
              `}
            >
              ✨ 自由模式
            </button>
            <button
              type="button"
              onClick={() => setMode('comparison')}
              className={`
                px-3 py-1.5 text-sm font-medium rounded-md transition-all
                ${mode === 'comparison'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
                }
              `}
            >
              🔬 对比模式
            </button>
          </div>

          {/* Settings button */}
          <button
            type="button"
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={`
              px-3 py-1.5 text-sm font-medium rounded-lg transition-all flex-shrink-0
              ${settingsOpen
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }
            `}
            title="API 设置"
          >
            ⚙️ API 设置
          </button>

          {/* Scenario selector (only in scenario mode) */}
          {mode === 'scenario' && (
            <div className="flex-1 max-w-xl">
              <ScenarioSelector
                scenarios={scenarios}
                activeScenarioId={scenarioState.scenarioId}
                onSelect={handleSelectScenario}
              />
            </div>
          )}

          {/* Live mode status (only in live mode) */}
          {mode === 'live' && (
            <div className="flex-1 flex items-center justify-end gap-3">
              {liveState.isLoading ? (
                <span className="text-xs text-yellow-400 flex items-center gap-1.5">
                  <span className="spin inline-block w-3 h-3 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full" />
                  Agent 思考中...
                </span>
              ) : liveState.error ? (
                <span className="text-xs text-red-400">{liveState.error}</span>
              ) : (
                <span className="text-xs text-slate-500">
                  {liveState.messages.length > 0
                    ? `对话中 · ${liveState.messages.length} 条消息`
                    : '输入问题开始对话'}
                </span>
              )}
            </div>
          )}

          {/* Comparison mode status */}
          {mode === 'comparison' && (
            <div className="flex-1 flex items-center justify-end gap-3">
              {comparisonState.isRunning ? (
                <span className="text-xs text-yellow-400 flex items-center gap-1.5">
                  <span className="spin inline-block w-3 h-3 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full" />
                  对比运行中...
                </span>
              ) : comparisonState.userMessage ? (
                <span className="text-xs text-slate-500">
                  对比完成 · 问题：{comparisonState.userMessage.length > 30
                    ? comparisonState.userMessage.slice(0, 30) + '...'
                    : comparisonState.userMessage}
                </span>
              ) : (
                <span className="text-xs text-slate-500">输入问题，对比 3 种策略差异</span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* === API Settings panel (collapsible, shared across modes) === */}
      <ApiSettings
        config={apiConfig}
        onChange={setApiConfig}
        isOpen={settingsOpen}
        onToggle={() => setSettingsOpen(false)}
      />

      {/* ============================================================ */}
      {/* SCENARIO MODE */}
      {/* ============================================================ */}
      {mode === 'scenario' && (
        <>
          {/* Main content: Left Chat + Right Agent Flow */}
          <main className="flex-1 flex min-h-0">
            <section className="w-1/2 min-w-0 border-r border-slate-700/50 flex flex-col">
              <div className="px-4 py-2 border-b border-slate-700/30 bg-slate-800/50">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  💬 对话面板
                </span>
              </div>
              <div className="flex-1 min-h-0">
                <ChatPanel
                  variant="scenario"
                  messages={scenarioState.scenario?.messages ?? []}
                  responseStepReached={responseStepReached}
                />
              </div>
            </section>

            <section className="w-1/2 min-w-0 flex flex-col">
              <div className="px-4 py-2 border-b border-slate-700/30 bg-slate-800/50">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  🧠 Agent 思考流程
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                <AgentFlow steps={steps} currentStepIndex={currentIdx} onStepClick={handleScenarioJumpTo} />
              </div>
            </section>
          </main>

          {/* Bottom: Step Timeline + Playback Controls */}
          <footer className="flex-shrink-0 border-t border-slate-700/50 bg-slate-900/90 backdrop-blur-sm">
            {hasScenario && steps.length > 0 && (
              <div className="px-4 pt-2 border-b border-slate-800">
                <StepTimeline
                  steps={steps}
                  currentStepIndex={currentIdx}
                  onStepClick={handleScenarioJumpTo}
                />
              </div>
            )}

            <div className="flex items-center justify-center gap-4 px-4 py-3">
              <button
                type="button"
                onClick={handleScenarioReset}
                disabled={!hasScenario}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-slate-700"
                title="重置"
              >
                ⏮ 重置
              </button>

              <button
                type="button"
                onClick={handleScenarioPrev}
                disabled={!canGoPrev}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-slate-700"
                title="上一步"
              >
                ⏪ 上一步
              </button>

              {scenarioState.isPlaying ? (
                <button
                  type="button"
                  onClick={handleScenarioPause}
                  className="px-6 py-2 text-sm font-semibold rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white transition-colors shadow-lg shadow-yellow-500/20"
                  title="暂停"
                >
                  ⏸ 暂停
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleScenarioPlay}
                  disabled={!hasScenario || isComplete}
                  className="px-6 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors shadow-lg shadow-emerald-500/20"
                  title="自动播放"
                >
                  ▶ 自动播放
                </button>
              )}

              <button
                type="button"
                onClick={handleScenarioNext}
                disabled={!canGoNext}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-slate-700"
                title="下一步"
              >
                下一步 ⏩
              </button>

              <div className="flex items-center gap-2 ml-4">
                <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{
                      width: totalSteps > 0 ? `${((currentIdx + 1) / totalSteps) * 100}%` : '0%',
                    }}
                  />
                </div>
                <span className="text-xs font-mono text-slate-400 w-20 text-center">
                  {hasScenario ? `步骤 ${currentIdx + 1} / ${totalSteps}` : '—'}
                </span>
                {isComplete && (
                  <span className="text-xs font-semibold text-emerald-400">✓ 完成</span>
                )}
              </div>
            </div>
          </footer>
        </>
      )}

      {/* ============================================================ */}
      {/* LIVE / FREE MODE */}
      {/* ============================================================ */}
      {mode === 'live' && (
        <>
          {/* Main content: Left Chat + Right Agent Flow */}
          <main className="flex-1 flex min-h-0">
            <section className="w-1/2 min-w-0 border-r border-slate-700/50 flex flex-col">
              <div className="px-4 py-2 border-b border-slate-700/30 bg-slate-800/50">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  💬 对话面板
                </span>
              </div>
              <div className="flex-1 min-h-0">
                <ChatPanel
                  variant="live"
                  messages={liveState.messages}
                  onSend={handleLiveSend}
                  isLiveLoading={liveState.isLoading}
                />
              </div>
            </section>

            <section className="w-1/2 min-w-0 flex flex-col">
              <div className="px-4 py-2 border-b border-slate-700/30 bg-slate-800/50">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  🧠 Agent 思考流程
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                <AgentFlow
                  steps={liveState.steps}
                  currentStepIndex={liveState.steps.length - 1}
                  isLive
                />
              </div>
            </section>
          </main>

          {/* Bottom: Live controls */}
          <footer className="flex-shrink-0 border-t border-slate-700/50 bg-slate-900/90 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-4 px-4 py-3">
              {/* Stop */}
              <button
                type="button"
                onClick={handleLiveStop}
                disabled={!liveState.isLoading}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-800 hover:bg-red-700 text-red-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-red-700/50"
                title="停止"
              >
                ⏹ 停止
              </button>

              {/* Retry / Clear */}
              <button
                type="button"
                onClick={handleLiveRetry}
                disabled={liveState.isLoading || liveState.messages.length === 0}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-slate-700"
                title="清空对话"
              >
                🔄 清空对话
              </button>

              {/* Export */}
              <button
                type="button"
                onClick={handleLiveExport}
                disabled={liveState.messages.length === 0}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-slate-700"
                title="导出对话"
              >
                💾 导出对话
              </button>

              {/* Turn status */}
              <div className="flex items-center gap-2 ml-4">
                <span className="text-xs font-mono text-slate-400">
                  {liveState.messages.length > 0
                    ? `🔄 第 ${liveState.currentTurn} / ${apiConfig.maxTurns} 轮`
                    : '等待输入...'}
                </span>
                {liveState.error && (
                  <span className="text-xs text-red-400 max-w-xs truncate" title={liveState.error}>
                    ⚠️ {liveState.error}
                  </span>
                )}
              </div>
            </div>
          </footer>
        </>
      )}

      {/* ============================================================ */}
      {/* COMPARISON MODE */}
      {/* ============================================================ */}
      {mode === 'comparison' && (
        <>
          {/* Top: input bar */}
          <div className="flex-shrink-0 border-b border-slate-700/50 px-4 py-3 bg-slate-800/50">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">
                📝 输入问题
              </span>
              <input
                type="text"
                value={comparisonDraft}
                onChange={(e) => setComparisonDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleComparisonRun()
                  }
                }}
                placeholder="输入一个问题，对比 3 种策略的 Tool Call 差异..."
                disabled={comparisonState.isRunning}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
              />
              {comparisonState.isRunning ? (
                <button
                  type="button"
                  onClick={handleComparisonStop}
                  className="px-4 py-1.5 text-sm font-medium rounded-lg bg-red-800 hover:bg-red-700 text-red-200 transition-colors border border-red-700/50 flex-shrink-0"
                >
                  ⏹ 全部停止
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleComparisonRun}
                  disabled={!comparisonDraft.trim()}
                  className="px-4 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:bg-slate-700 disabled:text-slate-500 transition-colors flex-shrink-0"
                >
                  ▶ 运行
                </button>
              )}
              <button
                type="button"
                onClick={handleComparisonRetry}
                disabled={comparisonState.isRunning}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-slate-700 flex-shrink-0"
                title="清空重置"
              >
                🔄 重置
              </button>
            </div>
          </div>

          {/* Middle: 3-column AgentFlow */}
          <main className="flex-1 flex min-h-0">
            {comparisonState.columns.map((col, i) => (
              <ComparisonColumn
                key={col.key}
                column={col}
                isRunning={comparisonState.isRunning}
                onStop={() => handleComparisonStopSingle(i)}
              />
            ))}
          </main>

          {/* Bottom: stats bar */}
          <footer className="flex-shrink-0 border-t border-slate-700/50 bg-slate-900/90 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-6 px-4 py-2.5">
              {comparisonState.columns.map((col) => {
                const toolCount = col.steps.filter((s) => s.type === 'tool_call').length
                const duration = col.endTime && col.startTime
                  ? ((col.endTime - col.startTime) / 1000).toFixed(1) + 's'
                  : col.isLoading
                    ? '运行中...'
                    : '—'
                const toolNames = [...new Set(
                  col.steps
                    .filter((s) => s.type === 'tool_call' && s.toolCall)
                    .map((s) => s.toolCall!.name),
                )]
                return (
                  <div
                    key={col.key}
                    className="flex items-center gap-3 text-xs bg-slate-800/50 rounded-lg px-3 py-1.5 border border-slate-700/30"
                  >
                    <span className="font-semibold text-slate-300">{col.label}</span>
                    <span className="text-slate-500">|</span>
                    <span title={toolNames.join(', ') || '无'}>
                      🔧 <span className="text-slate-300 font-mono">{toolCount}</span>
                      <span className="text-slate-500"> 次调用</span>
                    </span>
                    <span className="text-slate-500">|</span>
                    <span>
                      ⏱ <span className="text-slate-300 font-mono">{duration}</span>
                    </span>
                    {col.error && (
                      <>
                        <span className="text-slate-500">|</span>
                        <span className="text-red-400 truncate max-w-[200px]" title={col.error}>
                          ⚠️ {col.error.length > 30 ? col.error.slice(0, 30) + '...' : col.error}
                        </span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </footer>
        </>
      )}
    </div>
  )
}

// ============================================================
// ComparisonColumn — single column in comparison mode
// ============================================================

function ComparisonColumn({
  column,
  isRunning,
  onStop,
}: {
  column: import('@/engine/comparisonAgent').ComparisonColumnState
  isRunning: boolean
  onStop: () => void
}) {
  const toolCount = column.steps.filter((s) => s.type === 'tool_call').length

  return (
    <section className="flex-1 min-w-0 border-r border-slate-700/50 last:border-r-0 flex flex-col">
      {/* Column header */}
      <div className="px-3 py-2 border-b border-slate-700/30 bg-slate-800/50 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-slate-300 truncate">
            {column.key === 'default' ? '🟢' : column.key === 'aggressive' ? '🟡' : '🔵'}{' '}
            {column.label}
          </span>
          {column.isLoading && (
            <span className="spin inline-block w-3 h-3 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-slate-500 font-mono">
            🔧{toolCount} · 轮{column.currentTurn}
          </span>
          {column.isLoading && (
            <button
              type="button"
              onClick={onStop}
              className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-700/30 transition-colors"
              title="停止此列"
            >
              ⏹
            </button>
          )}
        </div>
      </div>

      {/* Column body: AgentFlow */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {column.steps.length === 0 && !column.isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
            <span className="text-2xl">
              {column.key === 'default' ? '🧠' : column.key === 'aggressive' ? '⚡' : '🛡️'}
            </span>
            <p className="text-[11px] text-center px-2">
              {isRunning ? '等待开始...' : '点击上方「运行」开始对比'}
            </p>
          </div>
        ) : column.error ? (
          <div className="flex flex-col items-center justify-center h-full text-red-400 gap-2 p-3">
            <span className="text-2xl">⚠️</span>
            <p className="text-xs text-center break-all">{column.error}</p>
          </div>
        ) : (
          <AgentFlow
            steps={column.steps}
            currentStepIndex={column.steps.length - 1}
            isLive
          />
        )}
      </div>
    </section>
  )
}
