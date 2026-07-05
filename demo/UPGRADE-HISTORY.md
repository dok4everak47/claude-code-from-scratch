# 对比模式：增加历史记录

## 目标

每次对比运行完成后，自动保存结果到历史列表。
用户可以查看、切换、删除历史记录。

## 布局

```
┌──────────────────────────────────────────────────┐
│  [📋 场景] [✨ 自由] [🔬 对比]              [⚙️]  │
├──────────────────────────────────────────────────┤
│  输入问题: [______________________________] [运行] │
│  ┌─ 历史记录 ────────────────────────────────┐   │
│  │  ▼ 历史对比 (3)                            │   │
│  │    北京和上海哪个更适合旅游  · 2分钟前   [×] │   │
│  │    大阪和东京哪个更值得旅游  · 5分钟前   [×] │   │
│  │    JavaScript 和 Python 哪个好 · 10分钟前 [×] │   │
│  └────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────┤
│  [📊 总结]  [🔍 详细]                              │
│  ...对比结果内容...                                 │
└──────────────────────────────────────────────────┘
```

## 改动范围

只改 `demo/src/App.tsx`。

### 新增状态

```typescript
interface ComparisonHistoryEntry {
  id: string
  userMessage: string
  timestamp: number
  // 保存各列的最终状态（messages 和 steps 只保留关键摘要，不要存全文）
  columns: Array<{
    key: string
    label: string
    toolCallCount: number
    toolCallSequence: string[]  // ['get_weather', 'search_hotel', ...]
    durationMs: number
    turnCount: number
    summary: string  // 最终回复前 200 字
    error: string | null
  }>
}

const [comparisonHistory, setComparisonHistory] = useState<ComparisonHistoryEntry[]>([])
const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
```

### 保存时机

对比完成后，从 comparisonState 提取关键数据，保存到 `comparisonHistory`。

### 历史列表 UI

- 可折叠的"历史对比"面板（默认展开，显示最近 10 条）
- 每条显示：问题摘要 + 相对时间 + 删除按钮
- 点击某条历史记录，恢复该次的总结视图
- 点击删除按钮，从列表中移除

### localStorage 持久化

- 历史记录保存到 localStorage（key: `comparison-history`）
- 最大保留 20 条，超出时删除最旧的
- 刷新页面后历史记录仍然可用

### 其他

- 新对比完成后，自动选中新记录
- 历史记录中点击"重新运行"，把问题填入输入框并自动运行
