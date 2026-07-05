// ============================================================
// ToolCard — displays a single tool call with status badge
// ============================================================

import { useState } from 'react'
import type { ToolCall, ToolStatus } from '@/engine/types'

const STATUS_CONFIG: Record<
  ToolStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  pending: {
    label: '等待中',
    bg: 'bg-slate-800/50',
    text: 'text-slate-400',
    border: 'border-slate-700',
    dot: 'bg-slate-500',
  },
  running: {
    label: '执行中',
    bg: 'bg-yellow-900/20',
    text: 'text-yellow-400',
    border: 'border-yellow-700/50',
    dot: 'bg-yellow-400 pulse-dot',
  },
  success: {
    label: '成功',
    bg: 'bg-emerald-900/20',
    text: 'text-emerald-400',
    border: 'border-emerald-700/50',
    dot: 'bg-emerald-400',
  },
  error: {
    label: '失败',
    bg: 'bg-red-900/20',
    text: 'text-red-400',
    border: 'border-red-700/50',
    dot: 'bg-red-400',
  },
}

interface ToolCardProps {
  toolCall: ToolCall
  isActive: boolean
}

export default function ToolCard({ toolCall, isActive }: ToolCardProps) {
  const [expanded, setExpanded] = useState(toolCall.status === 'error' || toolCall.status === 'running')
  const cfg = STATUS_CONFIG[toolCall.status]

  let parsedInput: unknown = null
  try {
    parsedInput = JSON.parse(toolCall.input)
  } catch {
    parsedInput = toolCall.input
  }

  let parsedOutput: unknown = null
  try {
    if (toolCall.output) parsedOutput = JSON.parse(toolCall.output)
  } catch {
    parsedOutput = toolCall.output
  }

  return (
    <div
      className={`
        rounded-lg border ${cfg.border} ${cfg.bg}
        transition-all duration-300
        ${toolCall.status === 'running' ? 'tool-card-running' : ''}
        ${isActive ? 'ring-2 ring-blue-500/50 shadow-lg shadow-blue-500/10' : ''}
      `}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer hover:opacity-80 transition-opacity"
      >
        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />

        {/* Tool icon */}
        <span className="text-lg flex-shrink-0">
          {toolCall.name === 'get_weather'
            ? '🌤️'
            : toolCall.name === 'search_hotel'
              ? '🏨'
              : toolCall.name === 'search_flight'
                ? '✈️'
                : toolCall.name === 'search_web'
                  ? '🔍'
                  : toolCall.name === 'calculate'
                    ? '🔢'
                    : toolCall.name === 'get_time'
                      ? '🕐'
                      : '🔧'}
        </span>

        {/* Tool name & description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-sm font-semibold text-slate-100 truncate">
              {toolCall.name}
            </code>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>
              {cfg.label}
            </span>
          </div>
          <p className="text-xs text-slate-400 truncate mt-0.5">{toolCall.description}</p>
        </div>

        {/* Running spinner */}
        {toolCall.status === 'running' && (
          <span className="spin text-yellow-400 text-sm flex-shrink-0">⏳</span>
        )}

        {/* Expand chevron */}
        <span
          className={`text-slate-500 text-xs transition-transform duration-200 flex-shrink-0 ${
            expanded ? 'rotate-180' : ''
          }`}
        >
          ▼
        </span>
      </button>

      {/* Expandable details */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-700/50 pt-2">
          {/* Input */}
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Input
            </div>
            <pre className="text-xs text-slate-300 bg-slate-900/60 rounded p-2 overflow-x-auto max-h-32">
              {JSON.stringify(parsedInput, null, 2)}
            </pre>
          </div>

          {/* Output or Error */}
          {toolCall.status === 'running' && !toolCall.output ? (
            <div>
              <div className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wider mb-1">
                Output
              </div>
              <div className="text-xs text-yellow-300/70 bg-yellow-900/10 rounded p-2 flex items-center gap-2">
                <span className="spin inline-block">⏳</span>
                等待工具返回...
              </div>
            </div>
          ) : toolCall.status === 'error' && toolCall.error ? (
            <div>
              <div className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1">
                Error
              </div>
              <pre className="text-xs text-red-300 bg-red-900/20 rounded p-2 overflow-x-auto">
                {toolCall.error}
              </pre>
            </div>
          ) : parsedOutput ? (
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Output
              </div>
              <pre className="text-xs text-slate-300 bg-slate-900/60 rounded p-2 overflow-x-auto max-h-32">
                {JSON.stringify(parsedOutput, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
