// ============================================================
// Live Tools — mock tools registered for LLM function calling
// ============================================================

import type { LiveToolDef } from './types'

// ---- helpers ----

/** Simulate async delay (80-300ms) for realism */
function delay(): Promise<void> {
  const ms = 80 + Math.random() * 220
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function now(): string {
  return new Date().toISOString()
}

/** WMO weather code → 中文描述 */
function weatherCodeToChinese(code: number): string {
  if (code === 0) return '晴天'
  if (code <= 3) return ['晴间多云', '多云', '阴天'][code - 1]
  if (code <= 48) return '雾'
  if (code <= 55) return '小雨'
  if (code <= 65) return '雨'
  if (code <= 75) return '雪'
  if (code <= 82) return '阵雨'
  if (code <= 86) return '阵雪'
  if (code <= 99) return '雷暴'
  return '未知'
}

// ============================================================
// Tool: get_weather
// ============================================================
const getWeather: LiveToolDef = {
  name: 'get_weather',
  description: '获取指定城市的当前天气信息，包括温度、天气状况、湿度和风速',
  parameters: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: '城市名称，例如 "北京"、"上海"、"Tokyo"',
      },
    },
    required: ['city'],
  },
  execute: async (args) => {
    const city = String(args.city ?? '未知城市')

    try {
      // Step 1: 地理编码 — 城市名 → 经纬度
      // 先用中文语言查，失败后用无语言参数重试
      let geoData
      for (const lang of ['zh', '']) {
        const langParam = lang ? `&language=${lang}` : ''
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1${langParam}`
        const geoRes = await fetch(geoUrl)
        if (geoRes.ok) {
          geoData = await geoRes.json()
          if (geoData.results?.length) break
        }
      }
      if (!geoData?.results?.length) throw new Error(`未找到城市: ${city}`)
      const { latitude, longitude, name, country } = geoData.results[0]

      // Step 2: 用经纬度查实时天气
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`
      const weatherRes = await fetch(weatherUrl)
      if (!weatherRes.ok) throw new Error(`Weather HTTP ${weatherRes.status}`)
      const weatherData = await weatherRes.json()
      const current = weatherData.current

      const temperature = current.temperature_2m != null ? `${Math.round(current.temperature_2m)}°C` : '未知'
      const condition = weatherCodeToChinese(current.weather_code)
      const humidity = current.relative_humidity_2m != null ? `${current.relative_humidity_2m}%` : '未知'
      const wind = current.wind_speed_10m != null ? `${current.wind_speed_10m} km/h` : '未知'

      return JSON.stringify({
        city: `${name}${country ? `, ${country}` : ''}`,
        temperature,
        condition,
        humidity,
        wind,
        updated_at: now(),
        source: 'Open-Meteo',
      })
    } catch {
      // API 失败时回退到 mock 数据，不崩溃
      const conditions = ['晴天', '多云', '阴天', '小雨', '阵雨', '晴间多云', '大风']
      const temp = randInt(8, 36)
      const humidity = randInt(30, 90)
      const wind = randInt(2, 30)
      const condition = pick(conditions)
      return JSON.stringify({
        city,
        temperature_c: temp,
        condition,
        humidity,
        wind_kmh: wind,
        updated_at: now(),
        source: 'mock (Open-Meteo 不可用)',
      })
    }
  },
}

