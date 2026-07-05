// ============================================================
// ApiSettings — collapsible API configuration panel
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import type { ApiConfig } from '@/engine/types'
import { defaultApiConfig } from '@/engine/types'

const LS_KEY = 'agent-demo-api-config'
const PROVIDER_PRESETS: Record<ApiConfig['provider'], { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
  custom: { baseUrl: '', model: '' },
}

interface ApiSettingsProps {
  config: ApiConfig
  onChange: (config: ApiConfig) => void
  isOpen: boolean
  onToggle: () => void
}

export default function ApiSettings({ config, onChange, isOpen, onToggle }: ApiSettingsProps) {
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [showKey, setShowKey] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ApiConfig>
        onChange({ ...defaultApiConfig(), ...parsed })
      }
    } catch {
      // Ignore parse errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveToStorage = useCallback(
    (cfg: ApiConfig) => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(cfg))
      } catch {
        // Storage full or unavailable
      }
    },
    [],
  )

  const update = useCallback(
    (partial: Partial<ApiConfig>) => {
      const next = { ...config, ...partial }
      onChange(next)
    },
    [config, onChange],
  )

  const handleProviderChange = useCallback(
    (provider: ApiConfig['provider']) => {
      const preset = PROVIDER_PRESETS[provider]
      const next = { ...config, provider, baseUrl: preset.baseUrl, model: preset.model }
      onChange(next)
    },
    [config, onChange],
  )

  const handleSave = useCallback(() => {
    saveToStorage(config)
    setTestStatus('success')
    setTestMessage('配置已保存到本地')
    setTimeout(() => setTestStatus('idle'), 2000)
  }, [config, saveToStorage])

  const handleTest = useCallback(async () => {
    if (!config.apiKey) {
      setTestStatus('error')
      setTestMessage('请先填写 API Key')
      return
    }

    setTestStatus('testing')
    setTestMessage('正在测试连接...')

    try {
      let url = config.baseUrl.replace(/\/+$/, '')
      if (!url.endsWith('/chat/completions')) {
        url += '/chat/completions'
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
          stream: false,
        }),
      })

      if (res.ok) {
        setTestStatus('success')
        setTestMessage('连接成功！API 正常工作')
      } else {
        const errText = await res.text().catch(() => '')
        let errMsg = `HTTP ${res.status}: ${res.statusText}`
        try {
          const errJson = JSON.parse(errText)
          if (errJson.error?.message) errMsg = errJson.error.message
        } catch { /* ignore */ }
        setTestStatus('error')
        setTestMessage(errMsg)
      }
    } catch (err) {
      setTestStatus('error')
      setTestMessage(err instanceof Error ? err.message : '网络错误')
    }
  }, [config])

  if (!isOpen) return null

  return (
    <div className="border-b border-slate-700/50 bg-slate-900/95 backdrop-blur-sm px-4 py-3">
      <div className="max-w-2xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">⚙️ API 设置</h3>
          <button
            type="button"
            onClick={onToggle}
            className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
          >
            ✕ 收起
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Provider */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Provider
            </label>
            <select
              value={config.provider}
              onChange={(e) => handleProviderChange(e.target.value as ApiConfig['provider'])}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {/* Model */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Model
            </label>
            <input
              type="text"
              value={config.model}
              onChange={(e) => update({ model: e.target.value })}
              placeholder="gpt-4o"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {/* Base URL */}
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Base URL
            </label>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {/* API Key */}
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              API Key
            </label>
            <div className="flex items-center gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) => update({ apiKey: e.target.value })}
                placeholder="sk-..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-400 transition-colors flex-shrink-0"
                title={showKey ? '隐藏' : '显示'}
              >
                {showKey ? '🙈' : '👁'}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Key 仅保存在浏览器 localStorage，不会发送给任何第三方
            </p>
          </div>

          {/* Max Turns */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Max Turns
            </label>
            <input
              type="number"
              value={config.maxTurns}
              onChange={(e) => update({ maxTurns: Math.max(1, Math.min(50, Number(e.target.value) || 10)) })}
              min={1}
              max={50}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {/* System Prompt */}
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              System Prompt
            </label>
            <textarea
              value={config.systemPrompt}
              onChange={(e) => update({ systemPrompt: e.target.value })}
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            💾 保存到本地
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testStatus === 'testing'}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors disabled:opacity-50"
          >
            {testStatus === 'testing' ? '⏳ 测试中...' : '🔌 测试连接'}
          </button>
          {testStatus !== 'idle' && (
            <span
              className={`text-xs ${
                testStatus === 'success'
                  ? 'text-emerald-400'
                  : testStatus === 'error'
                    ? 'text-red-400'
                    : 'text-slate-400'
              }`}
            >
              {testMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
