// ============================================================
// MultiAgentFlow — Multi-Agent Orchestration Visualization
// Tree layout with SVG connections, expandable nodes, timeline
// ============================================================

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  MultiAgentScenario,
  MultiAgentSnapshot,
  AgentNode,
  AgentMessage,
  MultiAgentStatus,
} from '@/engine/types'
import type { MultiAgentEngineState } from '@/engine/types'

// ============================================================
// Status display config
// ============================================================

const STATUS_CONFIG: Record<MultiAgentStatus, { icon: string; color: string; bgColor: string; label: string }> = {
  pending:     { icon: '⏳', color: 'text-slate-400', bgColor: 'bg-slate-800/60', label: '待命' },
  running:     { icon: '🔄', color: 'text-blue-400', bgColor: 'bg-blue-900/20', label: '运行中' },
  thinking:    { icon: '🤔', color: 'text-violet-400', bgColor: 'bg-violet-900/20', label: '思考中' },
  using_tools: { icon: '🔧', color: 'text-yellow-400', bgColor: 'bg-yellow-900/20', label: '使用工具' },
  waiting:     { icon: '⏸', color: 'text-slate-400', bgColor: 'bg-slate-800/40', label: '等待' },
  completed:   { icon: '✅', color: 'text-emerald-400', bgColor: 'bg-emerald-900/20', label: '完成' },
  failed:      { icon: '❌', color: 'text-red-400', bgColor: 'bg-red-900/20', label: '失败' },
}

const ROLE_LABELS: Record<string, string> = {
  orchestrator: '🔄 编排者',
  worker: '🛠️ 执行者',
  specialist: '🎯 专家',
}

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  delegate: '📤 委派',
  progress: '📊 进度',
  result: '📥 结果',
  question: '❓ 问题',
  response: '💬 回复',
}

// ============================================================
// Props
// ============================================================

interface MultiAgentFlowProps {
  engineState: MultiAgentEngineState
  onNext: () => void
  onPrev: () => void
  onPlay: () => void
  onPause: () => void
  onReset: () => void
}

// ============================================================
// Main Component
// ============================================================

