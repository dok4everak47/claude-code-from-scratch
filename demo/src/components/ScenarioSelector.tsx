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
    <div className="flex items-center gap-3">
      <label className="text-sm font-medium text-slate-400 whitespace-nowrap">
        📋 场景选择
      </label>
      <div className="relative flex-1">
        <select
          value={activeScenarioId ?? ''}
          onChange={(e) => {
            const found = scenarios.find((s) => s.id === e.target.value)
            if (found) onSelect(found)
          }}
          disabled={disabled}
          className="
            w-full appearance-none bg-slate-800 border border-slate-700 rounded-lg
            px-3 py-1.5 text-sm text-slate-200
            focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
            disabled:opacity-50 disabled:cursor-not-allowed
            cursor-pointer
          "
        >
          <option value="" disabled>
            选择场景...
          </option>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-xs">
          ▼
        </span>
      </div>
      {/* Description */}
      {activeScenarioId && (
        <p className="text-xs text-slate-500 hidden lg:block max-w-xs truncate">
          {scenarios.find((s) => s.id === activeScenarioId)?.description}
        </p>
      )}
    </div>
  )
}
