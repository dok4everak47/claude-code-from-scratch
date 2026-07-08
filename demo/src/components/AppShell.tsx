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
  /** Current theme; forwarded to TopBar for the sun/moon toggle */
  theme?: 'dark' | 'light'
  /** Toggle between dark and light */
  onToggleTheme?: () => void
}

export function AppShell({ mode, onModeChange, rightSlot, subHeader, children, theme, onToggleTheme }: AppShellProps) {
  return (
    <div className="relative h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 ambient-glow" aria-hidden="true" />
      <TopBar mode={mode} onModeChange={onModeChange} rightSlot={rightSlot} theme={theme} onToggleTheme={onToggleTheme} />
      {subHeader}
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  )
}