// ============================================================
// ============================================================
// Tool: calculate
// ============================================================
const calculate: LiveToolDef = {
  name: 'calculate',
  description: '执行数学计算，支持加减乘除、乘方、括号等基本运算',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: '数学表达式，例如 "2 + 3 * 4"、"sqrt(16)"、"2 ** 10"',
      },
    },
    required: ['expression'],
  },
  execute: async (args) => {
    await delay()
    const expr = String(args.expression ?? '')
    // Safe eval: only allow numbers, operators, parens, whitespace, and Math functions
    const safe = /^[\d\s+\-*/().,%^!<>=&|?:a-zA-Z_]+$/
    if (!safe.test(expr)) {
      return JSON.stringify({ error: '表达式包含不安全的字符', expression: expr })
    }
    try {
      // Prepend Math. to common functions
      const mapped = expr
        .replace(/\bsqrt\(/g, 'Math.sqrt(')
        .replace(/\babs\(/g, 'Math.abs(')
        .replace(/\bpow\(/g, 'Math.pow(')
        .replace(/\bround\(/g, 'Math.round(')
        .replace(/\bceil\(/g, 'Math.ceil(')
        .replace(/\bfloor\(/g, 'Math.floor(')
        .replace(/\bPI\b/g, 'Math.PI')
        .replace(/\bE\b/g, 'Math.E')
        .replace(/\bmax\(/g, 'Math.max(')
        .replace(/\bmin\(/g, 'Math.min(')
      const result = Function(`"use strict"; return (${mapped})`)()
      return JSON.stringify({ expression: expr, result })
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : '计算错误',
        expression: expr,
      })
    }
  },
}

// ============================================================
// Tool: get_time
// ============================================================
const getTime: LiveToolDef = {
  name: 'get_time',
  description: '获取当前日期和时间，支持指定时区',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: '时区，例如 "Asia/Shanghai"、"America/New_York"、"UTC"。默认本地时区',
      },
    },
  },
  execute: async (args) => {
    await delay()
    const tz = String(args.timezone ?? 'local')
    const now = new Date()
    let timeStr: string
    try {
      timeStr = now.toLocaleString('zh-CN', {
        timeZone: tz === 'local' ? undefined : tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'long',
      })
    } catch {
      timeStr = now.toLocaleString('zh-CN')
    }
    return JSON.stringify({
      iso: now.toISOString(),
      formatted: timeStr,
      timezone: tz,
      timestamp_ms: now.getTime(),
    })
  },
}

// ============================================================
// Tool: search_flight
// ============================================================
const AIRLINES = ['中国国航', '南方航空', '东方航空', '海南航空', '春秋航空']
const AIRLINE_CODES = ['CA', 'CZ', 'MU', 'HU', '9C']

const searchFlight: LiveToolDef = {
  name: 'search_flight',
  description: '搜索两个城市之间的航班信息，包括航空公司、航班号、出发/到达时间、价格和经停信息',
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string', description: '出发城市' },
      to: { type: 'string', description: '到达城市' },
      date: { type: 'string', description: '出发日期，格式 YYYY-MM-DD' },
    },
    required: ['from', 'to', 'date'],
  },
  execute: async (args) => {
    await delay()
    const from = String(args.from ?? '未知')
    const to = String(args.to ?? '未知')
    const date = String(args.date ?? '')

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return JSON.stringify({ error: `日期格式无效：${date}，需要 YYYY-MM-DD 格式` })
    }

    const flights = Array.from({ length: 3 }, (_, i) => {
      const idx = randInt(0, AIRLINES.length - 1)
      const hour = 6 + i * 3 + randInt(0, 2)
      const min = randInt(0, 5) * 10
      const duration = 120 + randInt(0, 180)
      const arrHour = hour + Math.floor((min + duration) / 60)
      const arrMin = (min + duration) % 60
      return {
        airline: AIRLINES[idx],
        flight_number: `${AIRLINE_CODES[idx]}${randInt(1000, 9999)}`,
        departure: `${from} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
        arrival: `${to} ${String(arrHour).padStart(2, '0')}:${String(arrMin).padStart(2, '0')}`,
        duration_min: duration,
        price_cny: randInt(300, 2500),
        stops: i === 2 ? 1 : 0,
        date,
      }
    })

    return JSON.stringify({ from, to, date, flights })
  },
}

// ============================================================
// Tool: search_hotel
// ============================================================
const HOTEL_PREFIXES = ['国际', '花园', '商务', '精品', '假日', '滨海', '山水']

const searchHotel: LiveToolDef = {
  name: 'search_hotel',
  description: '搜索指定城市的酒店信息，返回酒店名称、评分、价格和可用性',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名称' },
      check_in: { type: 'string', description: '入住日期，格式 YYYY-MM-DD' },
      check_out: { type: 'string', description: '离店日期，格式 YYYY-MM-DD' },
      guests: { type: 'number', description: '入住人数' },
    },
    required: ['city'],
  },
  execute: async (args) => {
    await delay()
    const city = String(args.city ?? '未知城市')
    const checkIn = String(args.check_in ?? '未指定')
    const checkOut = String(args.check_out ?? '未指定')
    const guests = Number(args.guests ?? 1)

    const hotels = [
      {
        name: `${city}${pick(HOTEL_PREFIXES)}大酒店`,
        rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
        price_per_night: randInt(200, 800),
        available: Math.random() > 0.1,
        amenities: pick([['WiFi', '游泳池', '健身房'], ['WiFi', '早餐', '停车场'], ['WiFi', 'SPA', '商务中心']]),
      },
      {
        name: `${city}${pick(HOTEL_PREFIXES)}精品酒店`,
        rating: Math.round((3.0 + Math.random() * 2) * 10) / 10,
        price_per_night: randInt(120, 400),
        available: Math.random() > 0.15,
        amenities: pick([['WiFi', '早餐'], ['WiFi', '停车场'], ['WiFi', '洗衣']]),
      },
      {
        name: `${city}${pick(HOTEL_PREFIXES)}快捷酒店`,
        rating: Math.round((2.5 + Math.random() * 1.5) * 10) / 10,
        price_per_night: randInt(80, 200),
        available: Math.random() > 0.05,
        amenities: ['WiFi'],
      },
    ]

    return JSON.stringify({ city, check_in: checkIn, check_out: checkOut, guests, hotels })
  },
}

// ============================================================
// Tool: wikipedia_search
// ============================================================
const wikipediaSearch: LiveToolDef = {
  name: 'wikipedia_search',
  description: '搜索 Wikipedia 百科，查询概念、人物、事件等的详细解释',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '要搜索的查询词，例如 "Transformer (machine learning)"、"Python"',
      },
    },
    required: ['query'],
  },
  execute: async (args) => {
    const query = String(args.query ?? '').trim()
    if (!query) return JSON.stringify({ error: '查询词不能为空' })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) {
        if (res.status === 404) return JSON.stringify({ error: `在 Wikipedia 上未找到 "${query}" 的相关条目` })
        throw new Error(`Wikipedia HTTP ${res.status}`)
      }
      const data = await res.json()
      return JSON.stringify({
        title: data.title,
        extract: data.extract,
        url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return JSON.stringify({ error: 'Wikipedia 查询超时' })
      }
      return JSON.stringify({ error: `Wikipedia 查询失败: ${err instanceof Error ? err.message : '未知错误'}` })
    } finally {
      clearTimeout(timeout)
    }
  },
}

// ============================================================
// Tool: get_exchange_rate
// ============================================================
const getExchangeRate: LiveToolDef = {
  name: 'get_exchange_rate',
  description: '查询实时汇率，支持任意两种货币之间的兑换率',
  parameters: {
    type: 'object',
    properties: {
      base: {
        type: 'string',
        description: '基础货币代码（3位大写），例如 "USD"、"EUR"、"CNY"、"JPY"',
      },
      target: {
        type: 'string',
        description: '目标货币代码（3位大写），例如 "CNY"、"USD"、"EUR"',
      },
    },
    required: ['base', 'target'],
  },
  execute: async (args) => {
    const base = String(args.base ?? '').toUpperCase().trim()
    const target = String(args.target ?? '').toUpperCase().trim()
    if (!base || !target) return JSON.stringify({ error: '货币代码不能为空' })
    if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(target)) {
      return JSON.stringify({ error: '货币代码格式错误，需要 3 位大写字母，例如 USD、EUR、CNY' })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    try {
      const url = `https://api.exchangerate-api.com/v4/latest/${base}`
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`汇率 API HTTP ${res.status}`)
      const data = await res.json()

      if (!data.rates || !data.rates[target]) {
        return JSON.stringify({ error: `不支持 ${base} 到 ${target} 的汇率查询` })
      }

      return JSON.stringify({
        base,
        target,
        rate: data.rates[target],
        date: data.date,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return JSON.stringify({ error: '汇率查询超时' })
      }
      return JSON.stringify({ error: `汇率查询失败: ${err instanceof Error ? err.message : '未知错误'}` })
    } finally {
      clearTimeout(timeout)
    }
  },
}

// ============================================================
// Tool: get_definition
// ============================================================
const getDefinition: LiveToolDef = {
  name: 'get_definition',
  description: '查询英文单词的定义、发音、词性和例句',
  parameters: {
    type: 'object',
    properties: {
      word: {
        type: 'string',
        description: '要查询的英文单词，例如 "ephemeral"、"serendipity"',
      },
    },
    required: ['word'],
  },
  execute: async (args) => {
    const word = String(args.word ?? '').trim().toLowerCase()
    if (!word) return JSON.stringify({ error: '单词不能为空' })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    try {
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) {
        if (res.status === 404) return JSON.stringify({ error: `未找到单词 "${word}" 的定义` })
        throw new Error(`词典 API HTTP ${res.status}`)
      }
      const data = await res.json()
      const entry = data[0]

      const meanings = entry.meanings?.map((m: { partOfSpeech: string; definitions: Array<{ definition: string; example?: string }> }) => ({
        partOfSpeech: m.partOfSpeech,
        definition: m.definitions?.[0]?.definition ?? '',
        example: m.definitions?.[0]?.example ?? null,
      })) ?? []

      return JSON.stringify({
        word: entry.word,
        phonetic: entry.phonetic ?? entry.phonetics?.[0]?.text ?? null,
        meanings,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return JSON.stringify({ error: '词典查询超时' })
      }
      return JSON.stringify({ error: `词典查询失败: ${err instanceof Error ? err.message : '未知错误'}` })
    } finally {
      clearTimeout(timeout)
    }
  },
}

// ============================================================
// Tool: get_joke
// ============================================================
const getJoke: LiveToolDef = {
  name: 'get_joke',
  description: '讲个笑话，可选分类参数。支持分类：programming、general、dad、pun、spooky、christmas',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: '笑话分类，可选：programming、general、dad、pun、spooky、christmas。默认 random',
      },
    },
  },
  execute: async (args) => {
    const category = String(args.category ?? '').trim().toLowerCase() || 'any'
    const allowed = ['programming', 'general', 'dad', 'pun', 'spooky', 'christmas', 'any']
    const cat = allowed.includes(category) ? category : 'Any'

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    try {
      const url = `https://v2.jokeapi.dev/joke/${cat === 'any' ? 'Any' : cat}?type=single&safe-mode=true`
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`笑话 API HTTP ${res.status}`)
      const data = await res.json()

      if (data.error) return JSON.stringify({ error: data.message ?? '获取笑话失败' })

      return JSON.stringify({
        joke: data.joke ?? `${data.setup}\n${data.delivery}`,
        category: data.category,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return JSON.stringify({ error: '获取笑话超时' })
      }
      return JSON.stringify({ error: `获取笑话失败: ${err instanceof Error ? err.message : '未知错误'}` })
    } finally {
      clearTimeout(timeout)
    }
  },
}

// ============================================================
// Registry
// ============================================================
export const liveTools: LiveToolDef[] = [
  getWeather,
  calculate,
  getTime,
  searchFlight,
  searchHotel,
  wikipediaSearch,
  getExchangeRate,
  getDefinition,
  getJoke,
]

/** Look up a tool by name */
export function getLiveTool(name: string): LiveToolDef | undefined {
  return liveTools.find((t) => t.name === name)
}
