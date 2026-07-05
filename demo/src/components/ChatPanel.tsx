// ============================================================
// ChatPanel — left panel showing conversation messages
// ============================================================

import { useState } from 'react'
import type { ChatMessage } from '@/engine/types'

interface ChatPanelProps {
  messages: ChatMessage[]
  /** Whether playback has reached the response step — shows agent message in real time */
  responseStepReached: boolean
}

export default function ChatPanel({ messages, responseStepReached }: ChatPanelProps) {
  const [draft, setDraft] = useState('')

  // Determine which messages to show based on playback progress
  const visibleMessages = getVisibleMessages(messages, responseStepReached)

  const handleSend = () => {
    if (!draft.trim()) return
    // In a real app this would trigger the agent. Here we just clear.
    setDraft('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {visibleMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
            <span className="text-4xl">💬</span>
            <p className="text-sm">选择一个场景来查看对话</p>
          </div>
        ) : (
          visibleMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                  max-w-[85%] rounded-2xl px-4 py-2.5
                  ${msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-slate-800 border border-slate-700 text-slate-100 rounded-bl-md'
                  }
                `}
              >
                {/* Agent icon */}
                {msg.role === 'agent' && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">🤖</span>
                    <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
                      Agent
                    </span>
                    <span className="text-[10px] text-slate-500 ml-auto">{msg.timestamp}</span>
                  </div>
                )}
                {msg.role === 'user' && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-blue-200/70 ml-auto">{msg.timestamp}</span>
                  </div>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-slate-700 p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息（演示模式）..."
            className="
              flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2
              text-sm text-slate-200 placeholder-slate-500
              focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
            "
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim()}
            className="
              px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700
              text-white text-sm font-medium rounded-lg
              transition-colors disabled:cursor-not-allowed
            "
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Determine which chat messages to show based on playback state.
 * - Before any step: only show user message
 * - During steps: show user message
 * - After all steps: show both user + agent response
 */
function getVisibleMessages(
  messages: ChatMessage[],
  responseStepReached: boolean,
): ChatMessage[] {
  const userMsg = messages.find((m) => m.role === 'user')
  const agentMsg = messages.find((m) => m.role === 'agent')

  if (!userMsg) return []
  // Show agent message as soon as playback reaches the response step
  if (responseStepReached && agentMsg) return [userMsg, agentMsg]
  return [userMsg]
}
