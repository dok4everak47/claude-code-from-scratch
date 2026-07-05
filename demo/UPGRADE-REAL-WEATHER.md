# 升级：将 get_weather 改为 OpenWeatherMap API

## 目标

把 liveTools.ts 中的 get_weather 从 wttr.in 改为调用 OpenWeatherMap API。
API Key: be8c9ad4bb488b61c8163854ce2e6282

## 改动范围

只修改 `demo/src/engine/liveTools.ts` 中的 `getWeather.execute`。

## 具体需求

```typescript
// OpenWeatherMap 接口
const API_KEY = 'be8c9ad4bb488b61c8163854ce2e6282'
const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric&lang=zh_cn`

// 返回 JSON 格式，直接解析：
// {
//   "weather": [{ "description": "晴", "main": "Clear" }],
//   "main": { "temp": 25, "humidity": 55 },
//   "wind": { "speed": 12 }
// }
```

返回格式保持与之前一致：
```json
{
  "city": "北京",
  "temperature": "25°C",
  "condition": "晴",
  "humidity": "55%",
  "wind": "12m/s",
  "updated_at": "2026-...",
  "source": "OpenWeatherMap"
}
```

API 失败时回退到 mock 数据（保留现有 fallback 代码）。
其他工具不动。

