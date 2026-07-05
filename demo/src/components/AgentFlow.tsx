// ============================================================
// AgentFlow — vertical timeline showing agent thinking process
// ============================================================

import { useEffect, useRef } from 'react'
import type { AgentStep } from '@/engine/types'
import ToolCard from './ToolCard'

interface AgentFlowProps {
  steps: AgentStep[]
  currentStepIndex: number
  /** When true, auto-scroll to the latest step (live mode) */
  isLive?: boolean
  /** Callback when a dependency graph node is clicked */
  onStepClick?: (index: number) => void
}

export default function AgentFlow({ steps, currentStepIndex, isLive = false, onStepClick }: AgentFlowProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new steps appear in live mode
  useEffect(() => {
    if (isLive && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [steps.length, isLive])

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
        <span className="text-4xl">🧠</span>
        {isLive ? (
          <p className="text-sm">输入问题，观察 Agent 的实时思考过程</p>
        ) : (
          <p className="text-sm">选择一个场景开始观察 Agent 思考过程</p>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full flex flex-col">
      {/* === Dependency Graph (horizontal flow) === */}
      <DependencyGraph
        steps={steps}
        currentStepIndex={currentStepIndex}
        onStepClick={onStepClick}
      />

      {/* === Vertical timeline === */}
      <div className="relative pl-6 flex-1">
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
                className={`relative transition-all duration-500 step-enter ${
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

          {/* Invisible sentinel for auto-scroll */}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Dependency Graph — horizontal flow chart above the timeline
// ============================================================

function DependencyGraph({
  steps,
  currentStepIndex,
  onStepClick,
}: {
  steps: AgentStep[]
  currentStepIndex: number
  onStepClick?: (index: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the current node in live mode
  useEffect(() => {
    if (scrollRef.current) {
      const currentEl = scrollRef.current.querySelector('[data-current="true"]')
      if (currentEl) {
        currentEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      }
    }
  }, [currentStepIndex])

  const getToolIcon = (name: string) => {
    const map: Record<string, string> = {
      get_weather: '🌤️',
      search_hotel: '🏨',
      search_flight: '✈️',
      search_web: '🔍',
      calculate: '🔢',
      get_time: '🕐',
    }
    return map[name] ?? '🔧'
  }

  const getStatusBadge = (step: AgentStep, i: number) => {
    if (i > currentStepIndex) return null // pending, no badge
    if (step.type !== 'tool_call' || !step.toolCall) return null

    const s = step.toolCall.status
    if (s === 'success') return { icon: '✅', color: 'text-emerald-400', label: '成功' }
    if (s === 'error') return { icon: '❌', color: 'text-red-400', label: '失败' }
    if (s === 'running') return { icon: '⏳', color: 'text-yellow-400', label: '运行中' }
    return { icon: '⏸', color: 'text-slate-400', label: '等待' }
  }

  // Filter to show: thought, tool_call, response (skip consecutive thoughts)
  const graphNodes = steps
    .map((step, i) => ({ step, originalIndex: i }))
    .filter(({ step }) => step.type === 'thought' || step.type === 'tool_call' || step.type === 'response')

  return (
    <div className="flex-shrink-0 border-b border-slate-700/30 bg-slate-800/30 px-3 py-2.5">
      {/* Label */}
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
        📊 工具调用依赖图
      </div>

      {/* Scrollable horizontal flow */}
      <div
        ref={scrollRef}
        className="flex items-center gap-0 overflow-x-auto pb-1"
      >
        {graphNodes.map(({ step, originalIndex }, idx) => {
          const isCurrent = originalIndex === currentStepIndex
          const isPending = originalIndex > currentStepIndex
          const isLast = idx === graphNodes.length - 1

          return (
            <div key={step.id} className="flex items-center flex-shrink-0">
              {/* Node */}
              <button
                type="button"
                data-current={isCurrent ? 'true' : 'false'}
                onClick={() => onStepClick?.(originalIndex)}
                disabled={isPending}
                title={step.content}
                className={`
                  flex items-center gap-2 flex-shrink-0
                  transition-all duration-300
                  ${step.type === 'tool_call'
                    ? 'rounded-lg border px-2.5 py-1.5 min-w-[120px]'
                    : step.type === 'response'
                      ? 'rounded-lg border px-2.5 py-1.5 min-w-[80px]'
                      : 'rounded-xl border px-2.5 py-1.5 min-w-[60px]'
                  }
                  ${isCurrent
                    ? 'ring-2 ring-blue-400/60 shadow-lg shadow-blue-500/15 scale-105 z-10'
                    : ''
                  }
                  ${getNodeColors(step, isCurrent, isPending)}
                  ${!isPending ? 'cursor-pointer hover:brightness-110' : 'cursor-not-allowed'}
                `}
              >
                {/* Icon */}
                <span className="text-base flex-shrink-0">
                  {step.type === 'thought'
                    ? '🤔'
                    : step.type === 'response'
                      ? '💬'
                      : getToolIcon(step.toolCall?.name ?? '')
                  }
                </span>

                {/* Label */}
                <div className="flex flex-col min-w-0">
                  <span
                    className={`text-xs font-medium truncate ${
                      isCurrent ? 'text-slate-100' : isPending ? 'text-slate-600' : 'text-slate-300'
                    }`}
                  >
                    {step.type === 'thought'
                      ? '思考'
                      : step.type === 'response'
                        ? '回复'
                        : (step.toolCall?.name ?? '工具')
                    }
                  </span>
                  {/* Status for tool calls */}
                  {step.type === 'tool_call' && (
                    <StatusLabel step={step} currentStepIndex={currentStepIndex} originalIndex={originalIndex} />
                  )}
                </div>

                {/* Status badge */}
                {(() => {
                  const badge = getStatusBadge(step, originalIndex)
                  if (!badge) return null
                  return (
                    <span className={`text-xs flex-shrink-0 ${badge.color}`} title={badge.label}>
                      {badge.icon}
                    </span>
                  )
                })()}
              </button>

              {/* Arrow to next node */}
              {!isLast && (
                <Arrow
                  isActive={originalIndex < currentStepIndex}
                  isToCurrent={graphNodes[idx + 1]?.originalIndex === currentStepIndex}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// Helper: node color based on step type + state
// ============================================================

function getNodeColors(
  step: AgentStep,
  isCurrent: boolean,
  isPending: boolean,
): string {
  if (isPending) return 'bg-slate-800/30 border-slate-700/40 opacity-40'

  if (step.type === 'thought') {
    if (isCurrent) return 'bg-violet-900/30 border-violet-600/60'
    return 'bg-violet-900/15 border-violet-700/30'
  }

  if (step.type === 'response') {
    if (isCurrent) return 'bg-emerald-900/30 border-emerald-600/60'
    return 'bg-emerald-900/15 border-emerald-700/30'
  }

  // tool_call — color by status
  const status = step.toolCall?.status
  if (status === 'success') return 'bg-emerald-900/20 border-emerald-600/40'
  if (status === 'error') return 'bg-red-900/30 border-red-600/50'
  if (status === 'running') return 'bg-yellow-900/30 border-yellow-600/50 tool-card-running'
  if (isCurrent) return 'bg-blue-900/30 border-blue-600/50'
  return 'bg-slate-800/40 border-slate-600/40'
}

// ============================================================
// Helper: status label under tool name
// ============================================================

function StatusLabel({
  step,
  currentStepIndex,
  originalIndex,
}: {
  step: AgentStep
  currentStepIndex: number
  originalIndex: number
}) {
  const isPending = originalIndex > currentStepIndex
  if (isPending) return null

  const status = step.toolCall?.status
  if (status === 'success') return <span className="text-[10px] text-emerald-400">✅ 成功</span>
  if (status === 'error') return <span className="text-[10px] text-red-400">❌ 失败</span>
  if (status === 'running') return <span className="text-[10px] text-yellow-400 animate-pulse">⏳ 执行中</span>
  return <span className="text-[10px] text-slate-500">⏸ 等待</span>
}

// ============================================================
// Arrow connector between two nodes
// ============================================================

function Arrow({ isActive, isToCurrent }: { isActive: boolean; isToCurrent: boolean }) {
  return (
    <div className="flex items-center flex-shrink-0 px-0.5">
      {/* Line */}
      <div
        className={`
          w-6 h-0.5 transition-all duration-500
          ${isActive ? 'bg-emerald-500' : isToCurrent ? 'bg-blue-400 animate-pulse' : 'bg-slate-700'}
        `}
      />
      {/* Arrowhead */}
      <div
        className={`
          w-0 h-0
          border-t-4 border-b-4 border-l-[6px]
          border-t-transparent border-b-transparent
          transition-all duration-500
          ${isActive
            ? 'border-l-emerald-500'
            : isToCurrent
              ? 'border-l-blue-400'
              : 'border-l-slate-700'
          }
        `}
      />
    </div>
  )
}
