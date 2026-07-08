import type { SavedRun } from '@/engine/runHistory'

interface RunHistoryPanelProps {
  runs: SavedRun[]
  viewingRunId: string | null
  open: boolean
  compareIds: string[]
  onToggleOpen: () => void
  onView: (run: SavedRun) => void
  onExit: () => void
  onToggleCompare: (id: string) => void
  onDelete: (id: string) => void
  onClear: () => void
  onCompare: () => void
}

const TOPOLOGY_LABEL: Record<SavedRun['topology'], string> = {
  'fan-out': '扇出',
  debate: '辩论',
  pipeline: '流水线',
}

export default function RunHistoryPanel({
  runs,
  viewingRunId,
  open,
  compareIds,
  onToggleOpen,
  onView,
  onExit,
  onToggleCompare,
  onDelete,
  onClear,
  onCompare,
}: RunHistoryPanelProps) {
  if (runs.length === 0) return null

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/40">
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white"
        >
          <span className={`transition-transform ${open ? '' : '-rotate-90'}`}>▾</span>
          🕘 运行历史 ({runs.length})
        </button>
        {viewingRunId && (
          <span className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-violet-500/30 text-violet-200 text-[11px]">
            正在查看历史记录
            <button type="button" onClick={onExit} className="underline hover:text-white">
              退出
            </button>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {compareIds.length === 2 && (
            <button
              type="button"
              onClick={onCompare}
              className="px-2 py-1 text-[11px] rounded-md bg-blue-500 hover:bg-blue-500 text-white"
            >
              对比所选
            </button>
          )}
          <button
            type="button"
            onClick={onClear}
            className="px-2 py-1 text-[11px] rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700"
          >
            清空
          </button>
        </div>
      </div>
      {open && (
        <div className="flex gap-2 overflow-x-auto px-3 py-2">
          {runs.map((run) => {
            const active = viewingRunId === run.id
            const sel = compareIds.includes(run.id)
            return (
              <div
                key={run.id}
                onClick={() => onView(run)}
                className={`group relative flex-shrink-0 w-56 rounded-lg border p-2 cursor-pointer transition-all ${
                  active ? 'border-violet-500 bg-violet-900/20' : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                    {TOPOLOGY_LABEL[run.topology]}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(run.savedAt).toLocaleString('zh-CN', { hour12: false })}
                  </span>
                  <input
                    type="checkbox"
                    className="ml-auto"
                    checked={sel}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleCompare(run.id)}
                    title="选入对比"
                  />
                  <button
                    type="button"
                    className="text-slate-500 hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(run.id)
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div className="text-[11px] text-slate-300 font-medium truncate">{run.scenarioName}</div>
                <div className="text-[10px] text-slate-500 truncate">{run.task || '(默认任务)'}</div>
                <div className="text-[10px] text-emerald-400/80 mt-1">
                  {run.usage.promptTokens + run.usage.completionTokens} tok
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
