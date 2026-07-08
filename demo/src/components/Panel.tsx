// ============================================================
// Panel — collapsible surface with title + body
// ============================================================

import { useState, type ReactNode } from 'react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'

interface PanelProps {
  title?: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  children?: ReactNode
  className?: string
  action?: ReactNode
}

export function Panel({
  title,
  collapsible = false,
  defaultOpen = true,
  children,
  className = '',
  action,
}: PanelProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`bg-slate-900/70 backdrop-blur-xl ring-1 ring-inset ring-white/5 border border-slate-700/50 rounded-xl shadow-lg shadow-black/20 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-700/50">
        <button
          type="button"
          onClick={() => collapsible && setOpen(!open)}
          className={`flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider ${
            collapsible ? 'cursor-pointer hover:text-slate-100' : 'cursor-default'
          }`}
        >
          {collapsible && (
            <ChevronDownIcon
              className={`w-4 h-4 text-slate-500 transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
            />
          )}
          {title}
        </button>
        {action}
      </div>
      {open && <div className="p-4">{children}</div>}
    </div>
  )
}
