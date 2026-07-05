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
