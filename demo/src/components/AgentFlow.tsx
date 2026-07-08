// ============================================================
// AgentFlow — vertical timeline showing agent thinking process
// The tool-call dependency graph is a separate module
// (ToolDependencyGraph) rendered above these thinking steps.
// ============================================================

import { useEffect, useRef } from 'react'
import type { AgentStep, AgentStatusFeed } from '@/engine/types'
import ToolCard from './ToolCard'
import { Panel } from './Panel'
import ToolDependencyGraph from './ToolDependencyGraph'

interface AgentFlowProps {
  steps: AgentStep[]
  currentStepIndex: number
  /** When true, auto-scroll to the latest step (live mode) */
  isLive?: boolean
  /** Callback when a dependency graph node is clicked */
  onStepClick?: (index: number) => void
  /** Real-time status feed from LiveAgent (free mode only) */
  statusFeed?: AgentStatusFeed | null
  /** Auto-play wiring for the tool-call dependency graph */
  graphIsPlaying?: boolean
  graphOnTogglePlay?: () => void
  graphPlayable?: boolean
  graphOnPlayheadChange?: (index: number) => void
  graphIsStreaming?: boolean
}

export default function AgentFlow({
  steps,
  currentStepIndex,
  isLive = false,
  onStepClick,
  statusFeed,
  graphIsPlaying,
  graphOnTogglePlay,
  graphPlayable,
  graphOnPlayheadChange,
  graphIsStreaming,
}: AgentFlowProps) {
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
      {/* === Live Agent Status Feed (free mode only) === */}
      {statusFeed && <StatusFeedPanel feed={statusFeed} />}

      {/* === Tool-call dependency graph (standalone module) === */}
      <ToolDependencyGraph
        steps={steps}
        currentStepIndex={currentStepIndex}
        onStepClick={onStepClick}
        isPlaying={graphIsPlaying}
        onTogglePlay={graphOnTogglePlay}
        playable={graphPlayable}
        onPlayheadChange={graphOnPlayheadChange}
        isStreaming={graphIsStreaming}
      />

      {/* === Thinking steps: vertical timeline === */}
      <div className="relative pl-6 flex-1">
        {/* Vertical timeline line */}
        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-700/50" />

        <div className="space-y-4 py-3">
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
                        ? 'bg-violet-900/20 border-violet-500/50 ring-2 ring-violet-500/30'
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
                        ? 'bg-emerald-900/20 border-emerald-500/50 ring-2 ring-emerald-500/30'
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
// StatusFeedPanel — live agent state with loop/tasks/fileTree
// ============================================================

function StatusFeedPanel({ feed }: { feed: AgentStatusFeed }) {
  const title = (
    <div className="flex items-center gap-1.5 normal-case">
      <span>📊</span>
      <span className="font-medium text-slate-300">Agent Status</span>
      <span className="text-slate-500 normal-case">Loop: {feed.loopCount}</span>
      {feed.linterActive && <span className="text-red-400 normal-case">🔧 Lint: FAIL</span>}
    </div>
  )

  return (
    <Panel title={title} collapsible defaultOpen>
      <div className="space-y-2 text-xs">
        {/* Loop count */}
        <div className="flex items-center gap-2">
          <span className="text-slate-500 w-16">🔄 Loop</span>
          <span className="text-slate-100 font-mono">{feed.loopCount}</span>
        </div>

        {/* File tree */}
        {feed.fileTree.length > 0 && (
          <div>
            <div className="flex items-center gap-1 text-slate-500 mb-0.5">
              <span>📁</span>
              <span>Files</span>
            </div>
            <div className="ml-4 space-y-0.5">
              {feed.fileTree.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <FileStatusBadge status={f.status} />
                  <span className="text-slate-300 truncate max-w-[200px]">{f.path}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Task list */}
        {feed.taskList.length > 0 && (
          <div>
            <div className="flex items-center gap-1 text-slate-500 mb-0.5">
              <span>📋</span>
              <span>Tasks</span>
            </div>
            <div className="ml-4 space-y-0.5">
              {feed.taskList.map((t, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <TaskStatusIcon status={t.status} />
                  <span className="text-slate-300 truncate max-w-[220px]">{t.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Git state */}
        {feed.gitState && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">📦 Git</span>
            <span className="text-slate-300">{feed.gitState.branch}</span>
            {feed.gitState.dirtyCount > 0 && (
              <span className="text-yellow-400">({feed.gitState.dirtyCount} 个未提交)</span>
            )}
          </div>
        )}

        {/* Linter */}
        <div className="flex items-center gap-2">
          <span className="text-slate-500">🔧 Linter</span>
          {feed.linterActive ? (
            <span className="text-red-400">❌ FAIL</span>
          ) : (
            <span className="text-emerald-400">✅ PASS</span>
          )}
        </div>
      </div>
    </Panel>
  )
}

function FileStatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: string; color: string }> = {
    writing: { icon: 'W', color: 'text-yellow-400 bg-yellow-900/30' },
    added: { icon: 'A', color: 'text-emerald-400 bg-emerald-900/30' },
    modified: { icon: 'M', color: 'text-blue-400 bg-blue-900/30' },
    unchanged: { icon: '·', color: 'text-slate-500 bg-slate-800/50' },
  }
  const cfg = map[status] ?? map.unchanged
  return (
    <span className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold ${cfg.color}`}>
      {cfg.icon}
    </span>
  )
}

function TaskStatusIcon({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: '⏸',
    running: '🔄',
    completed: '✅',
    failed: '❌',
  }
  return (
    <span className={`text-xs ${status === 'running' ? 'spin inline-block' : ''}`}>
      {map[status] ?? '⏸'}
    </span>
  )
}
