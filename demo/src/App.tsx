// ============================================================
// App — main layout: selector | left Chat + right Flow | bottom controls
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { AgentLoop, createInitialState } from '@/engine/agent'
import { scenarios } from '@/engine/scenarios'
import type { AgentState, Scenario } from '@/engine/types'
import ChatPanel from '@/components/ChatPanel'
import AgentFlow from '@/components/AgentFlow'
import StepTimeline from '@/components/StepTimeline'
import ScenarioSelector from '@/components/ScenarioSelector'

export default function App() {
  const [state, setState] = useState<AgentState>(createInitialState())
  const agentRef = useRef<AgentLoop | null>(null)

  // Initialize agent loop
  useEffect(() => {
    const agent = new AgentLoop({
      onStateChange: (newState) => setState(newState),
    })
    agentRef.current = agent
    return () => agent.destroy()
  }, [])

  const handleSelectScenario = useCallback(
    (scenario: Scenario) => {
      agentRef.current?.loadScenario(scenario)
    },
    [],
  )

  const handlePrev = useCallback(() => agentRef.current?.prev(), [])
  const handleNext = useCallback(() => agentRef.current?.next(), [])
  const handlePlay = useCallback(() => agentRef.current?.play(2000), [])
  const handlePause = useCallback(() => agentRef.current?.pause(), [])
  const handleReset = useCallback(() => agentRef.current?.reset(), [])

  const steps = state.scenario?.steps ?? []
  const totalSteps = steps.length
  const currentIdx = state.currentStepIndex
  const isComplete = currentIdx >= totalSteps - 1 && totalSteps > 0
  // Has the current playback reached the step where the agent responds?
  const responseStepIndex = steps.findIndex((s) => s.type === 'response')
  const responseStepReached = responseStepIndex !== -1 && currentIdx >= responseStepIndex
  const hasScenario = state.scenario !== null
  const canGoPrev = currentIdx >= 0
  const canGoNext = currentIdx < totalSteps - 1

  return (
    <div className="h-screen bg-slate-900 text-slate-100 flex flex-col overflow-hidden">
      {/* === Top bar: Scenario selector === */}
      <header className="flex-shrink-0 border-b border-slate-700/50 px-4 py-3 bg-slate-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-slate-100 whitespace-nowrap">
            🤖 Agent Tool System Demo
          </h1>
          <div className="flex-1 max-w-xl">
            <ScenarioSelector
              scenarios={scenarios}
              activeScenarioId={state.scenarioId}
              onSelect={handleSelectScenario}
            />
          </div>
        </div>
      </header>

      {/* === Main content: Left Chat + Right Agent Flow === */}
      <main className="flex-1 flex min-h-0">
        {/* Left: Chat Panel */}
        <section className="w-1/2 min-w-0 border-r border-slate-700/50 flex flex-col">
          <div className="px-4 py-2 border-b border-slate-700/30 bg-slate-800/50">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              💬 对话面板
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <ChatPanel
              messages={state.scenario?.messages ?? []}
              responseStepReached={responseStepReached}
            />
          </div>
        </section>

        {/* Right: Agent Flow */}
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

      {/* === Bottom: Step Timeline + Playback Controls === */}
      <footer className="flex-shrink-0 border-t border-slate-700/50 bg-slate-900/90 backdrop-blur-sm">
        {/* Step timeline */}
        {hasScenario && steps.length > 0 && (
          <div className="px-4 pt-2 border-b border-slate-800">
            <StepTimeline
              steps={steps}
              currentStepIndex={currentIdx}
              onStepClick={(i) => {
                // Jump to step by resetting and advancing
                const loop = agentRef.current
                if (loop && state.scenario) {
                  loop.pause()
                  loop.reset()
                  // Use microtask to allow reset to flush before advancing
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

        {/* Playback controls */}
        <div className="flex items-center justify-center gap-4 px-4 py-3">
          {/* Reset */}
          <button
            type="button"
            onClick={handleReset}
            disabled={!hasScenario}
            className="
              px-3 py-1.5 text-xs font-medium rounded-lg
              bg-slate-800 hover:bg-slate-700 text-slate-300
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors border border-slate-700
            "
            title="重置"
          >
            ⏮ 重置
          </button>

          {/* Previous step */}
          <button
            type="button"
            onClick={handlePrev}
            disabled={!canGoPrev}
            className="
              px-4 py-2 text-sm font-medium rounded-lg
              bg-slate-800 hover:bg-slate-700 text-slate-200
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors border border-slate-700
            "
            title="上一步"
          >
            ⏪ 上一步
          </button>

          {/* Play / Pause */}
          {state.isPlaying ? (
            <button
              type="button"
              onClick={handlePause}
              className="
                px-6 py-2 text-sm font-semibold rounded-lg
                bg-yellow-600 hover:bg-yellow-500 text-white
                transition-colors shadow-lg shadow-yellow-500/20
              "
              title="暂停"
            >
              ⏸ 暂停
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePlay}
              disabled={!hasScenario || isComplete}
              className="
                px-6 py-2 text-sm font-semibold rounded-lg
                bg-emerald-600 hover:bg-emerald-500 text-white
                disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed
                transition-colors shadow-lg shadow-emerald-500/20
              "
              title="自动播放"
            >
              ▶ 自动播放
            </button>
          )}

          {/* Next step */}
          <button
            type="button"
            onClick={handleNext}
            disabled={!canGoNext}
            className="
              px-4 py-2 text-sm font-medium rounded-lg
              bg-slate-800 hover:bg-slate-700 text-slate-200
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors border border-slate-700
            "
            title="下一步"
          >
            下一步 ⏩
          </button>

          {/* Progress */}
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
    </div>
  )
}
