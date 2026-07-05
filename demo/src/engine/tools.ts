// ============================================================
// Fake tool definitions for the demo
// ============================================================

import type { ToolCall, ToolStatus } from './types'

/** Metadata describing a tool */
export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  /** Mock executor: given input JSON, returns output JSON */
  execute: (input: string) => Promise<{ output: string } | { error: string }>
}

/** Simulated delay for tool execution (ms) */
const SIMULATED_DELAY = 800

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================
// Tool: get_weather
// ============================================================
const getWeather: ToolDefinition = {
  name: 'get_weather',
  description: 'Get current weather for a given city',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' },
    },
    required: ['city'],
  },
  execute: async (input: string) => {
    await delay(SIMULATED_DELAY)
    const { city } = JSON.parse(input)
    // Fake weather data
    const conditions = ['Sunny', 'Cloudy', 'Rainy', 'Partly Cloudy', 'Windy']
    const temps = [15, 18, 22, 25, 28, 30, 32]
    const condition = conditions[Math.floor(Math.random() * conditions.length)]
    const temp = temps[Math.floor(Math.random() * temps.length)]
    return {
      output: JSON.stringify({
        city,
        temperature_c: temp,
        condition,
        humidity: Math.floor(Math.random() * 40) + 40,
        wind_kmh: Math.floor(Math.random() * 20) + 5,
      }),
    }
  },
}

// ============================================================
// Tool: search_hotel
// ============================================================
const searchHotel: ToolDefinition = {
  name: 'search_hotel',
  description: 'Search for hotels in a city',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' },
      check_in: { type: 'string', description: 'Check-in date (YYYY-MM-DD)' },
      check_out: { type: 'string', description: 'Check-out date (YYYY-MM-DD)' },
      guests: { type: 'number', description: 'Number of guests' },
    },
    required: ['city'],
  },
  execute: async (input: string) => {
    await delay(SIMULATED_DELAY)
    const { city } = JSON.parse(input)
    const hotels = [
      { name: `${city} Grand Hotel`, rating: 4.5, price_per_night: 280, available: true },
      { name: `${city} Boutique Inn`, rating: 4.2, price_per_night: 180, available: true },
      { name: `${city} Budget Stay`, rating: 3.8, price_per_night: 90, available: true },
    ]
    return { output: JSON.stringify({ city, hotels }) }
  },
}

// ============================================================
// Tool: search_flight
// ============================================================
const searchFlight: ToolDefinition = {
  name: 'search_flight',
  description: 'Search for flights between two cities',
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Departure city' },
      to: { type: 'string', description: 'Arrival city' },
      date: { type: 'string', description: 'Flight date (YYYY-MM-DD)' },
    },
    required: ['from', 'to', 'date'],
  },
  execute: async (input: string) => {
    await delay(SIMULATED_DELAY)
    const { from, to } = JSON.parse(input)
    const airlines = ['SkyHigh', 'CloudNine', 'AeroFly', 'JetStream']
    const flights = Array.from({ length: 3 }, (_, i) => ({
      airline: airlines[i % airlines.length],
      flight_number: `${airlines[i % airlines.length].substring(0, 2).toUpperCase()}${100 + i * 7}`,
      departure: `${from} 08:${(i * 15) % 60}`.padEnd(8, '0'),
      arrival: `${to} ${10 + i}:${(i * 20) % 60}`.padEnd(8, '0'),
      price: 200 + i * 85,
      stops: i === 2 ? 1 : 0,
    }))
    return { output: JSON.stringify({ from, to, flights }) }
  },
}

// ============================================================
// Tool registry
// ============================================================
export const toolRegistry: Record<string, ToolDefinition> = {
  get_weather: getWeather,
  search_hotel: searchHotel,
  search_flight: searchFlight,
}

/** Execute a tool call and update its status/output */
export async function executeToolCall(toolCall: ToolCall): Promise<ToolCall> {
  const def = toolRegistry[toolCall.name]
  if (!def) {
    return {
      ...toolCall,
      status: 'error' as ToolStatus,
      error: `Unknown tool: ${toolCall.name}`,
      output: null,
    }
  }

  try {
    const result = await def.execute(toolCall.input)
    if ('error' in result) {
      return {
        ...toolCall,
        status: 'error' as ToolStatus,
        error: result.error,
        output: null,
      }
    }
    return {
      ...toolCall,
      status: 'success' as ToolStatus,
      output: result.output,
    }
  } catch (err) {
    return {
      ...toolCall,
      status: 'error' as ToolStatus,
      error: err instanceof Error ? err.message : 'Unknown error',
      output: null,
    }
  }
}
