// ============================================================
// TopBar — logo + 4 pill tabs + right slot
// ============================================================

import type { ReactNode } from 'react'

export type AppMode = 'scenario' | 'live' | 'comparison' | 'multiAgent'

const TABS: Array<{ key: AppMode; label: string }> = [
  { key: 'scenario', label: '📋 场景模式' },
  { key: 'live', label: '✨ 自由模式' },
  { key: 'comparison', label: '🔬 对比模式' },
  { key: 'multiAgent', label: '🤖 多 Agent' },
]

interface TopBarProps {
  mode: AppMode
  onModeChange: (mode: AppMode) => void
  rightSlot?: ReactNode
}

export function TopBar({ mode, onModeChange, rightSlot }: TopBarProps) {
  return (
    <header className="flex-shrink-0 border-b border-slate-700/50 bg-slate-950/80 backdrop-blur-sm px-4 py-3">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-slate-100 whitespace-nowrap">🤖 Agent Tool System</h1>
        <nav className="flex items-center gap-1.5" aria-label="视图切换">
          {TABS.map((tab) => {
            const active = mode === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onModeChange(tab.key)}
                aria-current={active ? 'page' : undefined}
                className={[
                  'px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-150',
                  active
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-slate-800 text-slate-400 border border-slate-700/50 hover:text-slate-100 hover:bg-slate-700',
                ].join(' ')}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>
        {rightSlot && <div className="ml-auto flex items-center">{rightSlot}</div>}
      </div>
    </header>
  )
}
