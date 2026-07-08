// ============================================================
// ScenarioView — scenario mode
//   [ScenarioSelector]
//   [ChatPanel] | [AgentFlow]
//   [StepTimeline + PlaybackControls]
// ============================================================

import type { AgentState, AgentStep, Scenario } from '@/engine/types'
import ChatPanel from '@/components/ChatPanel'
import AgentFlow from '@/components/AgentFlow'
import StepTimeline from '@/components/StepTimeline'
import ScenarioSelector from '@/components/ScenarioSelector'
import { PlaybackControls } from '@/components/PlaybackControls'

interface ScenarioViewProps {
  scenarioState: AgentState
  steps: AgentStep[]
  currentStepIndex: number
  totalSteps: number
  isComplete: boolean
  hasScenario: boolean
  canGoPrev: boolean
  canGoNext: boolean
  responseStepReached: boolean
  scenarios: Scenario[]
  onSelectScenario: (scenario: Scenario) => void
  onReset: () => void
  onPrev: () => void
  onPlay: () => void
  onPause: () => void
  onNext: () => void
  onJumpTo: (i: number) => void
}

export function ScenarioView({
  scenarioState,
  steps,
  currentStepIndex,
  totalSteps,
  isComplete,
  hasScenario,
  canGoPrev,
  canGoNext,
  responseStepReached,
  scenarios,
  onSelectScenario,
  onReset,
  onPrev,
  onPlay,
  onPause,
  onNext,
  onJumpTo,
}: ScenarioViewProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top: scenario selector (horizontal scroll on mobile) */}
      <div className="flex-shrink-0 border-b border-slate-700/50 px-4 py-3 bg-slate-900/40 overflow-x-auto">
        <ScenarioSelector
          scenarios={scenarios}
          activeScenarioId={scenarioState.scenarioId}
          onSelect={onSelectScenario}
        />
      </div>

      {/* Middle: Chat + Agent Flow side-by-side on md+, stacked on mobile */}
      <main className="flex-1 flex flex-col md:flex-row min-h-0">
        <section className="flex-1 md:w-1/2 min-w-0 flex flex-col border-b md:border-b-0 md:border-r border-slate-700/50">
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

        <section className="flex-1 md:w-1/2 min-w-0 flex flex-col">
          <div className="px-4 py-2 border-b border-slate-700/30 bg-slate-800/50">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              🧠 Agent 思考流程
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <AgentFlow
              steps={steps}
              currentStepIndex={currentStepIndex}
              onStepClick={onJumpTo}
            />
          </div>
        </section>
      </main>

      {/* Bottom: Step Timeline + Playback Controls */}
      <footer className="flex-shrink-0 border-t border-slate-700/50 bg-slate-900/90 backdrop-blur-sm">
        {hasScenario && steps.length > 0 && (
          <div className="px-4 pt-2 border-b border-slate-800">
            <StepTimeline
              steps={steps}
              currentStepIndex={currentStepIndex}
              onStepClick={onJumpTo}
            />
          </div>
        )}

        <div className="px-4 py-3">
          <PlaybackControls
            currentStep={currentStepIndex}
            totalSteps={totalSteps}
            isPlaying={scenarioState.isPlaying}
            onPrev={onPrev}
            onNext={onNext}
            onPlay={onPlay}
            onPause={onPause}
            onReset={onReset}
            canGoPrev={canGoPrev}
            canGoNext={canGoNext}
            canReset={hasScenario}
            isComplete={isComplete}
          />
        </div>
      </footer>
    </div>
  )
}
