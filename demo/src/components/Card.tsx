// ============================================================
// Card — surface container with optional Header / Body
// ============================================================

import type { ReactNode } from 'react'

interface CardProps {
  className?: string
  children?: ReactNode
}

function CardBase({ className = '', children }: CardProps) {
  return (
    <div className={`bg-slate-800 border border-slate-700/50 rounded-xl shadow-lg shadow-black/20 ${className}`}>
      {children}
    </div>
  )
}

function CardHeader({ title, action, className = '' }: { title?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-700/50 ${className}`}>
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">{title}</div>
      {action}
    </div>
  )
}

function CardBody({ className = '', children }: CardProps) {
  return <div className={`p-4 ${className}`}>{children}</div>
}

export const Card = Object.assign(CardBase, { Header: CardHeader, Body: CardBody })
