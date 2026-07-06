# Claude Code from Scratch

## 项目定位
一个从零构建的 Coding Agent CLI，附带可视化 Agent Tool System Demo。

## 项目结构
| 目录 | 说明 | 可以改？ |
|------|------|---------|
| `src/` | CLI 核心代码（agent.ts, tools.ts, ui.ts 等） | ❌ 不要动 |
| `dist/` | TypeScript 编译输出 | ❌ 不要动 |
| `demo/` | Agent Tool System Demo（React + Vite） | ✅ 主要工作区 |

> ⚠️ **重要：`src/` 和 `dist/` 是已有 CLI 项目，不要修改任何文件。**

## Demo 开发（`demo/`）

### 技术栈
- React + TypeScript + Vite
- Tailwind CSS
- 纯前端，无后端

### 目录结构（demo/ 内）
```
demo/src/
├── components/
│   ├── ChatPanel.tsx         ← 左侧对话面板
│   ├── AgentFlow.tsx         ← 右侧 Agent 步骤流
│   ├── ToolCard.tsx          ← 单个 Tool Call 卡片
│   ├── StepTimeline.tsx      ← 步骤时间轴
│   └── ScenarioSelector.tsx  ← 场景切换
├── engine/
│   ├── types.ts              ← 核心类型定义
│   ├── tools.ts              ← 工具定义
│   ├── agent.ts              ← Agent Loop 模拟器
│   └── scenarios.ts          ← 预设场景数据
├── App.tsx
└── main.tsx
```

### 关键约束
- **数据来源：** 模拟器（scenarios.ts 中预设），绝不连真实 LLM API
- **3 个预设场景：**
  1. 天气问答 — 1 次 tool call，最简单流程
  2. 旅行规划 — 3 次 tool call 串联，展示多工具编排
  3. 错误恢复 — 第 1 次失败 → 重试 → 成功，展示鲁棒性
- **UI 布局：** 左对话 + 右 Agent 流程 + 底播放控制（上一步/自动播放/下一步）
- **主题：** 深色系，参考 Claude Code CLI 风格

### 常见命令
```bash
cd demo
npm install
npm run dev       # 启动开发服务器
npm run build     # 生产构建
```

---

## VAF 架构参考 — 可借鉴的设计模式

