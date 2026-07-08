// ============================================================
// Badge — pill status chip with dot indicator
// ============================================================

import type { ReactNode } from 'react'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info'

const VARIANT: Record<BadgeVariant, { wrap: string; dot: string }> = {
  default: { wrap: 'bg-slate-700/40 text-slate-300', dot: 'bg-slate-400' },
  success: { wrap: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-500' },
  warning: { wrap: 'bg-yellow-500/15 text-yellow-400', dot: 'bg-yellow-500' },
  error: { wrap: 'bg-red-500/15 text-red-400', dot: 'bg-red-500' },
  info: { wrap: 'bg-blue-500/15 text-blue-400', dot: 'bg-blue-500' },
}

interface BadgeProps {
  variant?: BadgeVariant
  children?: ReactNode
  className?: string
  dot?: boolean
}

export function Badge({ variant = 'default', children, className = '', dot = true }: BadgeProps) {
  const v = VARIANT[variant]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${v.wrap} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />}
      {children}
    </span>
  )
}
