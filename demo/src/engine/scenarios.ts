// ============================================================
// 3 preset scenarios with complete AgentStep[] data
// ============================================================

import type { Scenario } from './types'

// ============================================================
// Scenario 1: Weather Q&A — simplest flow, 1 tool call
// ============================================================
export const weatherScenario: Scenario = {
  id: 'weather',
  name: '🌤️ 天气问答',
  description: '最简单的流程：1 次 tool call，查询天气后直接回答',
  messages: [
    {
      id: 'msg-1',
      role: 'user',
      content: '北京今天天气怎么样？',
      timestamp: '10:00:01',
    },
    {
      id: 'msg-2',
      role: 'agent',
      content:
        '北京今天晴朗，气温 25°C，湿度 55%，风速 12 km/h。非常适合户外活动！',
      timestamp: '10:00:05',
    },
  ],
  steps: [
    {
      id: 'step-1',
      type: 'thought',
      content: '用户想查询北京的天气，我需要调用 get_weather 工具来获取数据。',
      timestamp: '10:00:02',
    },
    {
      id: 'step-2',
      type: 'tool_call',
      content: '调用 get_weather 获取北京天气',
      timestamp: '10:00:03',
      toolCall: {
        id: 'tc-1',
        name: 'get_weather',
        input: JSON.stringify({ city: '北京' }),
        output: JSON.stringify({
          city: '北京',
          temperature_c: 25,
          condition: '晴朗',
          humidity: 55,
          wind_kmh: 12,
        }),
        status: 'success',
        description: 'get_weather("北京")',
      },
    },
    {
      id: 'step-3',
      type: 'response',
      content:
        '北京今天晴朗，气温 25°C，湿度 55%，风速 12 km/h。非常适合户外活动！',
      timestamp: '10:00:05',
    },
  ],
}

// ============================================================
// Scenario 2: Travel Planning — 3 tool calls chained
// ============================================================
export const travelScenario: Scenario = {
  id: 'travel',
  name: '✈️ 旅行规划',
  description: '3 次 tool call 串联：查天气 → 搜酒店 → 搜航班，展示多工具编排',
  messages: [
    {
      id: 'msg-1',
      role: 'user',
      content: '我下周五想去东京玩三天，帮我规划一下。',
      timestamp: '10:05:00',
    },
    {
      id: 'msg-2',
      role: 'agent',
      content:
        '好的，我已经帮你查询了东京的天气、酒店和从上海的航班。东京下周五多云，气温 22°C。推荐东京 Grand Hotel（4.5⭐/¥280晚）、东京 Boutique Inn（4.2⭐/¥180晚）、东京 Budget Stay（3.8⭐/¥90晚）。航班方面，JetStream 的 JS107 直飞仅 ¥200。需要帮你预订吗？',
      timestamp: '10:05:15',
    },
  ],
  steps: [
    {
      id: 'step-1',
      type: 'thought',
      content: '用户想去东京旅行，我需要：1) 查天气了解当地情况，2) 搜酒店找住宿，3) 搜航班看交通。先查天气。',
      timestamp: '10:05:02',
    },
    {
      id: 'step-2',
      type: 'tool_call',
      content: '调用 get_weather 获取东京天气',
      timestamp: '10:05:04',
      toolCall: {
        id: 'tc-1',
        name: 'get_weather',
        input: JSON.stringify({ city: '东京' }),
        output: JSON.stringify({
          city: '东京',
          temperature_c: 22,
          condition: '多云',
          humidity: 62,
          wind_kmh: 8,
        }),
        status: 'success',
        description: 'get_weather("东京")',
      },
    },
    {
      id: 'step-3',
      type: 'thought',
      content: '天气多云 22°C，适合出行。接下来搜索东京的酒店，下周五入住，住三天。',
      timestamp: '10:05:07',
    },
    {
      id: 'step-4',
      type: 'tool_call',
      content: '调用 search_hotel 搜索东京酒店',
      timestamp: '10:05:09',
      toolCall: {
        id: 'tc-2',
        name: 'search_hotel',
        input: JSON.stringify({
          city: '东京',
          check_in: '2026-07-10',
          check_out: '2026-07-13',
          guests: 1,
        }),
        output: JSON.stringify({
          city: '东京',
          hotels: [
            { name: '东京 Grand Hotel', rating: 4.5, price_per_night: 280, available: true },
            { name: '东京 Boutique Inn', rating: 4.2, price_per_night: 180, available: true },
            { name: '东京 Budget Stay', rating: 3.8, price_per_night: 90, available: true },
          ],
        }),
        status: 'success',
        description: 'search_hotel("东京", ...)',
      },
    },
    {
      id: 'step-5',
      type: 'thought',
      content: '有 3 家酒店可选。最后搜索从上海到东京的航班，日期为下周五。',
      timestamp: '10:05:11',
    },
    {
      id: 'step-6',
      type: 'tool_call',
      content: '调用 search_flight 搜索航班',
      timestamp: '10:05:13',
      toolCall: {
        id: 'tc-3',
        name: 'search_flight',
        input: JSON.stringify({
          from: '上海',
          to: '东京',
          date: '2026-07-10',
        }),
        output: JSON.stringify({
          from: '上海',
          to: '东京',
          flights: [
            { airline: 'SkyHigh', flight_number: 'SH100', departure: '上海 08:00', arrival: '东京 10:30', price: 200, stops: 0 },
            { airline: 'CloudNine', flight_number: 'CN107', departure: '上海 08:15', arrival: '东京 11:00', price: 285, stops: 0 },
            { airline: 'JetStream', flight_number: 'JS107', departure: '上海 11:00', arrival: '东京 13:20', price: 200, stops: 1 },
          ],
        }),
        status: 'success',
        description: 'search_flight("上海", "东京", ...)',
      },
    },
    {
      id: 'step-7',
      type: 'response',
      content:
        '好的，我已经帮你查询了东京的天气、酒店和从上海的航班。东京下周五多云，气温 22°C。推荐东京 Grand Hotel（4.5⭐/¥280晚）、东京 Boutique Inn（4.2⭐/¥180晚）、东京 Budget Stay（3.8⭐/¥90晚）。航班方面，JetStream 的 JS107 直飞仅 ¥200。需要帮你预订吗？',
      timestamp: '10:05:15',
    },
  ],
}

