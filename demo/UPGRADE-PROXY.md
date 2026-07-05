# 新增：Vercel Serverless Proxy 保护 API Key

## 目标

把 DeepSeek API Key 从浏览器移到 Vercel 环境变量，前端通过 proxy 调用 LLM，Key 不暴露到公网。

## 改动

### 1. 新增文件 `demo/api/proxy.ts`

Vercel Serverless Function，接收前端请求，转发到 DeepSeek API，流式返回：

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 只接受 POST
  if (req.method !== 'POST') return res.status(405).end()

  // 从环境变量读取 API Key（在 Vercel Dashboard 设置）
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API Key 未配置' })

  try {
    // 转发到 DeepSeek
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    })

    // 流式透传
    if (!response.ok) {
      const err = await response.text()
      return res.status(response.status).json({ error: err })
    }

    // 设置 SSE 头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // 透传 stream
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(decoder.decode(value))
    }
    res.end()
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Proxy Error' })
  }
}
```

### 2. 修改 `demo/vite.config.ts`

排除 api 目录，避免 Vite 把它当前端代码处理：

```typescript
// vite.config.ts 中加上
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',  // 本地开发时用
      changeOrigin: true,
    },
  },
},
```

### 3. 修改前端

free mode 和 comparison mode 中，调 LLM API 的 URL 从 `apiConfig.baseUrl + '/chat/completions'` 改为 `/api/proxy`。

前端不再需要读取 apiKey 字段（但仍保留 API 设置面板，供本地开发使用）。

### 4. Vercel 环境变量

部署后需要在 Vercel Dashboard 设置：

Settings → Environment Variables → `DEEPSEEK_API_KEY` = 你的 DeepSeek Key

### 本地开发

本地开发时，API 设置面板仍然可以直接填 Key 调 DeepSeek（和之前一样）。
部署到 Vercel 后才走 proxy 模式。
