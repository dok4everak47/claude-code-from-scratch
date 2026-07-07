// ============================================================
// LLM runtime — shared SSE streaming + tool-calling loop
// Extracted so both LiveAgent and the orchestration engine
// can drive a real LLM without duplicating SSE parsing.
// ============================================================

import type { LiveToolDef } from './types'

// ---- config + message shapes ----

export interface LLMConfig {
  apiKey: string
  baseUrl: string
  model: string
  maxTurns?: number
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
  name?: string
}

export interface ParsedToolCall {
  id: string
  name: string
  arguments: string
  result?: string
  error?: string
}

export interface StreamCallbacks {
  onTextDelta?: (delta: string) => void
  onReasoningDelta?: (delta: string) => void
  onToolCallStart?: (tc: { id: string; name: string; arguments: string }) => void
  onToolCallEnd?: (tc: ParsedToolCall) => void
  onUsage?: (usage: { prompt_tokens?: number; completion_tokens?: number }) => void
}

// ---- url / headers (mirrors liveAgent proxy logic) ----

function resolveFetch(config: LLMConfig): { url: string; headers: Record<string, string>; useProxy: boolean } {
  const isProd = typeof import.meta !== 'undefined' && import.meta.env?.PROD === true
  const useProxy = isProd || (typeof window !== 'undefined' && !window.location.hostname.includes('localhost'))
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (useProxy) return { url: '/api/proxy', headers, useProxy: true }
  let normalized = config.baseUrl.replace(/\/+$/, '')
  if (!normalized.endsWith('/chat/completions')) normalized += '/chat/completions'
  headers.Authorization = `Bearer ${config.apiKey}`
  return { url: normalized, headers, useProxy: false }
}

// ============================================================
// streamChat — one round trip. Streams the assistant message,
// parses tool_calls, executes each tool, returns final content.
// ============================================================

export async function streamChat(
  config: LLMConfig,
  messages: ChatMessage[],
  tools: LiveToolDef[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  opts?: { toolChoice?: 'auto' | 'required' },
): Promise<{
  content: string
  toolCalls: ParsedToolCall[] | null
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}> {
  const { url, headers, useProxy } = resolveFetch(config)

  const openaiTools = tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: true,
  }
  if (openaiTools.length > 0) {
    body.tools = openaiTools
    body.tool_choice = opts?.toolChoice ?? 'auto'
  }
  // DeepSeek / OpenAI return usage in the terminal chunk when this is set
  body.stream_options = { include_usage: true }
  // When routed through our first-party proxy, hand over the target endpoint
  // + key so the server can forward to the chosen (OpenAI-compatible) provider.
  if (useProxy) {
    body.baseUrl = config.baseUrl
    if (config.apiKey) body.apiKey = config.apiKey
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    let msg = `API 错误 ${response.status}`
    try {
      const j = JSON.parse(errText)
      msg = j.detail || j.error?.message || j.error || msg
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  if (!response.body) throw new Error('响应没有 body（stream 为空）')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let accumulated = ''
  const calls = new Map<number, { id: string; name: string; arguments: string }>()
  let buffer = ''
  let lastUsage: { prompt_tokens?: number; completion_tokens?: number } | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const dataStr = trimmed.slice(5).trim()
      if (dataStr === '[DONE]') continue
      try {
        const parsed = JSON.parse(dataStr)
        const choice = parsed.choices?.[0]
        if (parsed.usage) lastUsage = parsed.usage
        if (!choice) continue
        const delta = choice.delta
        if (!delta) continue
        if (delta.content) {
          accumulated += delta.content
          callbacks.onTextDelta?.(delta.content)
        }
        if (delta.reasoning_content) {
          callbacks.onReasoningDelta?.(delta.reasoning_content)
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            const existing = calls.get(idx)
            if (existing) {
              if (tc.function?.arguments) existing.arguments += tc.function.arguments
            } else {
              calls.set(idx, {
                id: tc.id ?? `call-${idx}`,
                name: tc.function?.name ?? '',
                arguments: tc.function?.arguments ?? '',
              })
            }
          }
        }
      } catch { /* skip malformed line */ }
    }
  }

  // Flush trailing buffer
  if (buffer.trim()) {
    const dataStr = buffer.trim()
    if (dataStr.startsWith('data:')) {
      try {
        const parsed = JSON.parse(dataStr.slice(5).trim())
        const delta = parsed.choices?.[0]?.delta
        if (delta?.content) {
          accumulated += delta.content
          callbacks.onTextDelta?.(delta.content)
        }
      } catch { /* ignore */ }
    }
  }

  // Execute tools (real execution)
  const toolCalls: ParsedToolCall[] = []
  for (const c of calls.values()) {
    callbacks.onToolCallStart?.({ id: c.id, name: c.name, arguments: c.arguments })
    let result: string | undefined
    let error: string | undefined
    const tool = tools.find((t) => t.name === c.name)
    try {
      const args = c.arguments ? JSON.parse(c.arguments) : {}
      result = tool ? await tool.execute(args) : '[未找到对应工具]'
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
    callbacks.onToolCallEnd?.({ id: c.id, name: c.name, arguments: c.arguments, result, error })
    toolCalls.push({ id: c.id, name: c.name, arguments: c.arguments, result, error })
  }

  return { content: accumulated, toolCalls: toolCalls.length ? toolCalls : null, usage: lastUsage }
}

// ============================================================
// runAgentLoop — loop streamChat until the model stops calling
// tools (or maxTurns reached). Returns the final answer text.
// ============================================================

export async function runAgentLoop(opts: {
  config: LLMConfig
  systemPrompt: string
  task: string
  tools: LiveToolDef[]
  initialMessages?: ChatMessage[]
  maxTurns?: number
  signal?: AbortSignal
  onText?: (delta: string) => void
  onReasoning?: (delta: string) => void
  onToolStart?: (tc: { id: string; name: string; arguments: string }) => void
  onToolEnd?: (tc: ParsedToolCall) => void
  onUsage?: (usage: { prompt_tokens?: number; completion_tokens?: number }) => void
}): Promise<string> {
  const maxTurns = opts.maxTurns ?? 10
  const messages: ChatMessage[] = [
    ...(opts.initialMessages ?? []),
    { role: 'system', content: opts.systemPrompt },
    { role: 'user', content: opts.task },
  ]

  let final = ''
  for (let turn = 0; turn < maxTurns; turn++) {
    if (opts.signal?.aborted) throw new DOMException('AbortError', 'AbortError')

    const { content, toolCalls } = await streamChat(
      opts.config,
      messages,
      opts.tools,
      {
        onTextDelta: (d) => opts.onText?.(d),
        onReasoningDelta: (d) => opts.onReasoning?.(d),
        onToolCallStart: (tc) => opts.onToolStart?.(tc),
        onToolCallEnd: (tc) => opts.onToolEnd?.(tc),
        onUsage: (u) => opts.onUsage?.(u),
      },
      opts.signal,
    )

    if (toolCalls) {
      messages.push({
        role: 'assistant',
        content: content || null,
        tool_calls: toolCalls.map((t) => ({
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: t.arguments },
        })),
      })
      for (const t of toolCalls) {
        messages.push({
          role: 'tool',
          tool_call_id: t.id,
          name: t.name,
          content: t.error ? `错误: ${t.error}` : (t.result ?? ''),
        })
      }
    } else {
      final = content
      messages.push({ role: 'assistant', content: content })
      return final
    }
  }
  return final
}
