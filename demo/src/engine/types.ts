// ============================================================
// Core types for the Agent Tool System Demo
// ============================================================

/** Status of a tool call */
export type ToolStatus = 'pending' | 'running' | 'success' | 'error'

/** A single tool call made by the agent */
export interface ToolCall {
  id: string
  /** Tool name, e.g. "get_weather" */
  name: string
  /** The arguments passed to the tool (JSON stringified) */
  input: string
  /** The result returned by the tool (JSON stringified), null if not yet executed */
  output: string | null
  /** Current status of this tool call */
  status: ToolStatus
  /** Error message if status is 'error' */
  error?: string
  /** Human-readable description shown in the timeline */
  description: string
}

/** The type of an agent step */
export type StepType = 'thought' | 'tool_call' | 'response'

/** A single step in the agent's reasoning/action loop */
export interface AgentStep {
  id: string
  /** What kind of step this is */
  type: StepType
  /** The textual content: reasoning for thought, summary for tool_call, final answer for response */
  content: string
  /** Associated tool call data, only present when type === 'tool_call' */
  toolCall?: ToolCall
  /** Simulated timestamp */
  timestamp: string
}

/** A user message in the conversation */
export interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: string
}

/** A named scenario composed of conversation messages + agent steps */
export interface Scenario {
  id: string
  name: string
  description: string
  /** Messages shown in the chat panel */
  messages: ChatMessage[]
  /** Steps shown in the agent flow panel */
  steps: AgentStep[]
}

/** The state of the agent simulator */
export interface AgentState {
  scenarioId: string | null
  /** Index of the currently active step (-1 means not started) */
  currentStepIndex: number
  /** Whether auto-play is active */
  isPlaying: boolean
  /** The scenario data being played */
  scenario: Scenario | null
}

// ============================================================
// Live / Free mode types
// ============================================================

/** A tool definition registered with the LLM (OpenAI function calling format) */
export interface LiveToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
  /** Execute the tool with parsed arguments, return a string result */
  execute: (args: Record<string, unknown>) => Promise<string>
}

/** Persisted API configuration */
export interface ApiConfig {
  provider: 'openai' | 'anthropic' | 'custom'
  baseUrl: string
  model: string
  apiKey: string
  maxTurns: number
  systemPrompt: string
}

/** Default API config */
export function defaultApiConfig(): ApiConfig {
  return {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    apiKey: '',
    maxTurns: 10,
    systemPrompt: `你是一个具备工具调用能力的 AI 助手。当用户提出问题时：
1. 分析用户需求，确定是否需要调用工具
2. 如果需要，调用合适的工具获取信息
3. 基于工具返回的结果，给出准确、有帮助的回答
4. 如果工具调用失败，分析原因并尝试修正后重试

请用中文回答用户的问题。`,
  }
}

/** A message in a live conversation */
export interface LiveMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  /** For tool messages: the tool call ID this result belongs to */
  toolCallId?: string
  /** For assistant messages: tool calls made in this turn */
  toolCalls?: ToolCall[]
  timestamp: string
  /** True while the LLM is still streaming this message */
  isStreaming?: boolean
}

/** State of a live agent session */
export interface LiveSessionState {
  messages: LiveMessage[]
  steps: AgentStep[]
  isLoading: boolean
  currentTurn: number
  error: string | null
}

/** Default initial live session state */
export function createLiveSessionState(): LiveSessionState {
  return {
    messages: [],
    steps: [],
    isLoading: false,
    currentTurn: 0,
    error: null,
  }
}
