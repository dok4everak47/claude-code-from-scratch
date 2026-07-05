# Agent Tool System Demo — 升级需求 v2.0

## 当前问题

目前 Demo 是预置场景的逐帧播放器，所有 Tool Call 数据硬编码在 scenarios.ts 中，相当于"幻灯片"，不是真正的 Agent 演示。

## 升级目标

让用户输入自己的问题，Demo 实时调用 LLM API，真实展示 Agent Loop 全过程：思考 → 调工具 → 返回结果 → 下一轮。

---

## 架构

```
用户输入问题
    ↓
前端调用 LLM API（OpenAI / Anthropic 兼容）
    ↓
LLM 返回流式响应（文本 + Tool Call）
    ↓
解析流，提取 tool_call 和 assistant message
    ↓
执行工具（mock 或真实），将结果返回给 LLM
    ↓
LLM 继续推理或给出最终回答
    ↓
实时渲染到 AgentFlow + ChatPanel
```

**纯前端实现**（不需要后端服务器），所有 API 调用在浏览器中完成。

---

## 详细需求

### 1. API 配置（新增）

```
demo/src/config.ts
```

```typescript
export const apiConfig = {
  // 默认值，用户可在 UI 中修改
  provider: 'openai',           // 'openai' | 'anthropic' | 'custom'
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  apiKey: '',                   // 用户在浏览器中输入，保存在 localStorage
}
```

- 提供一个简单的 API 设置面板（可折叠），用户填写 API Key、Base URL、Model
- API Key **只存在浏览器 localStorage**，绝不发送到任何第三方
- 保留现有的"场景模式"作为默认入口，新增"自由模式"tab

### 2. 自由模式（新增）

```
demo/src/engine/liveAgent.ts
```

核心 Agent Loop（参考 claude-code-from-scratch/src/agent.ts 的逻辑，但简化）：

```typescript
interface LiveAgentConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;  // 可自定义
  tools: ToolDefinition[];  // 注册给 LLM 的工具列表
  maxTurns: number;       // 最大轮次，默认 10
}
```

**Agent Loop 流程：**

```
1. 构建 messages（system + 历史 + 用户输入）
2. 调用 LLM chat.completions (stream: true)
3. 实时渲染 assistant 的流式文本到 ChatPanel（打字机效果）
4. 如果 LLM 返回 tool_calls：
   a. 在 AgentFlow 中插入 ToolCall 卡片（状态: running）
   b. 执行工具（调 mock 或真实函数）
   c. 将 tool result 追加到 messages
   d. 再次调用 LLM（新一轮）
5. 如果 LLM 返回普通文本 → 渲染为最终回复，结束
```

**参考 src/tools.ts 的 ToolDef 类型，在 demo 中定义轻量版本：**

```typescript
interface LiveToolDef {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: Record<string, any>) => Promise<string>;
}
```

### 3. 预置工具（供 LLM 调用）

| 工具名 | 说明 | 实现方式 |
|--------|------|---------|
| `get_weather` | 查天气 | mock 返回随机天气数据 |
| `search_web` | 搜索 | mock 返回预设结果 |
| `calculate` | 数学计算 | 真实执行 eval |
| `get_time` | 当前时间 | 真实返回 Date.now() |
| `search_flight` | 查航班 | mock 返回预设数据 |
| `search_hotel` | 查酒店 | mock 返回预设数据 |

所有工具在 `demo/src/engine/liveTools.ts` 中定义。
mock 工具应该有一定随机性，让每次运行的返回略有不同，显得真实。

### 4. UI 变更

#### 顶部增加 tab 切换

```
[ 📋 场景模式 ]  [ ✨ 自由模式 ]
```

- 场景模式：保留现有 3 个预设场景 + 播放控制
- 自由模式：新的交互流程

#### 自由模式 UI

```
┌──────────────────────────────────────────────┐
│  [场景模式 | 自由模式]  [⚙️ API 设置]          │
├──────────────────────┬───────────────────────┤
│                      │                       │
│  Q: 北京和上海哪个    │  ● Agent 思考中...     │
│     更适合旅游？       │                       │
│                      │  ┌───────────────────┐│
│  💬 让我查一下两地    │  │ get_weather       ││
│     天气和景点...     │  │ input: Beijing    ││
│                      │  │ output: 25°C      ││
│                      │  │ status: ✅         ││
│  ─ ─ ─ ─ ─ ─ ─ ─ ─  │  └───────────────────┘│
│                      │                       │
│  [输入问题...] [发送]  │  🔄 第 1/5 轮         │
│                      │                       │
├──────────────────────┴───────────────────────┤
│  [⏹ 停止]  [🔄 重试]  [💾 导出对话]            │
└──────────────────────────────────────────────┘
```

#### API 设置面板（点击 ⚙️ 展开）

```
┌─────────────────────────────┐
│ API 设置                    │
├─────────────────────────────┤
│ Provider: [OpenAI ▼]        │
│ Base URL: [___________]     │
│ Model:    [gpt-4o ______]   │
│ API Key:  [•••••••••••]    │
│ Max Turns:[10           ]   │
│ System Prompt: [编辑...]    │
│                             │
│ [保存到本地] [测试连接]      │
└─────────────────────────────┘
```

### 5. 流式渲染

- LLM 返回流式数据时，ChatPanel 实时显示打字机效果
- 如果流中包含 tool_calls，在 AgentFlow 中动态插入 ToolCall 卡片
- 工具执行完成后，卡片状态从 running → success / error
- 支持中途停止（用户点击停止按钮，中止 fetch）

### 6. 对话管理

- 每个对话是一个 Session，可以清空重新开始
- 对话历史保存在内存中，刷新页面丢失（不需要持久化）
- 支持导出对话为 JSON（方便调试和分析）

### 7. 文件组织

```
demo/src/
├── components/
│   ├── ChatPanel.tsx          ← 改造：支持流式渲染
│   ├── AgentFlow.tsx          ← 改造：支持动态插入新的 ToolCall
│   ├── ToolCard.tsx           ← 改造：支持 running 状态动画
│   ├── ScenarioSelector.tsx   ← 保留
│   ├── StepTimeline.tsx       ← 保留（场景模式）
│   └── ApiSettings.tsx        ← 新增：API 配置面板
├── engine/
│   ├── types.ts               ← 增加 LiveAgent 相关类型
│   ├── tools.ts               ← 保留（场景模式）
│   ├── scenarios.ts           ← 保留（场景模式）
│   ├── agent.ts               ← 保留（场景模式模拟器）
│   ├── liveAgent.ts           ← 新增：真实 Agent Loop
│   └── liveTools.ts           ← 新增：真实工具定义
├── App.tsx                    ← 改造：加 tab 切换
├── main.tsx
└── index.css
```

---

## 不做的事（明确排除）

- ❌ 不连后端服务器（纯浏览器端 API 调用）
- ❌ 不做用户登录/认证
- ❌ 不持久化对话到数据库
- ❌ 不接入现有的 claude-code-from-scratch/src/ 代码（保持解耦）
- ❌ 不做复杂的 Prompt Engineering

---

## 验收标准

1. 用户填写 API Key 后，输入"北京的天气怎么样？"，能看到 Agent 思考 → 调 get_weather → 返回结果
2. 多轮对话：用户追问"那上海呢？"，Agent 基于上下文再次调用工具
3. 流式输出：LLM 的思考过程实时显示（打字机效果）
4. Tool Call 卡片在 AgentFlow 中动态插入，状态实时更新
5. 场景模式（原有功能）完全不受影响
6. 切换 tab 时状态隔离
