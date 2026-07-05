# 升级：将 get_weather 改为 Open-Meteo API

## 背景

OpenWeatherMap 在浏览器端有 CORS 限制。
改用 **Open-Meteo**（完全免费，无需 API Key，支持 CORS）。

## 改动范围

替换 `demo/src/engine/liveTools.ts` 中 `getWeather.execute` 的全部内容。

## 实现方案

Open-Meteo 需要两步：

### 第 1 步：地理编码（城市名 → 经纬度）

```
GET https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1&language=zh
```

返回示例：
```json
{
  "results": [{ "latitude": 39.9, "longitude": 116.4, "name": "北京", "country": "中国" }]
}
```

### 第 2 步：查天气

```
GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto
```

返回示例：
```json
{
  "current": {
    "temperature_2m": 25,
    "relative_humidity_2m": 55,
    "weather_code": 0,
    "wind_speed_10m": 12
  }
}
```

### weather_code 转中文描述

WMO Weather Code 映射：
```
0  → 晴天
1  → 大部晴朗
2  → 多云
3  → 阴天
45 → 雾
51 → 小毛毛雨
61 → 小雨
63 → 中雨
71 → 小雪
80 → 小阵雨
95 → 雷暴
...其他 → 未知
```

只映射常见的几个即可，其余返回"未知"。

## 返回格式

保持与之前一致：
```json
{
  "city": "北京",
  "temperature": "25°C",
  "condition": "晴天",
  "humidity": "55%",
  "wind": "12 km/h",
  "updated_at": "2026-...",
  "source": "Open-Meteo"
}
```

API 失败时回退到现有的 mock fallback 代码。