// ============================================================
// Scenario 3: Error Recovery — 1st call fails → retry → success
// ============================================================
export const errorRecoveryScenario: Scenario = {
  id: 'error-recovery',
  name: '🔄 错误恢复',
  description: '第 1 次 tool call 失败 → Agent 分析错误 → 重试 → 成功，展示鲁棒性',
  messages: [
    {
      id: 'msg-1',
      role: 'user',
      content: '帮我查一下上海虹桥到深圳宝安的航班，7月10号的。',
      timestamp: '10:10:00',
    },
    {
      id: 'msg-2',
      role: 'agent',
      content:
        '抱歉，第一次查询时参数格式有误导致失败。我已经修正了参数，成功查到了 3 个航班：SkyHigh SH100（¥200，直飞）、CloudNine CN107（¥285，直飞）、JetStream JS107（¥200，1 站经停）。推荐 SH100，性价比最高。',
      timestamp: '10:10:20',
    },
  ],
  steps: [
    {
      id: 'step-1',
      type: 'thought',
      content: '用户要查航班，我解析一下：出发=上海虹桥，到达=深圳宝安，日期=7月10号。调用 search_flight。',
      timestamp: '10:10:02',
    },
    {
      id: 'step-2',
      type: 'tool_call',
      content: '调用 search_flight — 参数格式错误',
      timestamp: '10:10:05',
      toolCall: {
        id: 'tc-1',
        name: 'search_flight',
        input: JSON.stringify({
          from: '上海虹桥',
          to: '深圳宝安',
          date: '7月10号', // wrong format!
        }),
        output: null,
        status: 'error',
        error: 'Invalid date format: expected YYYY-MM-DD, got "7月10号"',
        description: 'search_flight(日期格式错误)',
      },
    },
    {
      id: 'step-3',
      type: 'thought',
      content: '失败了！错误信息提示日期格式必须是 YYYY-MM-DD。"7月10号" 应转换为 "2026-07-10"。我需要修正参数后重试。',
      timestamp: '10:10:10',
    },
    {
      id: 'step-4',
      type: 'tool_call',
      content: '重试 search_flight — 参数已修正',
      timestamp: '10:10:15',
      toolCall: {
        id: 'tc-2',
        name: 'search_flight',
        input: JSON.stringify({
          from: '上海',
          to: '深圳',
          date: '2026-07-10',
        }),
        output: JSON.stringify({
          from: '上海',
          to: '深圳',
          flights: [
            {
              airline: 'SkyHigh',
              flight_number: 'SH100',
              departure: '上海 08:00',
              arrival: '深圳 10:30',
              price: 200,
              stops: 0,
            },
            {
              airline: 'CloudNine',
              flight_number: 'CN107',
              departure: '上海 08:15',
              arrival: '深圳 11:00',
              price: 285,
              stops: 0,
            },
            {
              airline: 'JetStream',
              flight_number: 'JS107',
              departure: '上海 11:00',
              arrival: '深圳 13:20',
              price: 200,
              stops: 1,
            },
          ],
        }),
        status: 'success',
        description: 'search_flight("上海", "深圳", "2026-07-10")',
      },
    },
    {
      id: 'step-5',
      type: 'response',
      content:
        '抱歉，第一次查询时参数格式有误导致失败。我已经修正了参数，成功查到了 3 个航班：SkyHigh SH100（¥200，直飞）、CloudNine CN107（¥285，直飞）、JetStream JS107（¥200，1 站经停）。推荐 SH100，性价比最高。',
      timestamp: '10:10:20',
    },
  ],
}

// ============================================================
// All scenarios registry
// ============================================================
export const scenarios: Scenario[] = [
  weatherScenario,
  travelScenario,
  errorRecoveryScenario,
]

export function getScenarioById(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id)
}
