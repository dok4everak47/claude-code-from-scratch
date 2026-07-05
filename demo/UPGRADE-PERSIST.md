# 刷新后保持页面状态

## 目标

刷新页面后，自动恢复到刷新前的 tab 和配置。
不要每次刷新都回到"场景模式"。

## 改动

在 `demo/src/App.tsx` 中：

1. 将 `mode` 状态的初始值改为从 localStorage 读取
2. 每次 mode 变化时保存到 localStorage
3. key: `agent-demo-active-mode`

```typescript
// 修改前
const [mode, setMode] = useState<AppMode>('scenario')

// 修改后
const [mode, setMode] = useState<AppMode>(() => {
  try {
    const stored = localStorage.getItem('agent-demo-active-mode')
    if (stored === 'scenario' || stored === 'live' || stored === 'comparison') return stored
  } catch {}
  return 'scenario'
})

// 加一个 useEffect 同步
useEffect(() => {
  localStorage.setItem('agent-demo-active-mode', mode)
}, [mode])
```

只改这一处，其他代码不动。
