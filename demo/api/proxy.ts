// ============================================================
// Vercel Serverless Function — API proxy for LLM calls
// Forwards requests to DeepSeek API, keeping the key server-side.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'

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
    return res
      .status(500)
      .json({ error: '未配置 API Key：请在「⚙️ API 设置」中填写，或在 Vercel 配置 DEEPSEEK_API_KEY 环境变量' })
  }

  // Model: respect the frontend's choice unless it's the openai default
  // (gpt-4o) left untouched — then fall back to a working DeepSeek model.
  const frontendModel = typeof req.body?.model === 'string' ? req.body.model.trim() : ''
  const model =
    frontendModel && frontendModel !== 'gpt-4o'
      ? frontendModel
      : bodyKey
        ? 'deepseek-chat'
        : 'deepseek-v4-flash'

  try {
    // Forward body to DeepSeek, override model, strip the raw key.
    const body = { ...req.body, model }
    delete (body as Record<string, unknown>).apiKey

    // Forward to DeepSeek API
    const response = await fetch('https://api.deepseek.com/chat/completions', {
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
        error: `DeepSeek ${response.status} | ${errBody || response.statusText}`,
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
