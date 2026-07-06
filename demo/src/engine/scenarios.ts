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
// Scenario 4: Agent Stuck Recovery — safety nets in action
// ============================================================
export const stuckAgentScenario: Scenario = {
  id: 'stuck-agent',
  name: '🔄 Agent 空转恢复',
  description: 'Agent 陷入思考空转，安全网自动触发并强制纠正，展示 Zombie/Fake/Hallucination 三种保护机制',
  messages: [
    {
      id: 'msg-s1',
      role: 'user',
      content: '帮我创建一个待办清单网页，包含标题和 3 个待办项。',
      timestamp: '10:15:00',
    },
    {
      id: 'msg-s2',
      role: 'agent',
      content: '好的，我成功创建了待办清单网页！首先规划了任务，中间虽然遇到了几次空转和安全网纠正，但最终还是完成了创建。已生成 index.html 文件，包含标题和 3 个待办项，使用 CSS 样式美化。',
      timestamp: '10:16:30',
    },
  ],
  steps: [
    // ============================================================
    // Phase 1: Normal — Agent plans and executes normally
    // ============================================================
    {
      id: 'stuck-01',
      type: 'thought',
      content: '用户要我创建一个待办清单网页。我需要先规划任务，然后创建文件。先用 set_todos 设定任务列表。',
      timestamp: '10:15:02',
    },
    {
      id: 'stuck-02',
      type: 'tool_call',
      content: '调用 set_todos 设定任务规划',
      timestamp: '10:15:04',
      toolCall: {
        id: 'stuck-tc-1',
        name: 'set_todos',
        input: JSON.stringify({
          tasks: [
            { name: '创建 HTML 结构', status: 'pending' },
            { name: '添加 CSS 样式', status: 'pending' },
            { name: '添加 JavaScript 交互', status: 'pending' },
          ],
        }),
        output: JSON.stringify({ success: true, task_count: 3 }),
        status: 'success',
        description: 'set_todos(3 个任务)',
      },
    },
    {
      id: 'stuck-03',
      type: 'thought',
      content: '任务已规划好，接下来我需要开始实现。先创建 HTML 文件。让我想想具体的设计...',
      timestamp: '10:15:06',
    },
    // ============================================================
    // Phase 2: Idle loop — Agent thinks but doesn't call tools
    // ============================================================
    {
      id: 'stuck-04',
      type: 'thought',
      content: '这个待办清单应该用什么样的设计呢？苹果风格？Material Design？还是极简风？我觉得极简风比较适合，简洁明了。',
      timestamp: '10:15:09',
    },
    {
      id: 'stuck-05',
      type: 'thought',
      content: '待办项应该包括：买 groceries、完成项目报告、给妈妈打电话。还需要一个添加新待办的功能。嗯，还可以加上拖拽排序...',
      timestamp: '10:15:12',
    },
    {
      id: 'stuck-06',
      type: 'thought',
      content: '要不要用 localStorage 做持久化？用 CSS Grid 还是 Flexbox？颜色主题用蓝色还是绿色？这些选择都很重要...',
      timestamp: '10:15:15',
    },
    {
      id: 'stuck-07',
      type: 'thought',
      content: '其实我只需要先写出基础版本，后面可以迭代优化。但还是不知道从哪里开始比较好。要不我再想想设计...',
      timestamp: '10:15:18',
    },
    // ============================================================
    // Phase 3: 🛑 Zombie Detection — SYSTEM OVERRIDE
    // idle_loop_count > 3 → force tool call
    // ============================================================
    {
      id: 'stuck-08',
      type: 'tool_call',
      content: '🛑 SYSTEM OVERRIDE — 强制中断空转循环',
      timestamp: '10:15:21',
      toolCall: {
        id: 'stuck-tc-2',
        name: '⚠️ Zombie Detection',
        input: JSON.stringify({ idle_loops: 4, action: 'system_override', force_tool: 'write_file' }),
        output: JSON.stringify({
          override: true,
          message: 'STOP THINKING. CALL A TOOL NOW.',
          forced_action: 'execute write_file immediately',
        }),
        status: 'success',
        description: '🛑 SYSTEM OVERRIDE: 空转检测触发，强制调工具',
      },
    },
    // ============================================================
    // Phase 4: Recovery — Agent writes a file
    // ============================================================
    {
      id: 'stuck-09',
      type: 'tool_call',
      content: '被强制中断空转后开始写文件',
      timestamp: '10:15:24',
      toolCall: {
        id: 'stuck-tc-3',
        name: 'write_file',
        input: JSON.stringify({
          path: 'index.html',
          content: '<!DOCTYPE html><html><head><title>待办清单</title><link rel="stylesheet" href="style.css"></head><body><div id="app"><h1>我的待办</h1><ul id="todo-list"><li>买 groceries</li><li>完成项目报告</li><li>给妈妈打电话</li></ul></div><script src="app.js"></script></body></html>',
        }),
        output: JSON.stringify({ success: true, path: 'index.html', size: 287 }),
        status: 'success',
        description: 'write_file("index.html") — 页面创建成功',
      },
    },
    // ============================================================
    // Phase 5: 🚫 Fake Completion — said "done" but no task_done
    // ============================================================
    {
      id: 'stuck-10',
      type: 'tool_call',
      content: '🚫 Fake Completion 检测 — Agent 声称完成但未调 task_done',
      timestamp: '10:15:26',
      toolCall: {
        id: 'stuck-tc-4',
        name: '⚠️ Fake Completion',
        input: JSON.stringify({
          detection: 'agent_text_contains_done_without_task_done',
          agent_statement: '完成了！待办清单已经创建好了。',
          action: 'force_task_done_required',
        }),
        output: JSON.stringify({
          warning: '检测到虚假完成声明',
          required_action: '必须先调用 task_done 确认任务完成',
        }),
        status: 'success',
        description: '🚫 Fake Completion: 文本说完成了但没调 task_done，强制纠正',
      },
    },
    // ============================================================
    // Phase 6: 🚫 Hallucination Guard — task_done without write_file
    // ============================================================
    {
      id: 'stuck-11',
      type: 'tool_call',
      content: '🚫 Hallucination Guard 触发 — task_done 被 blocked',
      timestamp: '10:15:29',
      toolCall: {
        id: 'stuck-tc-5',
        name: '🚫 Hallucination Guard',
        input: JSON.stringify({
          detection: 'task_done_called_without_files',
          created_files: [],
          required_files: ['index.html', 'style.css'],
        }),
        output: null,
        status: 'error',
        error: 'CRITICAL ERROR: 任务未完成。set_todos 中声明的必需文件尚未创建。请先创建文件再调用 task_done。',
        description: '🚫 Hallucination Guard: task_done 时文件没写全，blocked',
      },
    },
    // ============================================================
    // Phase 7: Normal — proper write_file + task_done
    // ============================================================
    {
      id: 'stuck-12',
      type: 'tool_call',
      content: '写入样式文件完成剩余文件',
      timestamp: '10:15:32',
      toolCall: {
        id: 'stuck-tc-6',
        name: 'write_file',
        input: JSON.stringify({
          path: 'style.css',
          content: 'body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; } h1 { color: #333; } li { padding: 8px; margin: 4px 0; background: #f5f5f5; border-radius: 4px; }',
        }),
        output: JSON.stringify({ success: true, path: 'style.css', size: 198 }),
        status: 'success',
        description: 'write_file("style.css") — 样式文件创建成功',
      },
    },
    {
      id: 'stuck-13',
      type: 'tool_call',
      content: '调用 task_done 确认任务完成',
      timestamp: '10:15:34',
      toolCall: {
        id: 'stuck-tc-7',
        name: 'task_done',
        input: JSON.stringify({
          summary: '已创建待办清单网页',
          files_created: ['index.html', 'style.css'],
          tasks_completed: 2,
        }),
        output: JSON.stringify({ success: true, message: '任务已标记为完成' }),
        status: 'success',
        description: 'task_done — 确认任务完成',
      },
    },
    {
      id: 'stuck-14',
      type: 'response',
      content: '好的，我成功创建了待办清单网页！首先规划了任务，中间虽然遇到了几次空转和安全网纠正，但最终还是完成了创建。已生成 index.html 文件，包含标题和 3 个待办项，使用 CSS 样式美化。',
      timestamp: '10:16:30',
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
  stuckAgentScenario,
]

export function getScenarioById(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id)
}
