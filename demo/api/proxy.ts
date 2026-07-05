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

  // Read API Key from environment variable (set in Vercel Dashboard)
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'DEEPSEEK_API_KEY 环境变量未配置' })
  }

  try {
    // Override model to DeepSeek's model name, ignore what frontend sends
    const body = { ...req.body, model: 'deepseek-v4-flash' }

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
      return res.status(response.status).json({
        error: `DeepSeek API ${response.status}: ${errBody || response.statusText}`,
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