export default function MultiAgentFlow({
  engineState,
  onNext,
  onPrev,
  onPlay,
  onPause,
  onReset,
}: MultiAgentFlowProps) {
  const scenario = engineState.scenario
  const snapshot = engineState.currentSnapshot
  const currentEventIndex = engineState.currentEventIndex
  const totalEvents = engineState.totalEvents
  const isPlaying = engineState.isPlaying

  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null)

  const hasScenario = scenario !== null
  const canGoPrev = currentEventIndex >= 0
  const canGoNext = currentEventIndex < totalEvents - 1
  const isComplete = currentEventIndex >= totalEvents - 1 && totalEvents > 0
  const isBeforeStart = currentEventIndex < 0 && totalEvents > 0

  // Reset expanded node when scenario changes
  useEffect(() => {
    setExpandedNodeId(null)
  }, [scenario])

  // Build tree hierarchy from scenario nodes
  const { rootNode, childNodes } = useMemo(() => {
    if (!scenario) return { rootNode: null, childNodes: [] as AgentNode[] }
    const root = scenario.nodes.find((n) => n.parentId === null) ?? null
    const children = scenario.nodes.filter((n) => n.parentId !== null)
    return { rootNode: root, childNodes: children }
  }, [scenario])

  // Active message that appeared most recently for each connection
  const activeConnections = useMemo(() => {
    if (!snapshot) return new Map<string, { message: AgentMessage; isNew: boolean }>()
    const map = new Map<string, { message: AgentMessage; isNew: boolean }>()
    for (const msg of snapshot.activeMessages) {
      const key = `${msg.from}→${msg.to}`
      map.set(key, { message: msg, isNew: false })
    }
    // Mark the most recent message as "new"
    if (snapshot.activeMessages.length > 0) {
      const last = snapshot.activeMessages[snapshot.activeMessages.length - 1]
      const key = `${last.from}→${last.to}`
      const existing = map.get(key)
      if (existing) {
        map.set(key, { ...existing, isNew: true })
      }
    }
    return map
  }, [snapshot])

  // Node click handler
  const handleNodeClick = useCallback((nodeId: string) => {
    setExpandedNodeId((prev) => (prev === nodeId ? null : nodeId))
  }, [])

  // ============================================================
  // Empty state
  // ============================================================

  if (!hasScenario) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 p-8">
        <span className="text-5xl">🤖</span>
        <p className="text-sm text-slate-400 text-center">选择一个多 Agent 场景开始观察编排流程</p>
        <p className="text-[11px] text-slate-600 text-center max-w-md">
          多 Agent 编排展示了如何将复杂任务拆解为多个子任务，
          由不同的专业 Agent 协作完成
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* === Tree Visualization === */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 p-4">
        <TreeView
          rootNode={rootNode}
          childNodes={childNodes}
          snapshot={snapshot}
          expandedNodeId={expandedNodeId}
          onNodeClick={handleNodeClick}
          activeConnections={activeConnections}
        />
      </div>

      {/* === Timeline === */}
      <div className="flex-shrink-0 border-t border-slate-700/50 bg-slate-900/80">
        <EventTimeline
          events={scenario.timeline}
          currentEventIndex={currentEventIndex}
          onEventClick={(i) => {
            // Jump to a specific event
            const diff = i - currentEventIndex
            if (diff > 0) for (let n = 0; n < diff; n++) onNext()
            else if (diff < 0) for (let n = 0; n < -diff; n++) onPrev()
          }}
        />
      </div>

      {/* === Playback Controls === */}
      <div className="flex-shrink-0 border-t border-slate-700/50 bg-slate-900/90 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={onReset}
            disabled={!hasScenario || isBeforeStart}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-slate-700"
            title="重置"
          >
            ⏮ 重置
          </button>

          <button
            type="button"
            onClick={onPrev}
            disabled={!canGoPrev}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-slate-700"
            title="上一步"
          >
            ⏪ 上一步
          </button>

          {isPlaying ? (
            <button
              type="button"
              onClick={onPause}
              className="px-6 py-2 text-sm font-semibold rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white transition-colors shadow-lg shadow-yellow-500/20"
              title="暂停"
            >
              ⏸ 暂停
            </button>
          ) : (
            <button
              type="button"
              onClick={onPlay}
              disabled={!hasScenario || isComplete}
              className="px-6 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors shadow-lg shadow-emerald-500/20"
              title="自动播放"
            >
              ▶ 自动播放
            </button>
          )}

          <button
            type="button"
            onClick={onNext}
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
                  width: totalEvents > 0 ? `${((currentEventIndex + 1) / totalEvents) * 100}%` : '0%',
                }}
              />
            </div>
            <span className="text-xs font-mono text-slate-400 w-20 text-center">
              {hasScenario ? `步骤 ${currentEventIndex + 1} / ${totalEvents}` : '—'}
            </span>
            {isComplete && (
              <span className="text-xs font-semibold text-emerald-400">✓ 完成</span>
            )}
          </div>
        </div>
      </div>

      {/* === Expanded Node Detail === */}
      {expandedNodeId && scenario && (
        <ExpandedNodeDetail
          nodeId={expandedNodeId}
          scenario={scenario}
          onClose={() => setExpandedNodeId(null)}
        />
      )}
    </div>
  )
}

// ============================================================
// TreeView — renders the agent hierarchy with SVG connections
// ============================================================

