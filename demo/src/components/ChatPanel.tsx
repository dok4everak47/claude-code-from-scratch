// ============================================================
// ChatPanel — left panel showing conversation messages
// Supports two variants: 'scenario' (original) and 'live' (new)
// ============================================================

import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, LiveMessage } from '@/engine/types'
import { Button } from './Button'

interface ChatPanelBaseProps {
  /** 'scenario' = original pre-recorded mode, 'live' = real LLM interaction */
  variant: 'scenario' | 'live'
}

interface ScenarioChatProps extends ChatPanelBaseProps {
  variant: 'scenario'
  messages: ChatMessage[]
  responseStepReached: boolean
  onSend?: never
  isLiveLoading?: never
}

interface LiveChatProps extends ChatPanelBaseProps {
  variant: 'live'
  messages: LiveMessage[]
  responseStepReached?: never
  onSend: (text: string) => void
  isLiveLoading: boolean
}

type ChatPanelProps = ScenarioChatProps | LiveChatProps

export default function ChatPanel(props: ChatPanelProps) {
  if (props.variant === 'scenario') {
    return <ScenarioChat messages={props.messages} responseStepReached={props.responseStepReached} />
  }
  return (
    <LiveChat
      messages={props.messages}
      onSend={props.onSend}
      isLiveLoading={props.isLiveLoading}
    />
  )
}

// ============================================================
// Scenario variant (original behavior preserved)
// ============================================================

function ScenarioChat({
  messages,
  responseStepReached,
}: {
  messages: ChatMessage[]
  responseStepReached: boolean
}) {
  const [draft, setDraft] = useState('')

  const visibleMessages = getVisibleMessages(messages, responseStepReached)

  const handleSend = () => {
    if (!draft.trim()) return
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
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
            />
          ))
        )}
      </div>

      {/* Input area (demo mode — disabled) */}
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
              text-sm text-slate-100 placeholder-slate-500
              focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
            "
          />
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleSend}
            disabled={!draft.trim()}
          >
            发送
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Live variant (functional input + streaming)
// ============================================================

function LiveChat({
  messages,
  onSend,
  isLiveLoading,
}: {
  messages: LiveMessage[]
  onSend: (text: string) => void
  isLiveLoading: boolean
}) {
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleSend = () => {
    const text = draft.trim()
    if (!text || isLiveLoading) return
    setDraft('')
    onSend(text)
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
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
            <span className="text-4xl">✨</span>
            <p className="text-sm">输入你的问题，Agent 将实时调用工具来回答</p>
            <div className="text-xs text-slate-600 max-w-xs text-center">
              可用工具：天气查询、Wikipedia 百科、汇率查询、词典查询、讲个笑话、数学计算、时间查询、航班搜索、酒店搜索
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <LiveMessageBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area (functional) */}
      <div className="border-t border-slate-700 p-3">
        <div className="flex items-center gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题，例如：北京今天天气怎么样？Python 是什么？"
            rows={1}
            disabled={isLiveLoading}
            className="
              flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2
              text-sm text-slate-100 placeholder-slate-500 resize-none
              focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          />
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleSend}
            disabled={!draft.trim() || isLiveLoading}
            leftIcon={
              isLiveLoading ? (
                <span className="spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full" />
              ) : undefined
            }
          >
            {isLiveLoading ? '思考中' : '发送'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Reusable message bubble (scenario mode)
// ============================================================

function MessageBubble({
  role,
  content,
  timestamp,
}: {
  role: string
  content: string
  timestamp: string
}) {
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          max-w-[85%] rounded-2xl px-4 py-2.5
          ${role === 'user'
            ? 'bg-blue-500 text-white rounded-br-md'
            : 'bg-slate-800 border border-slate-700 text-slate-100 rounded-bl-md'
          }
        `}
      >
        {role === 'agent' && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">🤖</span>
            <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
              Agent
            </span>
            <span className="text-[10px] text-slate-500 ml-auto">{timestamp}</span>
          </div>
        )}
        {role === 'user' && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-blue-200/70 ml-auto">{timestamp}</span>
          </div>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  )
}

// ============================================================
// Live message bubble (live mode — includes tool messages + streaming)
// ============================================================

function LiveMessageBubble({ message }: { message: LiveMessage }) {
  // Tool messages — compact display
  if (message.role === 'tool') {
    let summary = ''
    try {
      const parsed = JSON.parse(message.content)
      if (parsed.error) {
        summary = `❌ ${parsed.error}`
      } else {
        // Try to give a meaningful summary
        if (parsed.temperature_c !== undefined) {
          summary = `🌤️ ${parsed.city}: ${parsed.temperature_c}°C, ${parsed.condition}`
        } else if (parsed.flights) {
          summary = `✈️ 找到 ${parsed.flights.length} 个航班`
        } else if (parsed.hotels) {
          summary = `🏨 找到 ${parsed.hotels.length} 家酒店`
        } else if (parsed.results) {
          summary = `🔍 找到 ${parsed.results.length} 条结果`
        } else if (parsed.result !== undefined) {
          summary = `🔢 ${parsed.expression ?? ''} = ${parsed.result}`
        } else if (parsed.formatted) {
          summary = `🕐 ${parsed.formatted}`
        } else {
          summary = '✅ 工具执行完成'
        }
      }
    } catch {
      summary = message.content.length > 100 ? message.content.slice(0, 100) + '...' : message.content
    }

    return (
      <div className="flex justify-center">
        <div className="max-w-[85%] rounded-lg px-3 py-1.5 bg-slate-800/50 border border-slate-700/50">
          <span className="text-xs text-slate-400">{summary}</span>
        </div>
      </div>
    )
  }

  // User / Assistant messages
  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          max-w-[85%] rounded-2xl px-4 py-2.5
          ${message.role === 'user'
            ? 'bg-blue-500 text-white rounded-br-md'
            : 'bg-slate-800 border border-slate-700 text-slate-100 rounded-bl-md'
          }
        `}
      >
        {message.role === 'assistant' && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">🤖</span>
            <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
              Agent
            </span>
            {message.isStreaming && (
              <span className="text-[10px] text-yellow-400 animate-pulse">生成中...</span>
            )}
            <span className="text-[10px] text-slate-500 ml-auto">{message.timestamp}</span>
          </div>
        )}
        {message.role === 'user' && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-blue-200/70 ml-auto">{message.timestamp}</span>
          </div>
        )}
        <p
          className={`text-sm leading-relaxed whitespace-pre-wrap ${
            message.isStreaming ? 'cursor-blink' : ''
          }`}
        >
          {message.content || (message.isStreaming ? '' : '（无内容）')}
        </p>
      </div>
    </div>
  )
}

// ============================================================
// Scenario mode: filter visible messages
// ============================================================

function getVisibleMessages(
  messages: ChatMessage[],
  responseStepReached: boolean,
): ChatMessage[] {
  const userMsg = messages.find((m) => m.role === 'user')
  const agentMsg = messages.find((m) => m.role === 'agent')

  if (!userMsg) return []
  if (responseStepReached && agentMsg) return [userMsg, agentMsg]
  return [userMsg]
}
