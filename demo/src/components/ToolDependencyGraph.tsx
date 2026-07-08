// ============================================================
// ToolDependencyGraph — horizontal tool-call dependency graph
// Extracted as a standalone module so it can be rendered
// independently of the thinking-steps timeline below it, and
// supports auto-play (step through nodes automatically).
// ============================================================

import { useEffect, useRef, useState } from 'react'
import type { AgentStep } from '@/engine/types'
import { PlayIcon, PauseIcon } from '@heroicons/react/24/solid'
import { Button } from './Button'

interface ToolDependencyGraphProps {
  steps: AgentStep[]
  /** Index of the currently highlighted node (owned by the parent). */
  currentStepIndex: number
  /** Jump to a node when its card / arrow is clicked. */
  onStepClick?: (index: number) => void
  /**
   * Controlled auto-play: the parent owns the play state (e.g. the
   * scenario PlaybackControls). The graph's play button just mirrors
   * it and delegates to onTogglePlay — no internal timer, so it never
   * fights the parent's existing playback.
   */
  isPlaying?: boolean
  onTogglePlay?: () => void
  /**
   * Uncontrolled auto-play: the graph runs its own timer and reports
   * each advanced index via onPlayheadChange. Use this where no global
   * playback exists (e.g. a finished live run you want to replay).
   */
  playable?: boolean
  onPlayheadChange?: (index: number) => void
  /** While streaming live there is nothing to replay yet — hide the button. */
  isStreaming?: boolean
  /** Auto-play step interval in ms (default 800). */
  playIntervalMs?: number
}

export default function ToolDependencyGraph({
  steps,
  currentStepIndex,
  onStepClick,
  isPlaying,
  onTogglePlay,
  playable = false,
  onPlayheadChange,
  isStreaming = false,
  playIntervalMs = 800,
}: ToolDependencyGraphProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Uncontrolled auto-play state
  const [playing, setPlaying] = useState(false)
  const idxRef = useRef(currentStepIndex)
  useEffect(() => {
    idxRef.current = currentStepIndex
  }, [currentStepIndex])

  // Drive the internal timer for uncontrolled auto-play
  useEffect(() => {
    if (!playing || !playable || isStreaming) return
    const id = window.setInterval(() => {
      const next = idxRef.current + 1
      if (next >= steps.length) {
        setPlaying(false)
        return
      }
      onPlayheadChange?.(next)
    }, playIntervalMs)
    return () => window.clearInterval(id)
  }, [playing, playable, isStreaming, playIntervalMs, steps.length, onPlayheadChange])

  // Auto-scroll to the current node as it advances
  useEffect(() => {
    if (scrollRef.current) {
      const currentEl = scrollRef.current.querySelector('[data-current="true"]')
      if (currentEl) {
        currentEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      }
    }
  }, [currentStepIndex])

  // Decide which play button to render (if any)
  const controlled = isPlaying !== undefined && onTogglePlay
  const showPlay =
    !isStreaming &&
    steps.length > 0 &&
    (controlled || playable)
  const isActivePlaying = controlled ? isPlaying : playing

  const handleUncontrolledToggle = () => {
    if (playing) {
      setPlaying(false)
      return
    }
    // Restart from the beginning if we're already at the last node
    if (currentStepIndex >= steps.length - 1) onPlayheadChange?.(0)
    setPlaying(true)
  }

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
      {/* Header: label + auto-play control */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          📊 工具调用依赖图
        </div>
        {showPlay && (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={
              isActivePlaying ? (
                <PauseIcon className="w-3.5 h-3.5" />
              ) : (
                <PlayIcon className="w-3.5 h-3.5" />
              )
            }
            onClick={controlled ? onTogglePlay : handleUncontrolledToggle}
            aria-label={isActivePlaying ? '暂停' : '自动播放'}
          >
            {isActivePlaying ? '暂停' : '自动播放'}
          </Button>
        )}
      </div>

      {/* Scrollable horizontal flow */}
      <div ref={scrollRef} className="flex items-center gap-0 overflow-x-auto pb-1">
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
                  ${isCurrent ? 'ring-2 ring-blue-400/60 shadow-lg shadow-blue-500/15 scale-105 z-10' : ''}
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

function getNodeColors(step: AgentStep, isCurrent: boolean, isPending: boolean): string {
  if (isPending) return 'bg-slate-800/30 border-slate-700/40 opacity-40'

  if (step.type === 'thought') {
    if (isCurrent) return 'bg-violet-900/30 border-violet-500/60'
    return 'bg-violet-900/15 border-violet-500/30'
  }

  if (step.type === 'response') {
    if (isCurrent) return 'bg-emerald-900/30 border-emerald-500/60'
    return 'bg-emerald-900/15 border-emerald-500/30'
  }

  // tool_call — color by status
  const status = step.toolCall?.status
  if (status === 'success') return 'bg-emerald-900/20 border-emerald-500/40'
  if (status === 'error') return 'bg-red-500/15 border-red-500/50'
  if (status === 'running') return 'bg-yellow-900/30 border-yellow-500/50 tool-card-running'
  if (isCurrent) return 'bg-blue-900/30 border-blue-500/50'
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
