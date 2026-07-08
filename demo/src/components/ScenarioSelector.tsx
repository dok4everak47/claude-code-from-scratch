// ============================================================
// ScenarioSelector — dropdown to pick a scenario
// ============================================================

import type { Scenario } from '@/engine/types'

interface ScenarioSelectorProps {
  scenarios: Scenario[]
  activeScenarioId: string | null
  onSelect: (scenario: Scenario) => void
  disabled?: boolean
}

export default function ScenarioSelector({
  scenarios,
  activeScenarioId,
  onSelect,
  disabled = false,
}: ScenarioSelectorProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 flex-1 min-w-0">
        {scenarios.map((s) => {
          const active = s.id === activeScenarioId
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s)}
              disabled={disabled}
              className={`
                flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-150 whitespace-nowrap
                ${active
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                  : 'bg-slate-800 text-slate-400 border border-slate-700/50 hover:text-slate-100 hover:bg-slate-700'
                }
                disabled:opacity-40 disabled:cursor-not-allowed
              `}
            >
              {s.name}
            </button>
          )
        })}
      </div>
      {/* Description */}
      {activeScenarioId && (
        <p className="text-xs text-slate-500 hidden lg:block max-w-xs truncate flex-shrink-0">
          {scenarios.find((s) => s.id === activeScenarioId)?.description}
        </p>
      )}
    </div>
  )
}