来自 [Veyllo-Labs/VAF](https://github.com/Veyllo-Labs/VAF)（Veyllo Agentic Framework）的 Coder sub-agent 源码，与本项目高度同构，**可参考但不需照搬**。

### 1. Tool Call 排序安全网（`normalizeToolAdjacency`）

**问题：** DeepSeek / OpenAI 要求 `assistant + tool_calls` 后必须紧接 `role: tool` 结果。中间插入 system/user 消息会返回 `400 "insufficient tool messages following tool_calls"`。

**VAF 做法（`vaf/tools/coder.py` → `_normalize_tool_adjacency`）：**
- 每次发消息前跑一次排序归一化
- FIFO queue 配对 `tool_call_id`，保证每个 assistant 的 tool_calls 后紧跟对应 tool results
- wedged 的 system/user 消息挪到 tool block 后面
- 幂等、provider 无关

**在你的项目中：** 加到 `liveAgent.ts` → `buildChatMessages()`，return 前过一遍。

```typescript
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
    // 简单跳过，等 pending 清空后再放入
  }
  return result
}
```

### 2. Sub-Agent IPC 状态机 — for-return 运行时追踪

VAF 的 `vaf/core/subagent_ipc.py` 用文件队列做跨进程 IPC，状态机模型可以直接复用：

```
SubAgentTask {
  id, agentType (coding_agent / research_agent / librarian),
  status: pending → running → completed / failed / timeout,
  lastHeartbeat, sessionId
}

PausedWorkflow {
  waitingForTaskId, currentStepIndex,
  outputs, workflowName
}
```

**在你的 playground 中可做：**
- 新建 `demo/src/engine/ipc.ts`，实现一个轻量事件总线
- `AgentFlow.tsx` 订阅 IPC 事件，将 sub-agent 状态转换渲染为 timeline step
- 心跳（heartbeat）可视化为"Agent 正在思考..."动画

### 3. Stuck / Zombie Detection — 第 4 个 Demo Scenario

VAF 有 4 种安全网，可做成一个新的 scenario（`scenarios.ts`）：

| 机制 | 触发条件 | 显示效果 |
|------|---------|---------|
| **Zombie Detection** | idle_loop_count > 3，只有文本没有 tool call | 🛑 SYSTEM OVERRIDE 卡片 |
| **Fake Completion** | 文本说"done"但没调 task_done | 强制纠正：请调用 task_done |
| **Hallucination Guard** | 创建型 task 调了 task_done 但没写文件 | 🚫 CRITICAL ERROR: 未创建文件 |
| **Linter Gate** | 文件有 linter 错误就调 task_done | 🚫 TASK_DONE BLOCKED |

参考 `docs/agents/CODER_ARCHITECTURE.md` → Section 4（agentic loop safety nets）。

### 4. Context Switch 历史修正（`_historyAtDispatch`）

**问题：** 多 task 上下文切换时，tool result 可能追加到切换后的新 context 而非调用时的 context，导致 API 拒绝。

**VAF 做法（`vaf/tools/coder.py`）：**
```python
# 在 tool 执行前保存当前 history 引用
_history_at_dispatch = history
# 执行 tool（可能触发 context switch 重新赋值 history）
...
# 结果追加到调用时的 history
_history_at_dispatch.append({...})
```

**在你的项目中：** 当前 `handleToolCalls()` 是串行执行，暂不需要。如果以后加并行 tool 执行或多 context 切换，这个模式直接套用。

### 5. Write File 实时 Lint

VAF 在每个 `write_file` 后自动调用 linter，结果注入到消息历史中：

```
write_file 成功 → 自动跑 linter
  ✅ PASS → 继续
  ❌ FAIL → 系统消息："fix the linter errors"
  阻塞 task_done 直到 linter pass
```

在 `liveAgent.ts` → `handleToolCalls()` 中，调用 `write_file` 后可做类似检查。

### 完整引用

| 模式 | VAF 文件 | 本项目的对应位置 |
|------|---------|----------------|
| Tool call 排序 | `vaf/tools/coder.py` — `_normalize_tool_adjacency` | `liveAgent.ts` → `buildChatMessages()` |
| Sub-agent IPC | `vaf/core/subagent_ipc.py` | 新建 `demo/src/engine/ipc.ts` |
| 安全网 | `docs/agents/CODER_ARCHITECTURE.md` → Section 4 | `scenarios.ts` → 新增 scenario |
| Context 切换 | `vaf/tools/coder.py` — `_history_at_dispatch` | `liveAgent.ts`（暂不需要） |
| 实时 lint | `vaf/tools/coder.py` — write_file handler | `handleToolCalls()` |
| Template 系统 | `vaf/tools/coder_templates/` | 项目已有自己的模板 |

---

### 6. ORIENT → PLAN → BUILD → DOCUMENT 四阶段（代码强制）

VAF 的 Coder 用**固定阶段**（不是 prompt 暗示，是代码强制）来引导弱模型。与你第 10 章 Plan Mode 直接对应。

```python
# 四个阶段，代码级隔离
ORIENT:   纯 Python 扫描项目（无 LLM），生成文件清单注入 planner
          → `_build_orientation_summary(base_dir)`
          现有文件、depth 3/60 文件上限、跳过 node_modules/.git
          
PLAN:     只有 set_todos / read_file / list_files 可用
          write_file / task_done 被隐藏
          模型必须先规划再执行
          
BUILD:    set_todos 被隐藏（不允许改计划）
          全部工具可用：write_file / edit_file / read_file / 
          web_search / python_sandbox / run_tests / git_log
          bash（kernel-jailed shell）
          
DOCUMENT: 单次 LLM 调用（无工具），自动更新 README
          `_detect_run_changes()` → git diff 检测本次变更
          只允许写 README.md 或 docs/**
          变更检测排除 .git 和 infra 文件
```

**在你的项目中：** 当前 `liveAgent.ts` 的 loop 没有 stage 概念。如果要做 Plan Mode，参考这个 ORIENT→PLAN→BUILD 的代码强制模式。

**关键差异：** VAF 是**代码 enforce**（tool schema 随阶段变化），不是 prompt 建议。弱模型不会忽略它。

VAF 源码位置：`docs/agents/CODER_ARCHITECTURE.md` → Section 5a（ORIENT→PLAN→BUILD→DOCUMENT）

### 7. Sub-Agent 进程隔离（fork-return 的完整实现）

VAF 的 Coder sub-agent 不是在同一进程中调函数，而是**真的 fork 一个子进程**：

```python
# vaf/tools/coder.py → run() → A. Process Isolation
if "VAF_IN_SUBAGENT_TERMINAL" not in os.environ:
    # 主进程 → 生成子进程
    subprocess.Popen([sys.executable, "-m", "vaf.main", "subagent", "run", "coding_agent"])
    # 通过 subagent_ipc 文件队列通信
    task = SubAgentTask(task_id=..., agent_type="coding_agent")
    return f"[SUBAGENT_ASYNC:{task_id}]"
else:
    # 子进程 → 执行实际逻辑
    # ...
```

**与你 subagent.ts fork-return 的区别：**

| 特性 | 你的 subagent.ts | VAF 的做法 |
|------|-----------------|-----------|
| 隔离级别 | 同进程调函数 | 独立子进程 |
| 通信 | 函数 return | 文件队列 IPC |
| 工具集过滤 | 按 agent type 选 | 有特定的 tool_list |
| 并行 | 串行（等返回） | 异步 + 心跳 + 超时 |
| 状态追踪 | 无 | SubAgentTask 完整状态机 |
| 暂停恢复 | 无 | PausedWorkflow 支持 |

**在你的 playground 中可展示的：** 把 `SubAgentTask` 的状态机（pending→running→completed/failed/timeout）渲染为 agent 调试器 timeline 的 IPC 通道视图。

VAF 源码位置：`vaf/core/subagent_ipc.py`（完整文件）

### 8. Tool Schema 动态变化（强行引导模型行为）

VAF 在 loop 的每次迭代**动态生成 tool schema**，根据当前阶段暴露不同的工具集合：

```python
# vaf/tools/coder.py → 4.D 每次循环
if not task_mgr.has_plan():
    current_tools = [
        set_todos, read_file, list_files
    ]
    # write_file / task_done 被隐藏
else:
    current_tools = [
        write_file, edit_file, read_file, list_files,
        web_search, python_sandbox, run_tests,
        git_log, task_done, project_history, project_rollback,
    ]
    # set_todos 被隐藏（防止重规划循环）
```

这比在 prompt 里写"请先规划再执行"**有效得多** — 模型根本无法调用被隐藏的工具，API 会返回 `400 function not found`。即使最强的模型也无法"忽略"这个约束。

**在你的项目中的应用：**
```typescript
// liveAgent.ts — 在 agentLoop 中根据阶段选择 tools
const openaiTools = (() => {
  if (!hasPlan) {
    // PLAN 阶段：只有 set_todos / read_file
    return [setTodosDef, readFileDef]
  }
  // BUILD 阶段：全部工具
  return allTools
})()
```

VAF 源码位置：`docs/agents/CODER_ARCHITECTURE.md` → Section D（Tool Schema Generation）

### 9. WebUI Live Feed — 实时 agent 状态推送

VAF 的 Coder 在运行期间持续向前端推送状态，**与你 AgentFlow timeline 完全同一思路**：

```python
# vaf/tools/coder.py → 7. WebUI Live Feed

# 完整项目状态（每轮 loop + 每次 write_file 后推送）
_emit_coder_state()  # → coder_state 事件
{
  file_tree:     每个文件的状态（W=writing/A=added/M=modified）
  git_state:     当前分支、脏文件数、最近 commit
  task_list:     实时 per-task 状态（pending/running/completed/failed）
  loop_count:    当前 loop 编号
  linter_active: linter 是否有错误
}

# 实时代码预览（流式写入时的 partial file content）
_emit_live_code()  # → subagent_update 事件
{
  file:  "index.html",
  code:  "<!DOCTYPE html>..."  # 正在流式写入的片段
}
# 节流: 0.35s 一次, tail-capped 6KB
# write_file dispatch 时发一次完整内容（无节流）
```

**对你 Demo 的借鉴价值：**

| 你的 AgentFlow 目前 | VAF 多了什么 |
|---|---|
| 显示 agent steps | ✅ 文件树（文件级 W/A/M 状态） |
| 3 个预设场景 | ✅ git 状态显示 |
| 播放控制 | ✅ lint 实时状态 |
| — | ✅ 多 task 并发进度 |

VAF 源码位置：`docs/agents/CODER_ARCHITECTURE.md` → Section 7（WebUI Live Feed）

### 10. Git 自动 Commit + 版本回滚

VAF 的 Coder **每次 run 结束时自动 git commit**，所有 task 完成/部分完成/失败都会提交：

```python
# vaf/tools/coder.py → _final_commit()

# 每次 exit path 都执行（包括失败）:
git add -A
git commit -m "VAF Coder: <task excerpt>
Status: COMPLETE|PARTIAL (n/m tasks)"

# 没有 git identity 时自动用 VAF 的 one-off 身份
# 从不修改用户的 git config
```

**版本回滚（history/rollback 委托）：**
```python
# coding_agent(task="rollback auf <id>", project_path=...)
# → 先用 git commit 备份当前未提交的工作
# → 再用 git revert 恢复目标版本（不是 reset，不重写历史）
# → 每个 rollback 本身也可被回滚
```

**在你的项目中的对应：**`src/` CLI 项目已有 git log 工具。VAF 的自动 commit 模式适合加到 `demo/` 的 playground 中，作为"Agent 工作流跟踪"的可视化功能——每次 tool call 后显示一条 git commit 记录。

VAF 源码位置：`docs/agents/CODER_ARCHITECTURE.md` → Section 6（Cleanup & Exit） + Section 3.A0（History/Rollback Delegation）
