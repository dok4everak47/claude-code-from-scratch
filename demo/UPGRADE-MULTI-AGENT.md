# 新增：多 Agent 编排可视化（Multi-Agent Orchestration View）

## 目标
在 Demo 中新增**多 Agent 编排视图**，展示多个 Agent 之间的任务委派、消息传递、子 Agent 生命周期。
用户可以从 3 个预设的多 Agent 场景中选择，观察父 Agent 如何拆解任务 → 分发给子 Agent → 汇聚结果。

## 新增 Tab / 入口

App 顶部 tab 栏新增第 4 个 tab：`[📋 场景模式] [✨ 自由模式] [🔬 对比模式] [🤖 多 Agent]`

## 新增类型定义（demo/src/engine/types.ts）

```typescript
// ---- Multi-Agent types ----

/** 一个 Agent 节点的状态 */
export type MultiAgentStatus = 'pending' | 'running' | 'thinking' | 'using_tools' | 'waiting' | 'completed' | 'failed'

/** Agent 节点（树中一个节点） */
export interface AgentNode {
  id: string
  name: string            // 显示名, e.g. "Coordinator", "Developer", "Reviewer"
  role: 'orchestrator' | 'worker' | 'specialist'
  status: MultiAgentStatus
  parentId: string | null
  childrenIds: string[]
  description: string     // 简短职责描述
  steps: AgentStep[]      // 该 Agent 内部推理步骤（复用现有类型）
  messages: AgentMessage[]
}

/** Agent 间消息 */
export interface AgentMessage {
  id: string
  from: string
  to: string
  content: string
  type: 'delegate' | 'progress' | 'result' | 'question' | 'response'
  timestamp: string
}

/** 完整的 Multi-Agent 场景 */
export interface MultiAgentScenario {
  id: string
  name: string
  description: string
  nodes: AgentNode[]
  // 按时间排序的所有事件（驱动播放）
  timeline: MultiAgentEvent[]
}

/** 时间轴事件 */
export interface MultiAgentEvent {
  id: string
  time: string              // "HH:MM:SS"
  type: 'agent_spawn' | 'agent_complete' | 'agent_fail' | 'agent_status_change' | 'message_send' | 'message_receive'
  agentId?: string
  messageId?: string
  description: string       // 事件描述文本
}
```

## 预设场景

### 场景 1: 代码审查工作流
- Coordinator → Developer（写代码）→ Reviewer（审查代码）
- Coordinator 收到需求 → 委派给 Developer → Developer 写代码(thinking+tools) → 报告完成 → Coordinator 委派 Reviewer → Reviewer 审查 → 发现问题 → Developer 修改 → Reviewer 通过 → Coordinator 输出最终结果

### 场景 2: 研究报告工作流
- Coordinator → Searcher（搜资料）+ Summarizer（写摘要）→ Writer（写报告）
- Coordinator 拆解研究主题为多个子问题 → 并行委派给 Searcher + Summarizer → 后者完成后 Writer 汇总 → Coordinator 审核输出

### 场景 3: 客服分流与协作
- 客服 Agent 接用户 → 判断类型 → 委派给 技术支持 / 账单处理 / 产品咨询 之一 → 对应专业 Agent 处理 → 客服整合回复

## 新增组件

### demo/src/components/MultiAgentFlow.tsx
核心可视化组件，展示多 Agent 编排图。

**布局设计：**
```
┌─────────────────────────────────────────────┐
│  🤖 Coordinater     [running] 🔵            │
│  ┌─────────────────────┐                     │
│  │ "分配任务给子Agent…" │                      │
│  └─────────────────────┘                     │
│         │ delegate              │ delegate   │
│    ┌────▼────┐           ┌─────▼────┐        │
│    │ Developer│ [done]✅  │ Reviewer │ [wait] │
│    │ 写代码…     │           │ 审查代码…  │        │
│    └─────────┘           └──────────┘        │
│         │ result                │ result     │
│    ┌────▼─────────────────────────▼────┐     │
│    │         Final Response            │     │
│    └────────────────────────────────────┘     │
└─────────────────────────────────────────────┘
```

**交互行为：**
- 每个 Agent 节点可点击 → 展开其内部步骤（复用现有 AgentFlow 的 StepTimeline 样式）
- 连线上的 label 显示消息类型（delegate / result / question）
- 连线动画：消息发送时沿连线流动的高亮效果
- 底部 Timeline 显示整体编排事件序列
- 播放控制：上一步 / 自动播放 / 下一步 / 重置

**实现要点：**
- 用 flexbox + CSS grid 实现树形布局，不用额外图形库
- 节点状态用彩色圆点表示（🟢 running / ✅ completed / ❌ failed / ⏳ waiting）
- 连线用 SVG 或 CSS border + transform 实现
- 每个节点展开/折叠内部 Steps（参考现有 AgentFlow 的面板展开逻辑）

### 新增文件：demo/src/engine/multiAgentScenarios.ts
定义 3 个预设多 Agent 场景的完整数据（AgentNode[] + MultiAgentEvent[]）。

### 新增文件：demo/src/engine/multiAgentEngine.ts
多 Agent 模拟引擎，处理播放控制：
- `getStateAtEvent(index)` — 返回 event index 对应的完整状态快照
- 状态包括每个 Agent 的当前 status、正在显示的 message、连线高亮

## 需要修改的文件

| 文件 | 改动 |
|------|------|
| `src/App.tsx` | 新增 AppMode = 'multiAgent'；增加 tab 按钮；根据 mode 渲染 MultiAgentFlow 或原有组件 |
| `src/engine/types.ts` | 新增全部 Multi-Agent 类型定义 |
| `src/components/MultiAgentFlow.tsx` | **新建** |
| `src/engine/multiAgentScenarios.ts` | **新建** |
| `src/engine/multiAgentEngine.ts` | **新建** |

## 不修改的文件

- `src/` (CLI core)
- `liveTools.ts`, `liveAgent.ts` — 不相关
- `AgentFlow.tsx`, `ChatPanel.tsx`, `ToolCard.tsx`, `StepTimeline.tsx` — 已有组件保持不动，MultiAgentFlow 内局部引用 StepTimeline 样式

## 关键约束

1. **纯前端模拟** — 不连真实 API，所有数据来自预设场景
2. **状态驱动** — 每个时间点有一个完整快照，播放就是按 index 切换快照
3. **节点可展开** — 点击 Agent 节点显示其内部 steps，再次点击收起
4. **深色主题** — 与现有 UI 风格一致

## 测试

1. `cd demo && npm run dev`
2. 切换到「🤖 多 Agent」tab
3. 选择"代码审查工作流"场景 → 播放观察流程
4. 点击各 Agent 节点展开/收起
5. 测试上一步/下一步/重置
6. 切换其他 2 个场景验证
7. `npm run build` 确认编译通过
