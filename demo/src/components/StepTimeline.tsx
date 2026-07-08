// ============================================================
// StepTimeline — horizontal timeline of agent steps
// ============================================================

import type { AgentStep } from '@/engine/types'

interface StepTimelineProps {
  steps: AgentStep[]
  currentStepIndex: number
  onStepClick?: (index: number) => void
}

export default function StepTimeline({ steps, currentStepIndex, onStepClick }: StepTimelineProps) {
  const getStepIcon = (step: AgentStep) => {
    switch (step.type) {
      case 'thought':
        return '🤔'
      case 'tool_call':
        return '🔧'
      case 'response':
        return '💬'
    }
  }

  const getStepLabel = (step: AgentStep, index: number) => {
    switch (step.type) {
      case 'thought':
        return `思考 ${index + 1}`
      case 'tool_call':
        return step.toolCall?.name ?? `工具 ${index + 1}`
      case 'response':
        return '回复'
    }
  }

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-2 px-1">
      {steps.map((step, i) => {
        const isCompleted = i <= currentStepIndex
        const isCurrent = i === currentStepIndex
        const isPending = i > currentStepIndex

        return (
          <div key={step.id} className="flex items-center flex-shrink-0">
            {/* Connector line from previous dot */}
            {i > 0 && (
              <div
                className={`w-6 h-0.5 flex-shrink-0 ${
                  i <= currentStepIndex ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              />
            )}

            {/* Step node */}
            <button
              type="button"
              onClick={() => onStepClick?.(i)}
              disabled={isPending}
              title={step.content}
              className={`
                flex flex-col items-center gap-0.5 flex-shrink-0
                transition-all duration-200 rounded-full px-2 py-1
                ${isCurrent ? 'bg-blue-500/20 scale-110' : ''}
                ${isCompleted && !isCurrent ? 'hover:bg-slate-800/50 cursor-pointer' : ''}
                ${isPending ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {/* Dot */}
              <span
                className={`
                  w-7 h-7 rounded-full flex items-center justify-center text-sm
                  transition-all duration-300
                  ${isCurrent ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900 bg-blue-500/30' : ''}
                  ${isCompleted && !isCurrent ? 'bg-emerald-500/20' : ''}
                  ${isPending ? 'bg-slate-800' : ''}
                `}
              >
                {getStepIcon(step)}
              </span>
              {/* Label */}
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  isCurrent ? 'text-blue-400' : isCompleted ? 'text-emerald-400' : 'text-slate-600'
                }`}
              >
                {getStepLabel(step, i)}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