function TreeView({
  rootNode,
  childNodes,
  snapshot,
  expandedNodeId,
  onNodeClick,
  activeConnections,
}: {
  rootNode: AgentNode | null
  childNodes: AgentNode[]
  snapshot: MultiAgentSnapshot | null
  expandedNodeId: string | null
  onNodeClick: (id: string) => void
  activeConnections: Map<string, { message: AgentMessage; isNew: boolean }>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const childRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [lineData, setLineData] = useState<Array<{
    from: string
    to: string
    x1: number; y1: number; x2: number; y2: number
    highlighted: boolean
    newHighlight: boolean
    label: string
    labelType: string
  }>>([])

  const setChildRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) childRefs.current.set(id, el)
    else childRefs.current.delete(id)
  }, [])

  // Measure positions and calculate SVG lines
  useLayoutEffect(() => {
    if (!containerRef.current || !rootRef.current) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const rootRect = rootRef.current.getBoundingClientRect()

    const lines: Array<{
      from: string
      to: string
      x1: number; y1: number; x2: number; y2: number
      highlighted: boolean
      newHighlight: boolean
      label: string
      labelType: string
    }> = []

    const rootX = rootRect.left - containerRect.left + rootRect.width / 2
    const rootBottom = rootRect.bottom - containerRect.top

    for (const child of childNodes) {
      const childEl = childRefs.current.get(child.id)
      if (!childEl) continue

      const childRect = childEl.getBoundingClientRect()
      const childX = childRect.left - containerRect.left + childRect.width / 2
      const childTop = childRect.top - containerRect.top

      // Check connection state
      const connKey = `${rootNode?.id}→${child.id}`
      const conn = activeConnections.get(connKey)
      const label = conn ? conn.message.content.slice(0, 40) + (conn.message.content.length > 40 ? '...' : '') : ''
      const labelType = conn ? conn.message.type : ''
      const highlighted = conn !== undefined
      const newHighlight = conn?.isNew ?? false

      // Offset to avoid overlapping lines — alternate side anchor
      const childIndex = childNodes.indexOf(child)
      const totalChildren = childNodes.length
      const xOffset = totalChildren > 1 ? (childIndex - (totalChildren - 1) / 2) * 0 : 0

      lines.push({
        from: rootNode?.id ?? '',
        to: child.id,
        x1: rootX,
        y1: rootBottom,
        x2: childX + xOffset,
        y2: childTop,
        highlighted,
        newHighlight,
        label,
        labelType,
      })
    }

    setLineData(lines)
  }, [snapshot, rootNode, childNodes, activeConnections])

  // Also measure on resize
  useEffect(() => {
    const handleResize = () => {
      // Trigger re-measure by forcing a re-render
      setLineData((prev) => [...prev])
    }
    const ro = new ResizeObserver(handleResize)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  if (!rootNode) return null

  const getNodeStatus = (nodeId: string): MultiAgentStatus => {
    return snapshot?.nodeStatuses[nodeId] ?? 'pending'
  }

  const rootStatus = getNodeStatus(rootNode.id)

  return (
    <div ref={containerRef} className="relative flex flex-col items-center min-h-[280px] pt-8 overflow-hidden w-full max-w-full">
      {/* SVG Connection Lines */}
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 0, width: '100%', height: '100%' }}
      >
        <defs>
          <marker id="arrowhead-default" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#475569" />
          </marker>
          <marker id="arrowhead-highlighted" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#10b981" />
          </marker>
          <marker id="arrowhead-new" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#60a5fa" />
          </marker>
        </defs>

        {lineData.map((line) => {
          const midX = (line.x1 + line.x2) / 2
          const midY = (line.y1 + line.y2) / 2 - 16
          const cpY = (line.y1 + line.y2) / 2

          const lineColor = line.newHighlight
            ? '#60a5fa'
            : line.highlighted
              ? '#10b981'
              : '#334155'
          const markerId = line.newHighlight
            ? 'arrowhead-new'
            : line.highlighted
              ? 'arrowhead-highlighted'
              : 'arrowhead-default'

          return (
            <g key={`${line.from}→${line.to}`}>
              {/* Connection line */}
              <path
                d={`M ${line.x1},${line.y1} Q ${line.x1},${cpY} ${midX},${cpY} Q ${line.x2},${cpY} ${line.x2},${line.y2}`}
                fill="none"
                stroke={lineColor}
                strokeWidth={line.newHighlight ? 2.5 : line.highlighted ? 2 : 1.5}
                strokeDasharray={line.highlighted ? 'none' : '6,3'}
                markerEnd={`url(#${markerId})`}
                className={line.newHighlight ? 'animate-pulse' : ''}
                style={{ transition: 'stroke 0.5s ease, stroke-width 0.3s ease' }}
              />

              {/* Message label on the line */}
              {line.label && (
                <g>
                  {/* Label background */}
                  <rect
                    x={midX - (line.label.length * 3.5) / 2 - 6}
                    y={midY - 8}
                    width={line.label.length * 3.5 + 12}
                    height={16}
                    rx={4}
                    fill={line.newHighlight ? '#1e3a5f' : '#1e293b'}
                    stroke={line.newHighlight ? '#3b82f6' : '#334155'}
                    strokeWidth={1}
                    opacity={0.95}
                  />
                  {/* Label text */}
                  <text
                    x={midX}
                    y={midY + 1}
                    textAnchor="middle"
                    fill={line.newHighlight ? '#93c5fd' : '#94a3b8'}
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {MESSAGE_TYPE_LABELS[line.labelType] ?? line.labelType}
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </svg>

      {/* Nodes rendered on top of SVG */}
      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Root node */}
        <div ref={rootRef}>
          <AgentNodeCard
            node={rootNode}
            status={rootStatus}
            isExpanded={expandedNodeId === rootNode.id}
            onClick={() => onNodeClick(rootNode.id)}
          />
        </div>

        {/* Children row */}
        {childNodes.length > 0 && (
          <div className="flex justify-center gap-6">
            {childNodes.map((child) => {
              const childStatus = getNodeStatus(child.id)
              return (
                <div key={child.id} ref={setChildRef(child.id)}>
                  <AgentNodeCard
                    node={child}
                    status={childStatus}
                    isExpanded={expandedNodeId === child.id}
                    onClick={() => onNodeClick(child.id)}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// AgentNodeCard — single agent node in the tree
// ============================================================

function AgentNodeCard({
  node,
  status,
  isExpanded,
  onClick,
}: {
  node: AgentNode
  status: MultiAgentStatus
  isExpanded: boolean
  onClick: () => void
}) {
  const cfg = STATUS_CONFIG[status]

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onClick}
        className={`
          group text-left transition-all duration-200 rounded-xl border
          ${cfg.bgColor}
          ${isExpanded ? 'ring-2 ring-blue-500/50 border-blue-500/30' : 'border-slate-700/50 hover:border-slate-600'}
          hover:shadow-lg hover:shadow-slate-900/50
          min-w-[200px] max-w-[260px]
        `}
      >
        {/* Header */}
        <div className="px-3.5 py-2.5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-100">{node.name}</span>
              <span className={`text-[10px] ${cfg.color} flex items-center gap-0.5`}>
                {status === 'running' || status === 'thinking' || status === 'using_tools' ? (
                  <span className="inline-flex">
                    {cfg.icon}
                    <span className="animate-pulse inline-block ml-0.5">{cfg.label}</span>
                  </span>
                ) : (
                  <span>{cfg.icon} {cfg.label}</span>
                )}
              </span>
            </div>
            <span className={`text-[10px] text-slate-500 ${isExpanded ? 'rotate-180' : ''} transition-transform`}>
              ▼
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">{node.description}</p>
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-[10px] text-slate-600">{ROLE_LABELS[node.role] ?? node.role}</span>
            {node.steps.length > 0 && (
              <span className="text-[10px] text-slate-600">· {node.steps.length} 步骤</span>
            )}
          </div>
        </div>

        {/* Expand indicator */}
        <div className="h-0.5 bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />

        {/* Expanded: show steps preview */}
        {isExpanded && (
          <div className="px-3.5 py-2 max-h-48 overflow-y-auto space-y-1.5">
            {node.steps.length === 0 ? (
              <p className="text-[10px] text-slate-600 italic">暂无内部步骤</p>
            ) : (
              node.steps.map((step) => (
                <div
                  key={step.id}
                  className="flex items-start gap-1.5 text-[10px]"
                >
                  <span className="mt-0.5 flex-shrink-0">
                    {step.type === 'thought' ? '🤔' : step.type === 'tool_call' ? '🔧' : '💬'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-slate-400">
                        {step.type === 'thought' ? '思考' : step.type === 'tool_call' ? (step.toolCall?.name ?? '工具') : '回复'}
                      </span>
                      <span className="text-slate-600">{step.timestamp}</span>
                    </div>
                    <p className="text-slate-500 truncate">{step.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </button>
    </div>
  )
}

// ============================================================
// EventTimeline — horizontal event sequence at bottom
// ============================================================

function EventTimeline({
  events,
  currentEventIndex,
  onEventClick,
}: {
  events: Array<{ id: string; time: string; description: string; type: string }>
  currentEventIndex: number
  onEventClick: (index: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keep current event visible
  useEffect(() => {
    if (scrollRef.current) {
      const currentEl = scrollRef.current.querySelector('[data-current="true"]')
      if (currentEl) {
        currentEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      }
    }
  }, [currentEventIndex])

  const getEventIcon = (type: string) => {
    const map: Record<string, string> = {
      agent_spawn: '🚀',
      agent_complete: '✅',
      agent_fail: '❌',
      agent_status_change: '🔄',
      message_send: '📤',
      message_receive: '📥',
    }
    return map[type] ?? '●'
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">📋 事件时间轴</span>
        <span className="text-[10px] text-slate-600">
          {currentEventIndex >= 0 ? `步骤 ${currentEventIndex + 1} / ${events.length}` : '等待开始'}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex items-center gap-0 overflow-x-auto pb-1"
      >
        {events.length === 0 ? (
          <span className="text-[10px] text-slate-600 italic">暂无事件</span>
        ) : (
          <>
            {/* Initial state dot */}
            <button
              type="button"
              onClick={() => onEventClick(-1)}
              data-current={currentEventIndex < 0 ? 'true' : 'false'}
              className={`
                flex flex-col items-center gap-0.5 flex-shrink-0 px-2 py-1 rounded-lg transition-all
                ${currentEventIndex < 0 ? 'bg-blue-500/20 scale-110 ring-1 ring-blue-400/40' : 'hover:bg-slate-800/50'}
              `}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] ${
                currentEventIndex < 0 ? 'bg-blue-500/30' : 'bg-slate-800'
              }`}>
                ⏳
              </span>
              <span className={`text-[8px] whitespace-nowrap ${
                currentEventIndex < 0 ? 'text-blue-400' : 'text-slate-600'
              }`}>
                初始
              </span>
            </button>

            {/* Event dots */}
            {events.map((event, i) => {
              const isCurrent = i === currentEventIndex
              const isPast = i < currentEventIndex
              const isFuture = i > currentEventIndex

              return (
                <div key={event.id} className="flex items-center flex-shrink-0">
                  {/* Connector line */}
                  <div className={`w-4 h-0.5 ${
                    i <= currentEventIndex ? 'bg-emerald-500' : 'bg-slate-700'
                  }`} />

                  <button
                    type="button"
                    onClick={() => onEventClick(i)}
                    data-current={isCurrent ? 'true' : 'false'}
                    disabled={isFuture}
                    title={event.description}
                    className={`
                      flex flex-col items-center gap-0.5 flex-shrink-0
                      transition-all duration-200 rounded-lg px-2 py-1
                      ${isCurrent ? 'bg-blue-500/20 scale-110 ring-1 ring-blue-400/40' : ''}
                      ${isPast && !isCurrent ? 'hover:bg-slate-800/50 cursor-pointer' : ''}
                      ${isFuture ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <span className={`
                      w-5 h-5 rounded-full flex items-center justify-center text-[9px]
                      transition-all duration-300
                      ${isCurrent ? 'bg-blue-500/30 ring-2 ring-blue-400 ring-offset-1 ring-offset-slate-900' : ''}
                      ${isPast && !isCurrent ? 'bg-emerald-500/20' : ''}
                      ${isFuture ? 'bg-slate-800' : ''}
                    `}>
                      {getEventIcon(event.type)}
                    </span>
                    <span className={`text-[8px] whitespace-nowrap max-w-[80px] truncate ${
                      isCurrent ? 'text-blue-400' : isPast ? 'text-slate-500' : 'text-slate-600'
                    }`}>
                      {event.time} {event.description.length > 12
                        ? event.description.slice(0, 12) + '…'
                        : event.description}
                    </span>
                  </button>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================
// ExpandedNodeDetail — full-screen overlay showing node details
// ============================================================

function ExpandedNodeDetail({
  nodeId,
  scenario,
  onClose,
}: {
  nodeId: string
  scenario: MultiAgentScenario
  onClose: () => void
}) {
  const node = scenario.nodes.find((n) => n.id === nodeId)
  if (!node) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-slate-100">{node.name}</span>
            <span className="text-xs text-slate-500">{ROLE_LABELS[node.role] ?? node.role}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span className="text-lg">✕</span>
          </button>
        </div>

        {/* Description */}
        <div className="px-5 py-2 border-b border-slate-700/30 bg-slate-800/30">
          <p className="text-xs text-slate-400">{node.description}</p>
        </div>

        {/* Content: Steps + Messages */}
        <div className="overflow-y-auto max-h-[55vh] p-5 space-y-4">
          {/* Internal Steps */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>🧠</span> 内部推理步骤 ({node.steps.length})
            </h3>
            {node.steps.length === 0 ? (
              <p className="text-xs text-slate-600 italic">暂无步骤数据</p>
            ) : (
              <div className="space-y-2">
                {node.steps.map((step) => (
                  <div
                    key={step.id}
                    className={`
                      rounded-lg border px-3 py-2
                      ${step.type === 'thought'
                        ? 'bg-violet-900/10 border-violet-700/30'
                        : step.type === 'tool_call'
                          ? 'bg-blue-900/10 border-blue-700/30'
                          : 'bg-emerald-900/10 border-emerald-700/30'
                      }
                    `}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span>
                        {step.type === 'thought' ? '🤔' : step.type === 'tool_call' ? '🔧' : '💬'}
                      </span>
                      <span className="text-[10px] font-medium text-slate-400">
                        {step.type === 'thought' ? '思考' : step.type === 'tool_call' ? (step.toolCall?.name ?? '工具') : '回复'}
                      </span>
                      <span className="text-[10px] text-slate-600 ml-auto">{step.timestamp}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{step.content}</p>
                    {step.toolCall && (
                      <div className="mt-1.5 bg-slate-800/60 rounded px-2 py-1 text-[10px] font-mono text-slate-400">
                        <div>输入: {step.toolCall.input}</div>
                        {step.toolCall.output && <div>输出: {step.toolCall.output}</div>}
                        {step.toolCall.error && <div className="text-red-400">错误: {step.toolCall.error}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Messages */}
          {node.messages.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span>💬</span> 消息记录 ({node.messages.length})
              </h3>
              <div className="space-y-1.5">
                {node.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="flex items-start gap-2 bg-slate-800/40 rounded-lg px-3 py-2"
                  >
                    <span className="text-xs flex-shrink-0 mt-0.5">
                      {msg.type === 'delegate' ? '📤' : msg.type === 'result' ? '📥' : msg.type === 'progress' ? '📊' : '💬'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                        <span className="font-medium text-slate-400">{msg.from}</span>
                        <span>→</span>
                        <span className="font-medium text-slate-400">{msg.to}</span>
                        <span className="text-slate-600">{MESSAGE_TYPE_LABELS[msg.type] ?? msg.type}</span>
                        <span className="ml-auto">{msg.timestamp}</span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5">{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
