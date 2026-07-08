// ============================================================
// LiveView — free / live LLM mode
//   [status bar]
//   [ChatPanel] | [AgentFlow]
//   [Stop / Retry / Export footer]
// ============================================================

import { useState, useEffect } from 'react'
import type { LiveSessionState } from '@/engine/types'
import { Button } from '@/components/Button'
import ChatPanel from '@/components/ChatPanel'
import AgentFlow from '@/components/AgentFlow'

interface LiveViewProps {
  liveState: LiveSessionState
  maxTurns: number
  onSend: (text: string) => void
  onStop: () => void
  onRetry: () => void
  onExport: () => void
}

export function LiveView({
  liveState,
  maxTurns,
  onSend,
  onStop,
  onRetry,
  onExport,
}: LiveViewProps) {
  // Replay playhead for the dependency graph. null = follow the live tail.
  const [replayIndex, setReplayIndex] = useState<number | null>(null)
  useEffect(() => {
    // Any new step / new query snaps back to the live tail.
    setReplayIndex(null)
  }, [liveState.steps.length, liveState.isLoading])

  const effectiveIndex = replayIndex ?? Math.max(0, liveState.steps.length - 1)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top: live status */}
      <div className="flex-shrink-0 border-b border-slate-700/50 px-4 py-2 bg-slate-900/40 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {liveState.isLoading ? (
            <span className="text-xs text-yellow-400 flex items-center gap-1.5">
              <span className="spin inline-block w-3 h-3 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full" />
              Agent 思考中...
            </span>
          ) : liveState.error ? (
            <span className="text-xs text-red-400">⚠️ {liveState.error}</span>
          ) : (
            <span className="text-xs text-slate-500">
              {liveState.messages.length > 0
                ? `对话中 · ${liveState.messages.length} 条消息`
                : '输入问题开始对话'}
            </span>
          )}
        </div>
      </div>

      {/* Middle: full-width chat + collapsible agent status panel */}
      <main className="flex-1 flex flex-col lg:flex-row min-h-0">
        <section className="flex-1 min-w-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-700/50">
          <div className="px-4 py-2 border-b border-slate-700/30 bg-slate-800/50">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              💬 对话面板
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <ChatPanel
              variant="live"
              messages={liveState.messages}
              onSend={onSend}
              isLiveLoading={liveState.isLoading}
            />
          </div>
        </section>

        <section className="flex-1 lg:w-1/2 min-w-0 flex flex-col">
          <div className="px-4 py-2 border-b border-slate-700/30 bg-slate-800/50">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              🧠 Agent 思考流程
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <AgentFlow
              steps={liveState.steps}
              currentStepIndex={effectiveIndex}
              isLive
              statusFeed={liveState.statusFeed}
              onStepClick={setReplayIndex}
              graphPlayable
              graphOnPlayheadChange={setReplayIndex}
              graphIsStreaming={liveState.isLoading}
            />
          </div>
        </section>
      </main>

      {/* Bottom: controls */}
      <footer className="flex-shrink-0 border-t border-slate-700/50 bg-slate-900/90 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-3 flex-wrap px-4 py-3">
          <Button
            variant="danger"
            size="md"
            onClick={onStop}
            disabled={!liveState.isLoading}
          >
            ⏹ 停止
          </Button>

          <Button
            variant="secondary"
            size="md"
            onClick={onRetry}
            disabled={liveState.isLoading || liveState.messages.length === 0}
          >
            🔄 清空对话
          </Button>

          <Button
            variant="secondary"
            size="md"
            onClick={onExport}
            disabled={liveState.messages.length === 0}
          >
            💾 导出对话
          </Button>

          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs font-mono text-slate-400">
              {liveState.messages.length > 0
                ? `🔄 第 ${liveState.currentTurn} / ${maxTurns} 轮`
                : '等待输入...'}
            </span>
            {liveState.error && (
              <span className="text-xs text-red-400 max-w-xs truncate" title={liveState.error}>
                ⚠️ {liveState.error}
              </span>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}
