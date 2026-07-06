// ============================================================
// LiveAgent — real Agent Loop calling LLM API with streaming
// ============================================================

import type { AgentStep, AgentStatusFeed, LiveToolDef, LiveMessage, LiveSessionState, ToolCall, ToolStatus } from './types'
import { getLiveTool } from './liveTools'

// ---- helpers ----

let _idCounter = 0
function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${++_idCounter}`
}

function timestamp(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function makeStep(
  type: AgentStep['type'],
  content: string,
  toolCall?: ToolCall,
): AgentStep {
  return {
    id: uid('step'),
    type,
    content,
    toolCall,
    timestamp: timestamp(),
  }
}

// ============================================================
// LiveAgent callbacks
// ============================================================

export interface LiveAgentCallbacks {
  /** Called whenever session state changes — UI re-renders */
  onStateChange: (state: LiveSessionState) => void
}

// ============================================================
// LiveAgent class
// ============================================================

export class LiveAgent {
  private config: {
    apiKey: string
    baseUrl: string
    model: string
    maxTurns: number
    systemPrompt: string
  }
  private tools: LiveToolDef[]
  private callbacks: LiveAgentCallbacks
  private state: LiveSessionState
  private abortController: AbortController | null = null

  constructor(
    config: {
      apiKey: string
      baseUrl: string
      model: string
      maxTurns: number
      systemPrompt: string
    },
    callbacks: LiveAgentCallbacks,
  ) {
    this.config = config
    this.tools = []
    this.callbacks = callbacks
    this.state = {
      messages: [],
      steps: [],
      isLoading: false,
      currentTurn: 0,
      error: null,
      phase: 'plan',
      hasPlan: true,
      statusFeed: null,
    }
  }

  /** Update configuration at runtime */
  setConfig(config: {
    apiKey: string
    baseUrl: string
    model: string
    maxTurns: number
    systemPrompt: string
  }): void {
    this.config = config
  }

  /** Update the tool list (e.g. after config change) */
  setTools(tools: LiveToolDef[]): void {
    this.tools = tools
  }

  /** Get current state snapshot */
  getState(): LiveSessionState {
    return { ...this.state, messages: [...this.state.messages], steps: [...this.state.steps] }
  }

  /** Reset session to initial empty state */
  reset(): void {
    this.stop()
    this.state = {
      messages: [],
      steps: [],
      isLoading: false,
      currentTurn: 0,
      error: null,
      phase: 'plan',
      hasPlan: true,
      statusFeed: null,
    }
    this.emit()
  }

  /** Stop any running request */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    if (this.state.isLoading) {
      // Mark any streaming message as finished
      this.state = {
        ...this.state,
        isLoading: false,
        messages: this.state.messages.map((m) =>
          m.isStreaming ? { ...m, isStreaming: false } : m,
        ),
      }
      this.emit()
    }
  }

  /**
   * Run the agent loop with the given user message.
   * This is the main entry point for the free mode.
   */
  async run(userMessage: string): Promise<void> {
    if (this.state.isLoading) return

    // Reset abort controller
    this.abortController = new AbortController()

    // Add user message
    const userMsg: LiveMessage = {
      id: uid('msg'),
      role: 'user',
      content: userMessage,
      timestamp: timestamp(),
    }

    this.state = {
      ...this.state,
      messages: [...this.state.messages, userMsg],
      steps: [],
      isLoading: true,
      currentTurn: 0,
      error: null,
    }
    this.emit()

    try {
      await this.agentLoop()
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User stopped — already handled in stop()
        return
      }
      const errorMsg = err instanceof Error ? err.message : '未知错误'
      this.state = {
        ...this.state,
        isLoading: false,
        error: errorMsg,
        messages: this.state.messages.map((m) =>
          m.isStreaming ? { ...m, isStreaming: false } : m,
        ),
      }
      this.emit()
    }
  }

  // ============================================================
  // Internal: Agent Loop
  // ============================================================

  private async agentLoop(): Promise<void> {
    const { maxTurns } = this.config

    for (let turn = 0; turn < maxTurns; turn++) {
      this.state = {
        ...this.state,
        currentTurn: turn + 1,
        statusFeed: this.buildStatusFeed(turn + 1),
      }
      this.emit()

      // Build messages for LLM
      const chatMessages = this.buildChatMessages()

      // Call LLM with streaming
      const response = await this.callLLM(chatMessages)

      if (response.toolCalls && response.toolCalls.length > 0) {
        // LLM wants to call tools
        await this.handleToolCalls(response.toolCalls, response.content)
        // Update status feed after tool execution
        this.state = {
          ...this.state,
          statusFeed: this.buildStatusFeed(turn + 1),
        }
        this.emit()
        // Continue to next turn (tool results are in messages now)
      } else {
        // LLM gave final answer — done
        // The assistant message is already in state.messages from callLLM
        this.state = {
          ...this.state,
          isLoading: false,
          steps: [
            ...this.state.steps,
            makeStep('response', response.content),
          ],
          statusFeed: this.buildStatusFeed(turn + 1),
        }
        this.emit()
        return
      }
    }

    // Max turns reached
    this.state = {
      ...this.state,
      isLoading: false,
      error: `达到最大轮次限制（${maxTurns}），Agent 停止。`,
      messages: this.state.messages.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false } : m,
      ),
      statusFeed: null,
    }
    this.emit()
  }

  // ============================================================
  // Internal: Build chat messages for LLM API
  // ============================================================

  private buildChatMessages(): Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }> {
    const msgs: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }> = []

    // System prompt
    if (this.config.systemPrompt) {
      msgs.push({ role: 'system', content: this.config.systemPrompt })
    }

    // Conversation history + tool calls/results
    for (const msg of this.state.messages) {
      if (msg.role === 'user') {
        msgs.push({ role: 'user', content: msg.content })
      } else if (msg.role === 'assistant') {
        const entry: { role: string; content: string | null; tool_calls?: unknown[] } = {
          role: 'assistant',
          content: msg.content || null,
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          entry.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: tc.input,
            },
          }))
        }
        msgs.push(entry)
      } else if (msg.role === 'tool') {
        msgs.push({
          role: 'tool',
          tool_call_id: msg.toolCallId ?? '',
          content: msg.content,
        })
      }
    }

    return normalizeToolAdjacency(msgs)
  }

  // ============================================================
  // Internal: Filter tools by current phase
  // ============================================================

  private buildPhaseTools(): LiveToolDef[] {
    if (!this.state.hasPlan) {
      // PLAN 阶段：只暴露规划/读取工具
      return this.tools.filter((t) => t.name === 'set_todos' || t.name === 'read_file')
    }
    // BUILD 阶段：全部工具
    return this.tools
  }

  // ============================================================
  // Internal: Build status feed for real-time Agent State panel
  // ============================================================

  private buildStatusFeed(loopCount: number): AgentStatusFeed {
    // Derive file tree from tool call outputs that include file paths
    const fileTree: Array<{ path: string; status: 'writing' | 'added' | 'modified' | 'unchanged' }> = []
    for (const msg of this.state.messages) {
      if (msg.role === 'tool' && msg.toolCallId) {
        try {
          const parsed = JSON.parse(msg.content)
          if (typeof parsed === 'object' && parsed !== null) {
            const path = parsed.file ?? parsed.path ?? parsed.filename
            if (path && typeof path === 'string') {
              const exists = fileTree.find((f) => f.path === path)
              if (!exists) fileTree.push({ path, status: 'added' })
            }
          }
        } catch { /* skip non-JSON */ }
      }
    }

    // Build task list from tool calls in steps
    const taskList: Array<{ name: string; status: 'pending' | 'running' | 'completed' | 'failed' }> = []
    for (const step of this.state.steps) {
      if (step.type === 'tool_call' && step.toolCall) {
        const tc = step.toolCall
        const name = `${tc.name}(${tryTruncateArgs(tc.input)})`
        taskList.push({
          name,
          status: tc.status === 'success' ? 'completed' : tc.status === 'error' ? 'failed' : 'running',
        })
      }
    }

    return {
      fileTree,
      gitState: null, // playground 无真实 git
      taskList,
      loopCount,
      linterActive: false,
    }
  }

  // ============================================================
  // Internal: Call LLM with streaming
  // ============================================================

  private async callLLM(
    messages: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }>,
  ): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; arguments: string }> | null }> {
    const { baseUrl, model } = this.config

    // Determine if we're running on Vercel (production) — use proxy
    const isProd = typeof import.meta !== 'undefined' && import.meta.env?.PROD === true
    const useProxy = isProd || (typeof window !== 'undefined' && !window.location.hostname.includes('localhost'))

    let fetchUrl: string
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    if (useProxy) {
      // Deployed: use relative proxy path, API key is server-side
      fetchUrl = '/api/proxy'
    } else {
      // Local dev: use configured base URL with API key
      let normalizedUrl = baseUrl.replace(/\/+$/, '')
      if (!normalizedUrl.endsWith('/chat/completions')) {
        normalizedUrl = normalizedUrl.replace(/\/+$/, '') + '/chat/completions'
      }
      fetchUrl = normalizedUrl
      headers.Authorization = `Bearer ${this.config.apiKey}`
    }

    // Convert tools to OpenAI format (phase-filtered)
    const openaiTools = this.buildPhaseTools().map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
    }
    if (openaiTools.length > 0) {
      body.tools = openaiTools
      body.tool_choice = 'auto'
    }

    const response = await fetch(fetchUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: this.abortController?.signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      let errMsg = `API 错误 ${response.status}`
      try {
        const errJson = JSON.parse(errText)
        // Proxy returns { error: "..." } or DeepSeek returns { error: { message: "..." } }
        errMsg = errJson.detail || errJson.error?.message || errJson.error || errMsg
      } catch { /* ignore */ }
      throw new Error(errMsg)
    }

    if (!response.body) {
      throw new Error('响应没有 body（stream 为空）')
    }

    // Add a streaming assistant message placeholder
    const assistantMsg: LiveMessage = {
      id: uid('msg'),
      role: 'assistant',
      content: '',
      timestamp: timestamp(),
      isStreaming: true,
    }
    this.state = {
      ...this.state,
      messages: [...this.state.messages, assistantMsg],
    }
    this.emit()

    // Parse SSE stream
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let accumulatedContent = ''
    const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>()
    let finishReason: string | null = null

    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep the last partial line in the buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const dataStr = trimmed.slice(5).trim()
        if (dataStr === '[DONE]') continue

        try {
          const parsed = JSON.parse(dataStr)
          const choice = parsed.choices?.[0]
          if (!choice) continue

          finishReason = choice.finish_reason ?? finishReason

          const delta = choice.delta
          if (!delta) continue

          // Text content delta
          if (delta.content) {
            accumulatedContent += delta.content
            this.updateStreamingMessage(accumulatedContent)
          }

          // Reasoning content (for DeepSeek etc.)
          if (delta.reasoning_content) {
            // We can show reasoning as a thought step
            const lastStep = this.state.steps[this.state.steps.length - 1]
            if (!lastStep || lastStep.type !== 'thought' || lastStep.id !== 'reasoning') {
              this.state = {
                ...this.state,
                steps: [
                  ...this.state.steps,
                  makeStep('thought', delta.reasoning_content),
                ],
              }
            } else {
              // Append to existing reasoning step
              const updatedSteps = [...this.state.steps]
              updatedSteps[updatedSteps.length - 1] = {
                ...lastStep,
                content: lastStep.content + delta.reasoning_content,
              }
              this.state = { ...this.state, steps: updatedSteps }
            }
            this.emit()
          }

          // Tool calls delta
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              const existing = toolCallsMap.get(idx)
              if (existing) {
                // Append arguments
                if (tc.function?.arguments) {
                  existing.arguments += tc.function.arguments
                }
              } else {
                // New tool call
                toolCallsMap.set(idx, {
                  id: tc.id ?? uid('call'),
                  name: tc.function?.name ?? '',
                  arguments: tc.function?.arguments ?? '',
                })
              }
            }
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Flush final buffer
    if (buffer.trim()) {
      const dataStr = buffer.trim()
      if (dataStr.startsWith('data:') && dataStr.slice(5).trim() !== '[DONE]') {
        try {
          const parsed = JSON.parse(dataStr.slice(5).trim())
          const delta = parsed.choices?.[0]?.delta
          if (delta?.content) {
            accumulatedContent += delta.content
            this.updateStreamingMessage(accumulatedContent)
          }
        } catch { /* ignore */ }
      }
    }

    // Mark streaming complete and update the assistant message
    this.state = {
      ...this.state,
      messages: this.state.messages.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false, content: accumulatedContent } : m,
      ),
    }

    // Collect tool calls
    const toolCalls: Array<{ id: string; name: string; arguments: string }> | null =
      toolCallsMap.size > 0
        ? Array.from(toolCallsMap.values())
        : null

    // If there are tool calls, add them to the assistant message
    if (toolCalls) {
      const toolCallsForMessage: ToolCall[] = toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        input: tc.arguments,
        output: null,
        status: 'pending' as ToolStatus,
        description: `${tc.name}(${tryTruncateArgs(tc.arguments)})`,
      }))
      this.state = {
        ...this.state,
        messages: this.state.messages.map((m) =>
          m.isStreaming === false && m.role === 'assistant' && m.content === accumulatedContent
            ? { ...m, toolCalls: toolCallsForMessage }
            : m,
        ),
      }
    }

    return {
      content: accumulatedContent,
      toolCalls,
    }
  }

  // ============================================================
  // Internal: Handle tool calls
  // ============================================================

  private async handleToolCalls(
    toolCalls: Array<{ id: string; name: string; arguments: string }>,
    reasoningContent: string,
  ): Promise<void> {
    // Add a thought step summarizing the tool calls
    const toolNames = toolCalls.map((tc) => tc.name).join(', ')
    this.state = {
      ...this.state,
      steps: [
        ...this.state.steps,
        makeStep(
          'thought',
          reasoningContent
            ? `分析完成，需要调用工具：${toolNames}`
            : `Agent 决定调用以下工具：${toolNames}`,
        ),
      ],
    }
    this.emit()

    // Execute each tool and collect results
    for (const tc of toolCalls) {
      const toolDef = getLiveTool(tc.name)

      // Create tool call step with running status
      const toolCall: ToolCall = {
        id: tc.id,
        name: tc.name,
        input: tc.arguments,
        output: null,
        status: 'running',
        description: `${tc.name}(${tryTruncateArgs(tc.arguments)})`,
      }
      const toolStep = makeStep('tool_call', `调用 ${tc.name}`, toolCall)

      this.state = {
        ...this.state,
        steps: [...this.state.steps, toolStep],
      }
      this.emit()

      // Execute tool
      let output: string
      let status: ToolStatus
      let error: string | undefined

      if (!toolDef) {
        output = JSON.stringify({ error: `未知工具: ${tc.name}` })
        status = 'error'
        error = `未知工具: ${tc.name}`
      } else {
        try {
          let args: Record<string, unknown>
          try {
            args = JSON.parse(tc.arguments)
          } catch {
            args = { raw: tc.arguments }
          }
          output = await toolDef.execute(args)
          status = 'success'
        } catch (err) {
          output = JSON.stringify({
            error: err instanceof Error ? err.message : '工具执行失败',
          })
          status = 'error'
          error = err instanceof Error ? err.message : '工具执行失败'
        }
      }

      // Phase transition: set_todos success → PLAN → BUILD
      if (tc.name === 'set_todos' && status === 'success') {
        this.state = {
          ...this.state,
          hasPlan: true,
          phase: 'build',
        }
        this.emit()
      }

      // Update tool call step with result
      const updatedToolCall: ToolCall = {
        ...toolCall,
        output,
        status,
        error,
      }
      this.state = {
        ...this.state,
        steps: this.state.steps.map((s) =>
          s.id === toolStep.id ? { ...s, toolCall: updatedToolCall, content: `${tc.name} ${status === 'success' ? '执行成功' : '执行失败'}` } : s,
        ),
      }
      this.emit()

      // Add tool result message
      const toolMsg: LiveMessage = {
        id: uid('msg'),
        role: 'tool',
        toolCallId: tc.id,
        content: output,
        timestamp: timestamp(),
      }
      this.state = {
        ...this.state,
        messages: [...this.state.messages, toolMsg],
      }
      this.emit()
    }
  }

  // ============================================================
  // Internal: Update streaming message in state
  // ============================================================

  private updateStreamingMessage(content: string): void {
    this.state = {
      ...this.state,
      messages: this.state.messages.map((m) =>
        m.isStreaming ? { ...m, content } : m,
      ),
    }
    this.emit()
  }

  // ============================================================
  // Internal: Emit state to UI
  // ============================================================

  private emit(): void {
    this.callbacks.onStateChange(this.getState())
  }
}

/** Truncate arguments string for display */
function tryTruncateArgs(args: string, maxLen = 40): string {
  try {
    const obj = JSON.parse(args)
    const str = JSON.stringify(obj)
    return str.length > maxLen ? str.slice(0, maxLen) + '...' : str
  } catch {
    return args.length > maxLen ? args.slice(0, maxLen) + '...' : args
  }
}

/**
 * Tool Call 排序安全网
 * 确保 assistant + tool_calls 后紧接对应的 role: tool results，
 * 中间不能插入 system/user 消息，否则 API 返回 400。
 * 用 FIFO queue 配对 tool_call_id，将非 tool 消息推迟到队列清空后再放。
 */
function normalizeToolAdjacency(
  msgs: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }>,
): Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }> {
  const result: typeof msgs = []
  const pendingIds: string[] = []

  for (const msg of msgs) {
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      result.push(msg)
      for (const tc of msg.tool_calls as Array<{ id: string }>) {
        if (tc.id) pendingIds.push(tc.id)
      }
    } else if (msg.role === 'tool') {
      result.push(msg)
      if (msg.tool_call_id) {
        const idx = pendingIds.indexOf(msg.tool_call_id)
        if (idx >= 0) pendingIds.splice(idx, 1)
      }
    } else if (pendingIds.length === 0) {
      result.push(msg)
    }
    // pendingIds 非空时：system/user 被夹在 tool_calls 和 results 之间
    // 跳过，等 pending 清空后再放入
  }
  return result
}
