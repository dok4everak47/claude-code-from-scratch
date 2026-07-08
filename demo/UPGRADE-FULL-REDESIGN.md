# 重构：前端 UI 全面翻新 — 设计系统 + 组件 + 布局

## 目标
重写 `demo/src/` 下的全部 React 组件，建立统一的设计系统，替换所有 UI 样式。
功能逻辑不变（4 个 Tab：场景/自由/对比/多 Agent），只改视觉层。

## 设计系统

### 色板
```
bg-app        #020617  (slate-950)   ← 页面背景
bg-surface    #0f172a  (slate-900)   ← 卡片/面板背景
bg-elevated   #1e293b  (slate-800)   ← 悬浮/弹出层

border        rgba(51,65,85,0.5)     ← 边框色 (slate-700/50)
border-light  rgba(71,85,105,0.3)    ← 细分隔线 (slate-600/30)

text-primary  #f1f5f9  (slate-100)
text-secondary #94a3b8 (slate-400)
text-tertiary #64748b  (slate-500)

accent-blue   #3b82f6  (blue-500)
accent-violet #8b5cf6  (violet-500)
accent-green  #10b981  (emerald-500)
accent-yellow #eab308  (yellow-500)
accent-red    #ef4444  (red-500)
```

### 排版
```css
/* 字体栈 */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
font-mono: 'JetBrains Mono', 'Fira Code', monospace

/* 字号 */
text-xs:   11px  (0.6875rem)
text-sm:   12px  (0.75rem)
text-base: 13px  (0.8125rem)
text-lg:   15px  (0.9375rem)
text-xl:   18px  (1.125rem)
text-2xl:  24px  (1.5rem)
```

### 间距
```css
gap-2:  8px
gap-3:  12px
gap-4:  16px
gap-6:  24px
gap-8:  32px
gap-12: 48px

p-3:   12px
p-4:   16px
p-5:   20px
p-6:   24px
```

### 圆角
```css
rounded-lg:   8px     ← 卡片 / 面板
rounded-xl:   12px    ← 大卡片 / 主面板
rounded-full: 9999px  ← 按钮 / Badge
```

---

## 布局框架

### AppShell（新增组件）
所有页面的统一框架。替换 App.tsx 中的直接渲染。

```
┌─────────────────────────────────────────────────┐
│  TopBar (56px)                                   │
│  🤖 Agent Tool System  [场景] [自由] [对比] [🤖多Agent]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  Content (flex-1)                                │
│   ┌─────────────────────────────────────────┐   │
│   │  ScenarioView / LiveView /               │   │
│   │  ComparisonView / MultiAgentView         │   │
│   └─────────────────────────────────────────┘   │
│                                                 │
├─────────────────────────────────────────────────┤
│  StatusBar (32px) — 可选的全局状态栏              │
└─────────────────────────────────────────────────┘
```

**AppShell 组件实现：**
```
demo/src/components/AppShell.tsx
```
- TopBar: logo + 4 个 Tab 按钮 + 右侧操作按钮
- Content: 根据 mode 渲染对应视图组件
- Tab 按钮使用 `rounded-full` 药丸样式，选中态用 accent-blue

### 视图组件（替换当前 App.tsx 的大 switch）
每个 mode 一个独立视图组件，放在 `demo/src/views/` 目录：

| 视图 | 文件 | 对应当前 |
|------|------|---------|
| ScenarioView | `demo/src/views/ScenarioView.tsx` | 场景模式 |
| LiveView | `demo/src/views/LiveView.tsx` | 自由模式 |
| ComparisonView | `demo/src/views/ComparisonView.tsx` | 对比模式 |
| MultiAgentView | `demo/src/views/MultiAgentView.tsx` | 多 Agent |

每个视图负责自己的布局，从 App.tsx 接收 handlers 和 state props。

---

## 组件库

在 `demo/src/components/` 下新增/替换以下组件：

### 通用组件

