// ============================================================
// App — main layout with tab switching:
//   [📋 场景模式] [✨ 自由模式] + [⚙️ API 设置]
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { AgentLoop, createInitialState } from '@/engine/agent'
import { LiveAgent } from '@/engine/liveAgent'
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

type AppMode = 'scenario' | 'live'

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

  // ============================================================
  // Initialize both agents
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

    return () => {
      scenarioAgent.destroy()
      liveAgent.stop()
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
                <AgentFlow steps={steps} currentStepIndex={currentIdx} />
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
                  onStepClick={(i) => {
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
                  }}
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
    </div>
  )
}
