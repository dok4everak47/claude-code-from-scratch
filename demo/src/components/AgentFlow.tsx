// ============================================================
// AgentFlow — vertical timeline showing agent thinking process
// ============================================================

import type { AgentStep } from '@/engine/types'
import ToolCard from './ToolCard'

interface AgentFlowProps {
  steps: AgentStep[]
  currentStepIndex: number
}

export default function AgentFlow({ steps, currentStepIndex }: AgentFlowProps) {
  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
        <span className="text-4xl">🧠</span>
        <p className="text-sm">选择一个场景开始观察 Agent 思考过程</p>
      </div>
    )
  }

  return (
    <div className="relative pl-6">
      {/* Vertical timeline line */}
      <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-700/50" />

      <div className="space-y-4">
        {steps.map((step, i) => {
          const isCompleted = i <= currentStepIndex
          const isCurrent = i === currentStepIndex
          const isPending = i > currentStepIndex

          return (
            <div
              key={step.id}
              className={`relative transition-all duration-500 ${
                isPending ? 'opacity-30' : 'opacity-100'
              }`}
            >
              {/* Timeline dot */}
              <div
                className={`
                  absolute -left-[23px] top-2 w-3 h-3 rounded-full border-2
                  transition-all duration-300
                  ${isCurrent ? 'border-blue-400 bg-blue-500 shadow-lg shadow-blue-500/50 scale-125' : ''}
                  ${isCompleted && !isCurrent ? 'border-emerald-500 bg-emerald-500/50' : ''}
                  ${isPending ? 'border-slate-600 bg-slate-800' : ''}
                `}
              />

              {/* Step content */}
              {step.type === 'tool_call' && step.toolCall ? (
                <ToolCard toolCall={step.toolCall} isActive={isCurrent} />
              ) : step.type === 'thought' ? (
                <div
                  className={`
                    rounded-lg border px-3 py-2.5
                    transition-all duration-300
                    ${isCurrent
                      ? 'bg-violet-900/20 border-violet-700/50 ring-2 ring-violet-500/30'
                      : 'bg-slate-800/30 border-slate-700/30'
                    }
                  `}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">🤔</span>
                    <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">
                      思考中...
                    </span>
                    <span className="text-[10px] text-slate-500 ml-auto">{step.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{step.content}</p>
                </div>
              ) : (
                /* response type */
                <div
                  className={`
                    rounded-lg border px-3 py-2.5
                    transition-all duration-300
                    ${isCurrent
                      ? 'bg-emerald-900/20 border-emerald-700/50 ring-2 ring-emerald-500/30'
                      : 'bg-slate-800/30 border-slate-700/30'
                    }
                  `}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">💬</span>
                    <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                      最终回复
                    </span>
                    <span className="text-[10px] text-slate-500 ml-auto">{step.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{step.content}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