#### Button（替换所有 `<button>`）
```tsx
<Button variant="primary" size="sm" onClick={...}>按钮文字</Button>
```
- variant: `primary` / `secondary` / `ghost` / `danger`
- size: `sm` (28px) / `md` (32px) / `lg` (40px)
- 态: default / hover / active / disabled
- `rounded-full` 药丸形状，与设计系统一致

#### Card
```tsx
<Card className="...">
  <Card.Header title="标题" action={<Button>...</Button>} />
  <Card.Body>内容</Card.Body>
</Card>
```
- bg: `bg-elevated` (slate-800)
- border: 1px solid `border` (slate-700/50)
- radius: `rounded-xl`
- Header 可选，带标题 + 右侧操作区

#### Badge
```tsx
<Badge variant="success">完成</Badge>
```
- variant: `default` / `success` / `warning` / `error` / `info`
- 圆角药丸，小字号，带圆点指示器

#### Panel
```tsx
<Panel title="Agent 思考流程" collapsible>
  内容
</Panel>
```
- 可折叠面板，标题 + 展开/收起箭头
- 深色背景 + 圆角

#### Modal
```tsx
<Modal open={true} onClose={...} title="详情">
  内容
</Modal>
```
- 居中弹窗，半透明遮罩
- 标题栏 + 关闭按钮 + 滚动内容区

### 状态 Indicator（替换 STATUS_CONFIG）
```tsx
<StatusBadge status="running" />
```
- 圆点 + 文字
- 颜色映射：pending=slate / running=blue / thinking=violet / completed=green / failed=red

### TopBar
```tsx
<TopBar
  mode={mode}
  onModeChange={setMode}
  rightSlot={<Button>...</Button>}
/>
```
- 左侧 Logo
- 中间 4 个 Tab（药丸按钮）
- 右侧 slot（API 设置按钮等）

### PlaybackControls
```tsx
<PlaybackControls
  currentStep={0} totalSteps={25}
  isPlaying={false}
  onPrev={...} onNext={...} onPlay={...} onPause={...} onReset={...}
/>
```
- 重置 / 上一步 / 播放/暂停 / 下一步
- 进度条 + 步骤计数
- `rounded-full` 按钮样式，统一高度

---

## 各视图设计

### ScenarioView（场景模式）
```
┌──────────────────────────────────────────────────┐
│  ScenarioSelector (水平 ButtonGroup)              │
│  [🌤️ 天气问答] [✈️ 旅行规划] [🔄 错误恢复]         │
├───────────────────────┬──────────────────────────┤
│                       │                          │
│  ChatPanel            │  AgentFlow               │
│  (对话消息列表)        │  (步骤时间轴)             │
│                       │                          │
│                       │                          │
├───────────────────────┴──────────────────────────┤
│  PlaybackControls                                 │
└──────────────────────────────────────────────────┘
```
- 场景选择器移到内容区顶部，不是顶栏
- 左对话 / 右 Agent 流程，1:1 比例

### LiveView（自由模式）
```
┌──────────────────────────────────────────────────┐
│  ChatPanel (全宽)                                 │
│  ┌────────────────────────────────────────────┐   │
│  │ 消息列表                                     │   │
│  │                                             │   │
│  ├────────────────────────────────────────────┤   │
│  │ 输入框 + 发送/停止按钮                        │   │
│  └────────────────────────────────────────────┘   │
│                                                   │
│  Agent 状态面板 (折叠在底部)                       │
│  ┌────────────────────────────────────────────┐   │
│  │ 当前步骤 · 工具调用记录 · Token 统计        │   │
│  └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```
- 全屏对话
- 底部可折叠 Agent 实时状态面板

### ComparisonView（对比模式）
```
┌──────────────────────────────────────────────────┐
│  输入框 + 运行按钮                                │
├─────────────────┬────────────────┬────────────────┤
│  Column 1       │  Column 2      │  Column 3      │
│  策略A           │  策略B         │  策略C          │
│  ┌───────────┐  │  ┌──────────┐  │  ┌──────────┐  │
│  │ 工具调用    │  │  │ 工具调用   │  │  │ 工具调用   │  │
│  │ 步骤列表    │  │  │ 步骤列表   │  │  │ 步骤列表   │  │
│  │ ...         │  │  │ ...        │  │  │ ...        │  │
│  └───────────┘  │  └──────────┘  │  └──────────┘  │
├─────────────────┴────────────────┴────────────────┤
│  总结对比 Tab: 量化指标 (工具调用数/耗时/轮次)      │
└──────────────────────────────────────────────────┘
```
- 3 列并排，总结和详细 Tab 切换

