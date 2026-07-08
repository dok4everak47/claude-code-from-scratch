// ============================================================
// StatusBadge — agent/tool status indicator (replaces STATUS_CONFIG)
// ============================================================

export type AgentStatus =
  | 'pending'
  | 'running'
  | 'thinking'
  | 'waiting'
  | 'using_tools'
  | 'completed'
  | 'failed'
  | 'success'
  | 'error'

const STATUS_MAP: Record<AgentStatus, { label: string; dot: string; text: string; bg: string }> = {
  pending: { label: '待命', dot: 'bg-slate-400', text: 'text-slate-300', bg: 'bg-slate-700/40' },
  running: { label: '运行中', dot: 'bg-blue-500', text: 'text-blue-400', bg: 'bg-blue-500/15' },
  thinking: { label: '思考中', dot: 'bg-violet-500', text: 'text-violet-400', bg: 'bg-violet-500/15' },
  waiting: { label: '等待', dot: 'bg-slate-400', text: 'text-slate-300', bg: 'bg-slate-700/40' },
  using_tools: { label: '使用工具', dot: 'bg-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-500/15' },
  completed: { label: '完成', dot: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  failed: { label: '失败', dot: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/15' },
  success: { label: '成功', dot: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  error: { label: '错误', dot: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/15' },
}

interface StatusBadgeProps {
  status: AgentStatus
  label?: string
  className?: string
  pulse?: boolean
}

export function StatusBadge({ status, label, className = '', pulse = false }: StatusBadgeProps) {
  const s = STATUS_MAP[status]
  const animated = pulse || status === 'running' || status === 'thinking' || status === 'using_tools'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${animated ? 'animate-pulse' : ''}`} />
      {label ?? s.label}
    </span>
  )
}
