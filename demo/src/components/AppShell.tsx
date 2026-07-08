// ============================================================
// AppShell — unified layout: TopBar + sub-header + content
// ============================================================

import type { ReactNode } from 'react'
import { TopBar, type AppMode } from './TopBar'

interface AppShellProps {
  mode: AppMode
  onModeChange: (mode: AppMode) => void
  rightSlot?: ReactNode
  /** Optional node rendered directly beneath the TopBar (e.g. settings panel) */
  subHeader?: ReactNode
  children: ReactNode
}

export function AppShell({ mode, onModeChange, rightSlot, subHeader, children }: AppShellProps) {
  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      <TopBar mode={mode} onModeChange={onModeChange} rightSlot={rightSlot} />
      {subHeader}
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  )
}
