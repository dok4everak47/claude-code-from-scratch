# DEBUG: 打印 API 请求消息排查 400 错误

## 问题

DeepSeek 返回 `400 "tool_call_ids did not have response messages"`。从代码走读无法确认原因，需要在发送前打印实际消息结构。

## 改动

在 `demo/src/engine/liveAgent.ts` 的 `callLLM()` 中，`fetch()` 前加一行 `console.table()` 打印消息摘要：

```typescript
// 在 fetch 前（约第 399 行）：
// 打印消息摘要
console.group('📤 API Request Messages')
messages.forEach((m, i) => {
  const toolCallIds = m.tool_calls
    ? (m.tool_calls as Array<{ id: string }>).map(tc => tc.id).join(', ')
    : m.tool_call_id || '-'
  const contentPreview = (m.content ?? '').toString().slice(0, 60)
  console.log(`[${i}] ${m.role.padEnd(10)} toolCallIds: ${toolCallIds.padEnd(40)} content: "${contentPreview}"`)
})
console.groupEnd()
```

## 验证方式

- 打开浏览器 DevTools Console
- 自由模式问 "iPhone 17"
- 看第一次请求（tool_calls 返回前）和第二次请求（tool result 发送时）的消息结构
- 重点检查第二次请求中，assistant 的 tool_calls id 和 tool 的 tool_call_id 是否匹配

## 不改的文件

- 其他所有文件

## 排查完后

- 确认 bug 后修复
- 删除 console.log 代码
