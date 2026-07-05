# 升级：将 get_weather 改为真实 API 调用

## 目标

把 liveTools.ts 中的 get_weather 从 mock 数据改为调用真实天气 API。
使用 **wttr.in**（完全免费，不需要 API Key）。

## 改动范围

只修改 `demo/src/engine/liveTools.ts` 中的 `getWeather` 对象。

## 具体需求

```typescript
// 修改前：mock 随机数据
getWeather.execute = async (args) => {
  await delay()
  return JSON.stringify({
    city: args.city,
    temperature_c: 随机数,
    condition: 随机天气,
    humidity: 随机数,
    wind_kmh: 随机数,
    updated_at: now(),
  })
}

// 修改后：调用真实 API
getWeather.execute = async (args) => {
  const city = String(args.city ?? '')
  // 调用 wttr.in API（不需要 API Key）
  const url = `https://wttr.in/${encodeURIComponent(city)}?format=%C|%t|%h|%w`
  const res = await fetch(url)
  const text = await res.text()
  // 解析返回格式: "Sunny|+25°C|55%|12km/h"
  const parts = text.split('|')
  return JSON.stringify({
    city,
    condition: parts[0]?.trim() || '未知',
    temperature: parts[1]?.trim() || '未知',
    humidity: parts[2]?.trim() || '未知',
    wind: parts[3]?.trim() || '未知',
    updated_at: new Date().toISOString(),
    source: 'wttr.in',  // 标记数据来源
  })
}
```

## 注意事项

- wttr.in 返回的温度格式如 `+25°C`，直接保留
- 城市名需要 encodeURIComponent 处理（如中文城市）
- 如果 API 请求失败，回退到 mock 数据，不要崩溃
- 其他 5 个工具（search_web, calculate, get_time, search_flight, search_hotel）保持 mock 不变
