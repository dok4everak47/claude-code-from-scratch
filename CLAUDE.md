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

### 常用命令
```bash
cd demo
npm install
npm run dev       # 启动开发服务器
npm run build     # 生产构建
```
