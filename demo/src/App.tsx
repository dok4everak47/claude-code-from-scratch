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
  MultiAgentScenario,
  MultiAgentEngineState,
} from '@/engine/types'
import { createLiveSessionState, defaultApiConfig, createMultiAgentEngineState } from '@/engine/types'
import { MultiAgentEngine } from '@/engine/multiAgentEngine'
import { OrchestrationEngine } from '@/engine/orchestrationEngine'
import type { LLMConfig } from '@/engine/llm'
import MultiAgentFlow from '@/components/MultiAgentFlow'
import { multiAgentScenarios } from '@/engine/multiAgentScenarios'
import ChatPanel from '@/components/ChatPanel'
import AgentFlow from '@/components/AgentFlow'
import StepTimeline from '@/components/StepTimeline'
import ScenarioSelector from '@/components/ScenarioSelector'
import ApiSettings from '@/components/ApiSettings'

type AppMode = 'scenario' | 'live' | 'comparison' | 'multiAgent'

export default function App() {
  // ---- Detect deployment — when on Vercel, hide API settings panel ----
  const isDeployed = import.meta.env.PROD === true

  // ---- Mode ----
  const [mode, setMode] = useState<AppMode>(() => {
    try {
      const stored = localStorage.getItem('agent-demo-active-mode')
      if (stored === 'scenario' || stored === 'live' || stored === 'comparison' || stored === 'multiAgent') return stored
    } catch { /* ignore */ }
    return 'scenario'
  })

  // Persist active tab to localStorage
  useEffect(() => {
    localStorage.setItem('agent-demo-active-mode', mode)
  }, [mode])

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
  const [comparisonSubMode, setComparisonSubMode] = useState<'summary' | 'detail'>('summary')

  // ---- Multi-Agent mode state ----
  const [multiAgentState, setMultiAgentState] = useState<MultiAgentEngineState>(createMultiAgentEngineState())
  const multiAgentEngineRef = useRef<MultiAgentEngine | null>(null)
  const [orchestrationState, setOrchestrationState] = useState<MultiAgentEngineState>(createMultiAgentEngineState())
  const orchestrationEngineRef = useRef<OrchestrationEngine | null>(null)
  const [multiAgentRunMode, setMultiAgentRunMode] = useState<'demo' | 'live'>('demo')
  const [liveTask, setLiveTask] = useState('')
  const [isOrchestrating, setIsOrchestrating] = useState(false)
  const selectedScenarioRef = useRef<MultiAgentScenario | null>(null)

  // ---- History state ----
  const HISTORY_STORAGE_KEY = 'demo-comparison-history'
  const MAX_HISTORY = 20

  interface HistoryColumnData {
    key: string
    label: string
    toolCallCount: number
    toolCallSequence: string[]
    durationMs: number
    turnCount: number
    summary: string
    error: string | null
  }

  interface ComparisonHistoryEntry {
    id: string
    userMessage: string
    timestamp: number
    columns: HistoryColumnData[]
  }

  const [comparisonHistory, setComparisonHistory] = useState<ComparisonHistoryEntry[]>(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY)
      if (stored) return JSON.parse(stored)
    } catch { /* ignore */ }
    return []
  })
  const [historyOpen, setHistoryOpen] = useState(true)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [viewingHistory, setViewingHistory] = useState<ComparisonHistoryEntry | null>(null)

  // Persist history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(comparisonHistory))
    } catch { /* quota exceeded etc */ }
  }, [comparisonHistory])

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

    // Multi-agent engine
    const multiAgentEngine = new MultiAgentEngine({
      onStateChange: (s) => setMultiAgentState(s),
    })
    multiAgentEngineRef.current = multiAgentEngine

    // Real orchestration engine
    const orchestrationEngine = new OrchestrationEngine({
      onStateChange: (s) => setOrchestrationState(s),
    })
    orchestrationEngineRef.current = orchestrationEngine

    return () => {
      scenarioAgent.destroy()
      liveAgent.stop()
      comparisonAgent.stop()
      multiAgentEngine.destroy()
      orchestrationEngine.destroy()
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
    setComparisonSubMode('detail')
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

  // Auto-switch to summary when all columns finish
  useEffect(() => {
    if (comparisonSubMode === 'detail' &&
        !comparisonState.isRunning &&
        comparisonState.columns.some((c) => c.steps.length > 0)) {
      // Small delay so the last streaming state renders before switching
      const timer = setTimeout(() => setComparisonSubMode('summary'), 800)
      return () => clearTimeout(timer)
    }
  }, [comparisonState.isRunning, comparisonSubMode])

  // Save to history when comparison completes
  useEffect(() => {
    if (comparisonState.isRunning || comparisonState.columns.every((c) => c.steps.length === 0)) return

    const entry: ComparisonHistoryEntry = {
      id: `hist-${Date.now()}`,
      userMessage: comparisonState.userMessage,
      timestamp: Date.now(),
      columns: comparisonState.columns.map((col) => {
        const toolSteps = col.steps.filter((s) => s.type === 'tool_call' && s.toolCall)
        return {
          key: col.key,
          label: col.label,
          toolCallCount: toolSteps.length,
          toolCallSequence: toolSteps.map((s) => s.toolCall!.name),
          durationMs: col.endTime && col.startTime ? col.endTime - col.startTime : 0,
          turnCount: col.currentTurn,
          summary: (col.steps.find((s) => s.type === 'response')?.content ?? '').slice(0, 200),
          error: col.error,
        }
      }),
    }

    setComparisonHistory((prev) => {
      const next = [entry, ...prev]
      return next.slice(0, MAX_HISTORY)
    })
    setSelectedHistoryId(entry.id)
    setViewingHistory(null)
  }, [comparisonState.isRunning])

  // History click handlers
  const handleHistorySelect = useCallback((entry: ComparisonHistoryEntry) => {
    setViewingHistory(entry)
    setSelectedHistoryId(entry.id)
    setComparisonSubMode('summary')
  }, [])

  const handleHistoryDelete = useCallback((id: string) => {
    setComparisonHistory((prev) => prev.filter((e) => e.id !== id))
    if (selectedHistoryId === id) {
      setSelectedHistoryId(null)
      setViewingHistory(null)
    }
  }, [selectedHistoryId])

  const handleHistoryRerun = useCallback((entry: ComparisonHistoryEntry) => {
    setComparisonDraft(entry.userMessage)
    setViewingHistory(null)
    // Directly run - don't wait for state to flush
    setComparisonSubMode('detail')
    comparisonAgentRef.current?.run(entry.userMessage)
  }, [])

  // ============================================================
  // Multi-Agent mode handlers
  // ============================================================

  const handleMultiAgentLoadScenario = useCallback((scenario: MultiAgentScenario) => {
    selectedScenarioRef.current = scenario
    setLiveTask(scenario.description)
    if (multiAgentRunMode === 'demo') {
      multiAgentEngineRef.current?.loadScenario(scenario)
    } else {
      orchestrationEngineRef.current?.loadRoster(scenario)
    }
  }, [multiAgentRunMode])

  const handleMultiAgentNext = useCallback(() => {
    if (multiAgentRunMode === 'demo') multiAgentEngineRef.current?.next()
    else orchestrationEngineRef.current?.next()
  }, [multiAgentRunMode])
  const handleMultiAgentPrev = useCallback(() => {
    if (multiAgentRunMode === 'demo') multiAgentEngineRef.current?.prev()
    else orchestrationEngineRef.current?.prev()
  }, [multiAgentRunMode])
  const handleMultiAgentPlay = useCallback(() => {
    if (multiAgentRunMode === 'demo') multiAgentEngineRef.current?.play(2000)
    else orchestrationEngineRef.current?.play(2000)
  }, [multiAgentRunMode])
  const handleMultiAgentPause = useCallback(() => {
    if (multiAgentRunMode === 'demo') multiAgentEngineRef.current?.pause()
    else orchestrationEngineRef.current?.pause()
  }, [multiAgentRunMode])
  const handleMultiAgentReset = useCallback(() => {
    if (multiAgentRunMode === 'demo') multiAgentEngineRef.current?.reset()
    else orchestrationEngineRef.current?.reset()
  }, [multiAgentRunMode])

  const switchMultiAgentRunMode = useCallback((m: 'demo' | 'live') => {
    setMultiAgentRunMode(m)
    const scenario = selectedScenarioRef.current
    if (!scenario) return
    if (m === 'demo') multiAgentEngineRef.current?.loadScenario(scenario)
    else orchestrationEngineRef.current?.loadRoster(scenario)
  }, [])

  const handleMultiAgentRun = useCallback(async () => {
    const scenario = selectedScenarioRef.current
    if (!scenario) return
    const cfg: LLMConfig = {
      apiKey: apiConfig.apiKey,
      baseUrl: apiConfig.baseUrl,
      model: apiConfig.model,
      maxTurns: apiConfig.maxTurns,
    }
    orchestrationEngineRef.current?.loadRoster(scenario)
    setIsOrchestrating(true)
    try {
      await orchestrationEngineRef.current?.run(cfg, liveTask)
    } finally {
      setIsOrchestrating(false)
    }
  }, [apiConfig, liveTask])

  const handleMultiAgentStop = useCallback(() => {
    orchestrationEngineRef.current?.stop()
    setIsOrchestrating(false)
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
            <button
              type="button"
              onClick={() => setMode('multiAgent')}
              className={`
                px-3 py-1.5 text-sm font-medium rounded-md transition-all
                ${mode === 'multiAgent'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
                }
              `}
            >
              🤖 多 Agent
            </button>
          </div>

          {/* Settings button — hidden on Vercel (proxy mode) */}
          {!isDeployed && (
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
          )}

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

          {/* Multi-Agent scenario selector + run mode */}
          {mode === 'multiAgent' && (
            <div className="flex-1 flex flex-col gap-2 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                {multiAgentScenarios.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleMultiAgentLoadScenario(s)}
                    className={`
                      px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap
                      ${(multiAgentRunMode === 'demo' ? multiAgentState.scenarioId : orchestrationState.scenarioId) === s.id
                        ? 'bg-violet-700 text-white shadow-sm'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                      }
                    `}
                  >
                    {s.name}
                  </button>
                ))}
                <div className="ml-2 inline-flex rounded-lg border border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => switchMultiAgentRunMode('demo')}
                    className={`px-3 py-1.5 text-xs font-medium ${multiAgentRunMode === 'demo' ? 'bg-slate-200 text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}
                  >
                    演示
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMultiAgentRunMode('live')}
                    className={`px-3 py-1.5 text-xs font-medium ${multiAgentRunMode === 'live' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                  >
                    真实运行
                  </button>
                </div>
              </div>
              {multiAgentRunMode === 'live' && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={liveTask}
                    onChange={(e) => setLiveTask(e.target.value)}
                    placeholder="输入要编排的任务，或保留场景默认描述…"
                    className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                  />
                  {isOrchestrating ? (
                    <button
                      type="button"
                      onClick={handleMultiAgentStop}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white whitespace-nowrap"
                    >
                      ■ 停止
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleMultiAgentRun}
                      disabled={!selectedScenarioRef.current || (!apiConfig.apiKey && !isDeployed)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ▶ 运行
                    </button>
                  )}
                  {!apiConfig.apiKey && !isDeployed && (
                    <span className="text-[11px] text-amber-400 whitespace-nowrap">需在设置中配置 API Key</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* === API Settings panel (hidden on Vercel) === */}
	      {!isDeployed && (
	        <ApiSettings
	          config={apiConfig}
	          onChange={setApiConfig}
	          isOpen={settingsOpen}
	          onToggle={() => setSettingsOpen(false)}
	        />
	      )}

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
                  statusFeed={liveState.statusFeed}
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

          {/* Historical comparison panel */}
          {comparisonHistory.length > 0 && (
            <div className="flex-shrink-0 border-b border-slate-700/50 bg-slate-800/30">
              <button
                type="button"
                onClick={() => setHistoryOpen(!historyOpen)}
                className="w-full px-4 py-1.5 flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors"
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
                    const isActive = selectedHistoryId === entry.id
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
                          onClick={() => handleHistorySelect(entry)}
                          className="flex-1 flex items-center gap-2 min-w-0 text-left"
                        >
                          <span className="truncate">{entry.userMessage}</span>
                          <span className="text-slate-600 flex-shrink-0">· {totalCalls} 次调用</span>
                          <span className="text-slate-600 flex-shrink-0">· {relTime}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleHistoryRerun(entry)}
                          className="px-1.5 py-0.5 rounded bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 flex-shrink-0 transition-colors"
                          title="重新运行"
                        >
                          ▶
                        </button>
                        <button
                          type="button"
                          onClick={() => handleHistoryDelete(entry.id)}
                          className="px-1.5 py-0.5 rounded hover:bg-red-900/30 text-slate-500 hover:text-red-400 flex-shrink-0 transition-colors"
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setComparisonSubMode('summary')}
                className={`
                  px-3 py-1 text-xs font-medium rounded-md transition-all
                  ${comparisonSubMode === 'summary'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                  }
                `}
              >
                📊 总结
              </button>
              <button
                type="button"
                onClick={() => setComparisonSubMode('detail')}
                className={`
                  px-3 py-1 text-xs font-medium rounded-md transition-all
                  ${comparisonSubMode === 'detail'
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                  }
                `}
              >
                🔍 详细
              </button>

              {/* Quick status indicator */}
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
            /* === Summary view: compact cards + bottom summary === */
            <>
              <main className="flex-1 flex min-h-0">
                {(viewingHistory ? viewingHistory.columns : comparisonState.columns).map((col, i) => (
                  <ComparisonCard
                    key={col.key}
                    data={col}
                    isLast={i === (viewingHistory ? viewingHistory.columns.length - 1 : comparisonState.columns.length - 1)}
                    onStop={() => !viewingHistory && handleComparisonStopSingle(i)}
                  />
                ))}
              </main>

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
                      <div className="border-t border-slate-700/30 my-2" />
                      <ComparisonSummary columns={comparisonState.columns} />
                    </>
                  )}
                </div>
              </footer>
            </>
          ) : (
            /* === Detail view: 3-column full AgentFlow === */
            <>
              <main className="flex-1 flex min-h-0">
                {comparisonState.columns.map((col, i) => (
                  <section
                    key={col.key}
                    className={`flex-1 min-w-0 flex flex-col ${
                      i < comparisonState.columns.length - 1 ? 'border-r border-slate-700/50' : ''
                    }`}
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
                        <span className="text-[10px] text-slate-500 font-mono">
                          🔧{col.steps.filter((s) => s.type === 'tool_call').length} · 轮{col.currentTurn}
                        </span>
                        {col.isLoading && (
                          <button
                            type="button"
                            onClick={() => handleComparisonStopSingle(i)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-700/30 transition-colors"
                            title="停止此列"
                          >
                            ⏹
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 min-h-0">
                      {col.steps.length === 0 && !col.isLoading ? (
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
                      onClick={() => setComparisonSubMode('summary')}
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
        </>
      )}

      {/* ============================================================ */}
      {/* MULTI-AGENT MODE */}
      {/* ============================================================ */}
      {mode === 'multiAgent' && (
        <main className="flex-1 flex min-h-0">
          <MultiAgentFlow
            engineState={multiAgentRunMode === 'demo' ? multiAgentState : orchestrationState}
            onNext={handleMultiAgentNext}
            onPrev={handleMultiAgentPrev}
            onPlay={handleMultiAgentPlay}
            onPause={handleMultiAgentPause}
            onReset={handleMultiAgentReset}
          />
        </main>
      )}
    </div>
  )
}

// ============================================================
// ComparisonCard — accepts either live state or history data
// ============================================================

function ComparisonCard({
  data,
  isLast,
  onStop,
}: {
  data: import('@/engine/comparisonAgent').ComparisonColumnState | {
    key: string
    label: string
    toolCallCount: number
    toolCallSequence: string[]
    durationMs: number
    turnCount: number
    summary: string
    error: string | null
  }
  isLast: boolean
  onStop?: () => void
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

  // Extract fields — support both live state and history data
  const isLive = 'steps' in data
  const live = data as import('@/engine/comparisonAgent').ComparisonColumnState

  const label = data.label
  const key = data.key
  const error = data.error

  // Tool call info
  const toolCallData: { count: number; sequence: string[] } = isLive
    ? {
        count: live.steps.filter((s) => s.type === 'tool_call').length,
        sequence: live.steps
          .filter((s): s is typeof s & { toolCall: NonNullable<typeof s.toolCall> } => s.type === 'tool_call' && !!s.toolCall)
          .map((s) => s.toolCall.name),
      }
    : { count: data.toolCallCount, sequence: data.toolCallSequence }

  // Duration
  const duration = isLive
    ? live.endTime && live.startTime
      ? ((live.endTime - live.startTime) / 1000).toFixed(1) + 's'
      : live.isLoading ? '运行中...' : '—'
    : data.durationMs > 0 ? (data.durationMs / 1000).toFixed(1) + 's' : '—'

  // Current turn
  const turnCount = isLive ? live.currentTurn : data.turnCount

  // Response summary
  const responseSummary = isLive
    ? (live.steps.find((s) => s.type === 'response')?.content ?? '').slice(0, 100)
    : data.summary.slice(0, 100)

  const hasDetail = isLive && toolCallData.count > 0

  const colorMap: Record<string, { dot: string; bg: string; border: string }> = {
    default: { dot: '🟢', bg: 'from-emerald-900/10 to-transparent', border: 'border-emerald-700/30' },
    aggressive: { dot: '🔴', bg: 'from-red-900/10 to-transparent', border: 'border-red-700/30' },
    conservative: { dot: '🔵', bg: 'from-blue-900/10 to-transparent', border: 'border-blue-700/30' },
  }
  const colors = colorMap[key] ?? colorMap.default

  const isActuallyLoading = isLive ? (data as any).isLoading : false
  const statusIcon = isActuallyLoading
    ? <span className="spin inline-block w-3 h-3 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full" />
    : error
      ? <span className="text-red-400">❌</span>
      : toolCallData.count > 0
        ? <span className="text-emerald-400">✅</span>
        : <span className="text-slate-500">✅</span>

  return (
    <section
      className={`flex-1 min-w-0 flex flex-col border-r border-slate-700/50 ${isLast ? 'border-r-0' : ''}`}
    >
      {/* Card body */}
      <div
        className="flex-1 overflow-y-auto min-h-0"
        onClick={() => hasDetail && setExpanded(!expanded)}
      >
        <div
          className={`h-full p-3 bg-gradient-to-b ${colors.bg} border-b ${colors.border} flex flex-col gap-2.5`}
        >
          {/* Header: strategy name + status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{colors.dot}</span>
              <span className="text-sm font-semibold text-slate-200">{label}</span>
            </div>
            <div className="flex items-center gap-1">
              {statusIcon}
              {isActuallyLoading && onStop && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onStop() }}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-700/30 transition-colors"
                  title="停止此列"
                >
                  ⏹
                </button>
              )}
            </div>
          </div>

          {/* Tool call sequence */}
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

          {/* Stats row: tool count + duration + turns */}
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

          {/* Final answer summary */}
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

          {/* Error */}
          {error && (
            <div className="bg-red-900/20 border border-red-700/30 rounded-lg px-2.5 py-1.5">
              <span className="text-xs text-red-400">{error}</span>
            </div>
          )}
        </div>

        {/* Expanded detail: full AgentFlow (only for live data with steps) */}
        {expanded && hasDetail && (
          <div className="border-t border-slate-700/30">
            <div className="px-3 py-1.5 bg-slate-800/50 border-b border-slate-700/30">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">🧠 详细 Agent 流程</span>
            </div>
            <div className="overflow-y-auto max-h-96 p-2">
              <AgentFlow
                steps={isLive ? (data as any).steps : []}
                currentStepIndex={isLive ? (data as any).steps.length - 1 : 0}
                isLive
              />
            </div>
          </div>
        )}
        {expanded && !hasDetail && (
          <div className="border-t border-slate-700/30 p-3 text-center text-xs text-slate-500">
            历史记录仅保存摘要，不包含详细流程
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
  columns: Array<{
    key: string
    label: string
    toolCallCount: number
    toolCallSequence: string[]
    durationMs: number
    turnCount: number
    summary: string
    error: string | null
  }>
  userMessage: string
}) {
  const lines: string[] = [`📄 问题：${userMessage}`]

  for (const col of columns) {
    const seq = col.toolCallSequence.length > 0
      ? col.toolCallSequence.join(' → ')
      : '没有调用工具，直接使用自身知识回答'
    const dur = col.durationMs > 0 ? (col.durationMs / 1000).toFixed(1) : '?'
    if (col.error) {
      lines.push(`• ${col.label} 执行失败：${col.error}`)
    } else {
      lines.push(`• ${col.label} 调用了 ${col.toolCallCount} 次工具（${seq}），耗时 ${dur}s，共 ${col.turnCount} 轮`)
    }
  }

  // Cross-column comparison
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

function ComparisonMetrics({ columns }: { columns: import('@/engine/comparisonAgent').ComparisonColumnState[] }) {
  // Find best values for highlighting
  const maxCalls = Math.max(...columns.map((c) => c.metrics?.toolCallCount ?? 0))
  const maxRate = Math.max(...columns.map((c) => c.metrics?.successRate ?? 1))
  const minLatency = Math.min(
    ...columns.map((c) => c.metrics?.firstToolLatency ?? Infinity),
  )
  const minDuration = Math.min(
    ...columns.map((c) => c.metrics?.totalDuration ?? Infinity),
  )
  const maxSteps = Math.max(...columns.map((c) => c.metrics?.totalSteps ?? 0))

  const rows: Array<{ label: string; key: keyof import('@/engine/comparisonAgent').ColumnMetrics; format: (v: number | null) => string }> = [
    { label: '工具调用次数', key: 'toolCallCount', format: (v) => String(v ?? 0) },
    { label: '成功率', key: 'successRate', format: (v) => v != null ? `${Math.round(v * 100)}%` : '—' },
    { label: '总运行时长', key: 'totalDuration', format: (v) => v != null ? `${v.toFixed(1)}s` : '—' },
    { label: '总步骤数', key: 'totalSteps', format: (v) => String(v ?? 0) },
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
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-slate-700/20 last:border-0">
                <td className="py-1 pr-3 text-slate-400">{row.label}</td>
                {columns.map((col) => {
                  const val = col.metrics?.[row.key]
                  const display = row.format(val ?? null)
                  // Determine if this value is the best in its row
                  let isBest = false
                  if (row.key === 'successRate') {
                    isBest = val != null && val >= maxRate
                  } else if (row.key === 'firstToolLatency') {
                    isBest = val != null && val <= minLatency
                  } else if (row.key === 'totalDuration') {
                    isBest = val != null && val <= minDuration
                  } else {
                    isBest = val != null && val >= (row.key === 'toolCallCount' ? maxCalls : maxSteps)
                  }
                  return (
                    <td
                      key={col.key}
                      className={`py-1 px-2 text-center font-mono ${
                        isBest ? 'text-emerald-400 font-semibold' : 'text-slate-300'
                      }`}
                    >
                      {display}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================
// ComparisonSummary — auto-generated text at the bottom
// ============================================================

function ComparisonSummary({ columns }: { columns: import('@/engine/comparisonAgent').ComparisonColumnState[] }) {
  const lines: string[] = []

  // Per-column tool call summaries
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

  // Cross-column comparison
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
