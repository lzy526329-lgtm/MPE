import type { CropDef, CropId } from './farmTypes'

export const PLOT_COUNT = 24

export const CROPS: Record<CropId, CropDef> = {
  lettuce: {
    id: 'lettuce',
    name: '生菜',
    growMs: 2 * 60_000,
    waterIntervalMs: 5 * 60_000,
    yieldItemId: 'lettuce',
    yieldMin: 1,
    yieldMax: 2,
  },
  tomato: {
    id: 'tomato',
    name: '番茄',
    growMs: 20 * 60_000,
    waterIntervalMs: 15 * 60_000,
    yieldItemId: 'tomato',
    yieldMin: 1,
    yieldMax: 3,
  },
  pumpkin: {
    id: 'pumpkin',
    name: '南瓜',
    growMs: 45 * 60_000,
    waterIntervalMs: 30 * 60_000,
    yieldItemId: 'pumpkin',
    yieldMin: 2,
    yieldMax: 4,
  },
}

export const DEFAULT_SEEDS: Record<string, number> = {
  lettuce: 5,
  tomato: 3,
  pumpkin: 1,
}

export const DAILY_SEEDS: Record<string, number> = {
  lettuce: 3,
  tomato: 2,
  pumpkin: 1,
}

export const BUG_CHANCE = 0.1
export const RAIN_CHANCE = 0.35
export const WEATHER_COOLDOWN_MS = 30 * 60_000

export function getCrop(id: CropId): CropDef {
  return CROPS[id]
}
