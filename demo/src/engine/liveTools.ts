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
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`
      const geoRes = await fetch(geoUrl)
      if (!geoRes.ok) throw new Error(`Geocoding HTTP ${geoRes.status}`)
      const geoData = await geoRes.json()
      if (!geoData.results?.length) throw new Error(`未找到城市: ${city}`)
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
// Tool: search_web
// ============================================================
const MOCK_SEARCH_RESULTS: Record<string, Array<{ title: string; snippet: string; url: string }>> = {
  default: [
    {
      title: '搜索结果 1',
      snippet: '这是关于该主题的详细介绍，包含最新的信息和分析...',
      url: 'https://example.com/result-1',
    },
    {
      title: '搜索结果 2',
      snippet: '相关百科条目，涵盖历史背景、核心概念和发展趋势...',
      url: 'https://example.com/result-2',
    },
    {
      title: '搜索结果 3',
      snippet: '最新的新闻报道和社区讨论，提供多角度的观点...',
      url: 'https://example.com/result-3',
    },
  ],
}

const searchWeb: LiveToolDef = {
  name: 'search_web',
  description: '搜索互联网获取相关信息，返回相关的网页摘要列表',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词或问题',
      },
      num_results: {
        type: 'number',
        description: '需要的搜索结果数量，默认 3',
      },
    },
    required: ['query'],
  },
  execute: async (args) => {
    await delay()
    const query = String(args.query ?? '')
    const num = Math.min(Number(args.num_results ?? 3), 5)
    const results = (MOCK_SEARCH_RESULTS[query] ?? MOCK_SEARCH_RESULTS.default)
      .slice(0, num)
      .map((r, i) => ({
        ...r,
        title: `${r.title} (关于"${query}")`,
        relevance: Math.round((1 - i * 0.15) * 100) / 100,
      }))
    return JSON.stringify({ query, results, searched_at: now() })
  },
}

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
// Registry
// ============================================================
export const liveTools: LiveToolDef[] = [
  getWeather,
  searchWeb,
  calculate,
  getTime,
  searchFlight,
  searchHotel,
]

/** Look up a tool by name */
export function getLiveTool(name: string): LiveToolDef | undefined {
  return liveTools.find((t) => t.name === name)
}
