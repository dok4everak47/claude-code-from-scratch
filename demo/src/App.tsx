// ============================================================
// App — main controller: state + handlers, renders AppShell + active view
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { OrchestrationEngine, type Topology } from '@/engine/orchestrationEngine'
import { estimateRunTokens, estimateRunCostUSD, formatCostCNY } from '@/engine/cost'
import type { SavedRun } from '@/engine/runHistory'
import { loadRuns, addRun, deleteRun, clearRuns } from '@/engine/runHistory'
import type { LLMConfig } from '@/engine/llm'
import { multiAgentScenarios } from '@/engine/multiAgentScenarios'
import ApiSettings from '@/components/ApiSettings'
import { Button } from '@/components/Button'
import { AppShell } from '@/components/AppShell'
import { ScenarioView } from '@/views/ScenarioView'
import { LiveView } from '@/views/LiveView'
import { ComparisonView, type ComparisonHistoryEntry } from '@/views/ComparisonView'
import { MultiAgentView } from '@/views/MultiAgentView'

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
    localStorage.setItem('agent-demo-active-mode', mode)  }, [mode])

  // ---- Theme (dark / light) ----
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const t = localStorage.getItem('agent-demo-theme')
      if (t === 'light' || t === 'dark') return t
    } catch { /* ignore */ }
    return 'dark'
  })
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('theme-light', theme === 'light')
    try { localStorage.setItem('agent-demo-theme', theme) } catch { /* ignore */ }
  }, [theme])
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

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
  const [selectedExperts, setSelectedExperts] = useState<string[]>([])
  const [concurrency, setConcurrency] = useState(0)
  const [maxRunTurns, setMaxRunTurns] = useState(4)
  const [topology, setTopology] = useState<Topology>('fan-out')
  const selectedScenarioRef = useRef<MultiAgentScenario | null>(null)

  // ---- Live run history (persisted to localStorage) ----
  const [runHistory, setRunHistory] = useState<SavedRun[]>(() => loadRuns())
  const [viewingRunId, setViewingRunId] = useState<string | null>(null)
  const [maHistoryOpen, setMaHistoryOpen] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)

  /** Specialist nodes of the currently-selected scenario (for the live toggle UI). */
  const liveSpecialists = useMemo(() => {
    const s = selectedScenarioRef.current
    if (!s) return []
    const coord = s.nodes.find((n) => n.role === 'orchestrator') ?? s.nodes[0]
    return s.nodes.filter((n) => n.id !== coord.id)
  }, [multiAgentRunMode, multiAgentState.scenarioId, orchestrationState.scenarioId])

  /** Cost estimate for the current configuration (recomputed live). */
  const runEstimate = useMemo(() => {
    const enabled = liveSpecialists.filter((s) => selectedExperts.includes(s.id)).length
    const count = enabled || liveSpecialists.length
    const est = estimateRunTokens(count, maxRunTurns, topology)
    return { ...est, costCNY: formatCostCNY(estimateRunCostUSD(apiConfig.model || 'deepseek-chat', count, maxRunTurns, topology)) }
  }, [liveSpecialists, selectedExperts, maxRunTurns, topology, apiConfig.model])

  // ---- History state ----
  const HISTORY_STORAGE_KEY = 'demo-comparison-history'
  const MAX_HISTORY = 20

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
    setViewingRunId(null)
    setLiveTask(scenario.description)
    const coord = scenario.nodes.find((n) => n.role === 'orchestrator') ?? scenario.nodes[0]
    const allSpecialists = scenario.nodes.filter((n) => n.id !== coord.id).map((n) => n.id)
    setSelectedExperts(allSpecialists)
    if (multiAgentRunMode === 'demo') {
      multiAgentEngineRef.current?.loadScenario(scenario)
    } else {
      orchestrationEngineRef.current?.loadRoster(scenario, {
        enabledExperts: allSpecialists,
        concurrency,
        maxTurns: maxRunTurns,
        topology,
      })
    }
  }, [multiAgentRunMode, concurrency, maxRunTurns, topology])

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
    else orchestrationEngineRef.current?.loadRoster(scenario, {
      enabledExperts: selectedExperts,
      concurrency,
      maxTurns: maxRunTurns,
      topology,
    })
  }, [selectedExperts, concurrency, maxRunTurns, topology])

  const handleMultiAgentRun = useCallback(async () => {
    const scenario = selectedScenarioRef.current
    if (!scenario) return
    const cfg: LLMConfig = {
      apiKey: apiConfig.apiKey,
      baseUrl: apiConfig.baseUrl,
      model: apiConfig.model,
      maxTurns: apiConfig.maxTurns,
    }
    const savedTask = liveTask
    const savedTopology = topology
    const savedModel = apiConfig.model || 'deepseek-v4-flash'
    orchestrationEngineRef.current?.loadRoster(scenario, {
      enabledExperts: selectedExperts,
      concurrency,
      maxTurns: maxRunTurns,
      topology,
    })
    setIsOrchestrating(true)
    try {
      await orchestrationEngineRef.current?.run(cfg, liveTask)
    } finally {
      setIsOrchestrating(false)
      // Persist the completed run so it can be replayed / compared later.
      const engine = orchestrationEngineRef.current
      const st = engine?.getState()
      const timeline = engine?.getTimeline() ?? []
      if (st?.scenario && timeline.length > 0) {
        const run: SavedRun = {
          id: `run-${Date.now()}`,
          savedAt: Date.now(),
          scenarioId: st.scenario.id,
          scenarioName: st.scenario.name,
          topology: savedTopology,
          task: savedTask,
          model: savedModel,
          usage: st.usage ?? { promptTokens: 0, completionTokens: 0 },
          scenario: st.scenario,
          timeline,
        }
        setRunHistory(addRun(run))
        setViewingRunId(null)
      }
    }
  }, [apiConfig, liveTask, selectedExperts, concurrency, maxRunTurns, topology])

  /** Load a saved run into the engine for offline replay (no LLM calls). */
  const viewRun = useCallback((run: SavedRun) => {
    orchestrationEngineRef.current?.loadFromHistory({
      scenario: run.scenario,
      timeline: run.timeline,
      usage: run.usage,
    })
    setLiveTask(run.task)
    setViewingRunId(run.id)
    setMultiAgentRunMode('live')
  }, [])

  /** Exit history-view mode, reload the current scenario's fresh roster. */
  const exitView = useCallback(() => {
    setViewingRunId(null)
    const scenario = selectedScenarioRef.current
    if (scenario) {
      orchestrationEngineRef.current?.loadRoster(scenario, {
        enabledExperts: selectedExperts,
        concurrency,
        maxTurns: maxRunTurns,
        topology,
      })
    }
  }, [selectedExperts, concurrency, maxRunTurns, topology])

  /** Toggle a run's selection for side-by-side comparison. */
  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-2),
    )
  }, [])

  const handleMultiAgentStop = useCallback(() => {
    orchestrationEngineRef.current?.stop()
    setIsOrchestrating(false)
  }, [])

  /** Re-load the live roster with current expert/concurrency/turn/topology config. */
  const reconfigureOrchestration = useCallback(
    (nextExperts: string[], nextConcurrency: number, nextTurns: number, nextTopology: Topology = topology) => {
      const scenario = selectedScenarioRef.current
      if (!scenario || multiAgentRunMode !== 'live' || isOrchestrating) return
      orchestrationEngineRef.current?.loadRoster(scenario, {
        enabledExperts: nextExperts,
        concurrency: nextConcurrency,
        maxTurns: nextTurns,
        topology: nextTopology,
      })
    },
    [multiAgentRunMode, isOrchestrating, topology],
  )

  const changeTopology = useCallback(
    (t: Topology) => {
      setTopology(t)
      reconfigureOrchestration(selectedExperts, concurrency, maxRunTurns, t)
    },
    [selectedExperts, concurrency, maxRunTurns, reconfigureOrchestration],
  )

  const toggleExpert = useCallback(
    (id: string) => {
      const next = selectedExperts.includes(id)
        ? selectedExperts.filter((x) => x !== id)
        : [...selectedExperts, id]
      setSelectedExperts(next)
      reconfigureOrchestration(next, concurrency, maxRunTurns)
    },
    [selectedExperts, concurrency, maxRunTurns, reconfigureOrchestration],
  )

  const changeConcurrency = useCallback(
    (c: number) => {
      setConcurrency(c)
      reconfigureOrchestration(selectedExperts, c, maxRunTurns)
    },
    [selectedExperts, maxRunTurns, reconfigureOrchestration],
  )

  const changeMaxTurns = useCallback(
    (t: number) => {
      setMaxRunTurns(t)
      reconfigureOrchestration(selectedExperts, concurrency, t)
    },
    [selectedExperts, concurrency, reconfigureOrchestration],
  )

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
  // AppShell sub-header (API settings) + right-slot (settings toggle)
  // ============================================================

  const rightSlot = !isDeployed ? (
    <Button
      variant={settingsOpen ? 'primary' : 'secondary'}
      size="sm"
      onClick={() => setSettingsOpen((o) => !o)}
    >
      ⚙️ API 设置
    </Button>
  ) : null

  // ============================================================
  // Render
  // ============================================================

  return (
    <AppShell mode={mode} onModeChange={setMode} rightSlot={rightSlot} theme={theme} onToggleTheme={toggleTheme} subHeader={
      !isDeployed ? (
        <ApiSettings
          config={apiConfig}
          onChange={setApiConfig}
          isOpen={settingsOpen}
          onToggle={() => setSettingsOpen(false)}
        />
      ) : undefined
    }>
      {mode === 'scenario' && (
        <ScenarioView
          scenarioState={scenarioState}
          steps={steps}
          currentStepIndex={currentIdx}
          totalSteps={totalSteps}
          isComplete={isComplete}
          hasScenario={hasScenario}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          responseStepReached={responseStepReached}
          scenarios={scenarios}
          onSelectScenario={handleSelectScenario}
          onReset={handleScenarioReset}
          onPrev={handleScenarioPrev}
          onPlay={handleScenarioPlay}
          onPause={handleScenarioPause}
          onNext={handleScenarioNext}
          onJumpTo={handleScenarioJumpTo}
        />
      )}

      {mode === 'live' && (
        <LiveView
          liveState={liveState}
          maxTurns={apiConfig.maxTurns}
          onSend={handleLiveSend}
          onStop={handleLiveStop}
          onRetry={handleLiveRetry}
          onExport={handleLiveExport}
        />
      )}

      {mode === 'comparison' && (
        <ComparisonView
          comparisonState={comparisonState}
          comparisonDraft={comparisonDraft}
          onDraftChange={setComparisonDraft}
          comparisonSubMode={comparisonSubMode}
          onSubModeChange={setComparisonSubMode}
          comparisonHistory={comparisonHistory}
          viewingHistory={viewingHistory}
          historyOpen={historyOpen}
          onHistoryOpenChange={setHistoryOpen}
          onRun={handleComparisonRun}
          onStop={handleComparisonStop}
          onRetry={handleComparisonRetry}
          onStopSingle={handleComparisonStopSingle}
          onHistorySelect={handleHistorySelect}
          onHistoryDelete={handleHistoryDelete}
          onHistoryRerun={handleHistoryRerun}
        />
      )}

      {mode === 'multiAgent' && (
        <MultiAgentView
          scenarios={multiAgentScenarios}
          runMode={multiAgentRunMode}
          onSwitchRunMode={switchMultiAgentRunMode}
          engineState={multiAgentRunMode === 'demo' ? multiAgentState : orchestrationState}
          liveTask={liveTask}
          onLiveTaskChange={setLiveTask}
          isOrchestrating={isOrchestrating}
          liveSpecialists={liveSpecialists}
          selectedExperts={selectedExperts}
          onToggleExpert={toggleExpert}
          topology={topology}
          onChangeTopology={changeTopology}
          concurrency={concurrency}
          onChangeConcurrency={changeConcurrency}
          maxRunTurns={maxRunTurns}
          onChangeMaxTurns={changeMaxTurns}
          costEstimate={{
            promptTokens: runEstimate.promptTokens,
            completionTokens: runEstimate.completionTokens,
            costCNY: runEstimate.costCNY,
          }}
          usage={orchestrationState.usage}
          apiKey={apiConfig.apiKey}
          isDeployed={isDeployed}
          onLoadScenario={handleMultiAgentLoadScenario}
          onNext={handleMultiAgentNext}
          onPrev={handleMultiAgentPrev}
          onPlay={handleMultiAgentPlay}
          onPause={handleMultiAgentPause}
          onReset={handleMultiAgentReset}
          onRun={handleMultiAgentRun}
          onStop={handleMultiAgentStop}
          runs={runHistory}
          viewingRunId={viewingRunId}
          historyOpen={maHistoryOpen}
          onToggleHistory={() => setMaHistoryOpen((o) => !o)}
          compareIds={compareIds}
          onViewRun={viewRun}
          onExitView={exitView}
          onToggleCompare={toggleCompare}
          onDeleteRun={(id) => {
            setRunHistory(deleteRun(id))
            setCompareIds((p) => p.filter((x) => x !== id))
            if (viewingRunId === id) exitView()
          }}
          onClearRuns={() => {
            setRunHistory(clearRuns())
            setCompareIds([])
            setViewingRunId(null)
          }}
          onCompare={() => setCompareOpen(true)}
          compareOpen={compareOpen}
          onCloseCompare={() => setCompareOpen(false)}
        />
      )}
    </AppShell>
  )
}
