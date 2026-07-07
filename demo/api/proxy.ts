// ============================================================
// Vercel Serverless Function — API proxy for LLM calls
// Forwards requests to any OpenAI-compatible endpoint, routing
// by the `baseUrl` sent from the browser. Defaults to DeepSeek
// so a Vercel deployment with DEEPSEEK_API_KEY works out of the box.
// The API key is kept server-side: it is sent from the browser only
// to this first-party proxy, never to third parties.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'

const DEFAULT_BASE_URL = 'https://api.deepseek.com/chat/completions'

function normalizeOpenAI(url: string): string {
  let u = url.trim().replace(/\/+$/, '')
  if (!u.endsWith('/chat/completions')) u += '/chat/completions'
  return u
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  // Prefer the API Key sent from the browser (user's own config),
  // fall back to the Vercel environment variable.
  const bodyKey =
    typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : ''
  const apiKey = bodyKey || process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: '未配置 API Key：请在「⚙️ API 设置」中填写，或在 Vercel 配置 DEEPSEEK_API_KEY 环境变量',
    })
  }

  // Route by baseUrl. Default to DeepSeek when the client didn't send one
  // (keeps the no-config Vercel path alive via the DEEPSEEK_API_KEY env var).
  const incomingBaseUrl =
    typeof req.body?.baseUrl === 'string' && req.body.baseUrl.trim()
      ? req.body.baseUrl.trim()
      : ''
  const target = incomingBaseUrl ? normalizeOpenAI(incomingBaseUrl) : DEFAULT_BASE_URL

  // Respect the client's model choice; fall back to a working DeepSeek model
  // only when nothing was provided.
  const model =
    typeof req.body?.model === 'string' && req.body.model.trim()
      ? req.body.model.trim()
      : 'deepseek-v4-flash'

  // Anthropic/Claude uses a different request + response schema and cannot be
  // forwarded as a plain OpenAI-compatible proxy. Return a clear message
  // instead of a confusing upstream auth error.
  if (target.includes('anthropic.com')) {
    return res.status(400).json({
      error:
        'Claude / Anthropic 使用与 OpenAI 不同的请求格式，当前代理仅转发 OpenAI 兼容接口' +
        '（OpenAI、DeepSeek、通义千问、Kimi、Gemini 等）。如需 Claude 支持请告知，我会加一层格式转换。',
    })
  }

  try {
    // Forward the original body, override model, strip the routing fields.
    const body = { ...req.body, model }
    delete (body as Record<string, unknown>).apiKey
    delete (body as Record<string, unknown>).baseUrl

    // Forward to the chosen upstream.
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    // Error handling
    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      // Return the full raw error so the frontend can display it
      return res.status(response.status).json({
        error: `上游 ${response.status} | ${errBody || response.statusText}`,
        detail: errBody,
      })
    }

    // Stream the SSE response back to the client
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const reader = response.body?.getReader()
    if (!reader) {
      return res.status(500).json({ error: 'Response body is not readable' })
    }

    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(decoder.decode(value))
    }
    res.end()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown proxy error'
    res.status(500).json({ error: message })
  }
}
