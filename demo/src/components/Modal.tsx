// ============================================================
// Modal — centered dialog with overlay + scrollable body
// ============================================================

import { useEffect, type ReactNode } from 'react'
import { XMarkIcon } from '@heroicons/react/20/solid'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, footer, className = '' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl shadow-black/40 overflow-hidden ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50">
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all duration-150"
              aria-label="关闭"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-700/50 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}