### MultiAgentView（多 Agent）
保持现有 MultiAgentFlow 的功能布局：
- TreeView / ThreeAgentScene 切换
- 底部的 EventTimeline + PlaybackControls
- 只升级视觉风格（颜色、字体、间距）

---

## 需要修改/新增的文件

### 新增文件
| 文件 | 内容 |
|------|------|
| `demo/src/components/AppShell.tsx` | 统一布局框架 |
| `demo/src/components/Button.tsx` | 通用按钮组件 |
| `demo/src/components/Card.tsx` | 通用卡片组件 |
| `demo/src/components/Badge.tsx` | 通用 Badge 组件 |
| `demo/src/components/Panel.tsx` | 可折叠面板 |
| `demo/src/components/Modal.tsx` | 模态弹窗 |
| `demo/src/components/StatusBadge.tsx` | 状态指示器 |
| `demo/src/components/PlaybackControls.tsx` | 播放控制条 |
| `demo/src/views/ScenarioView.tsx` | 场景视图 |
| `demo/src/views/LiveView.tsx` | 自由模式视图 |
| `demo/src/views/ComparisonView.tsx` | 对比模式视图 |
| `demo/src/views/MultiAgentView.tsx` | 多 Agent 视图 |

### 修改文件
| 文件 | 改动 |
|------|------|
| `demo/src/App.tsx` | 简化：只保留 state + handlers，渲染 `<AppShell>` + 对应视图 |
| `demo/src/components/ChatPanel.tsx` | 升级样式：使用 Card / Badge / Button 组件 |
| `demo/src/components/AgentFlow.tsx` | 升级样式：使用 Card 布局 |
| `demo/src/components/ToolCard.tsx` | 升级样式 |
| `demo/src/components/StepTimeline.tsx` | 升级样式 |
| `demo/src/components/ScenarioSelector.tsx` | 升级为 ButtonGroup 样式 |
| `demo/src/components/MultiAgentFlow.tsx` | 升级样式，其他逻辑不动 |
| `demo/src/components/ThreeAgentScene.tsx` | 逻辑不动 |
| `demo/src/components/ApiSettings.tsx` | 升级样式 |
| `demo/src/engine/types.ts` | 不动 |
| `demo/src/engine/*.ts` | 不动 |

### 删除文件
无。旧组件升级替换，不删。

---

## 样式约定
- 所有新组件用 Tailwind，不写手写 CSS
- 色值只使用上面设计系统定义的色板
- 所有 border 统一用 `border-slate-700/50`
- 卡片阴影用 `shadow-lg shadow-black/20`
- 动画用 `transition-all duration-150`

## 不修改的文件
- `src/` (CLI core)
- `demo/src/engine/` 下的所有 .ts 文件（types、agent、liveAgent、comparisonAgent、multiAgentEngine、scenarios 等）
- `ThreeAgentScene.tsx`
- `index.css`、`main.tsx`

## 分阶段实现

### Phase 1: 设计系统 + 通用组件
1. 创建 `Button`、`Card`、`Badge`、`Panel`、`Modal`、`StatusBadge`、`TopBar`、`PlaybackControls`、`AppShell`

### Phase 2: 视图组件
2. 创建 `ScenarioView`、`LiveView`、`ComparisonView`、`MultiAgentView`
3. 修改 `App.tsx` 使用新的视图组件

### Phase 3: 升级现有组件
4. 升级 `ChatPanel`、`AgentFlow`、`ToolCard`、`StepTimeline`、`ScenarioSelector`、`ApiSettings`、`MultiAgentFlow` 的样式

## 验证
```
cd demo && npm run build
```
