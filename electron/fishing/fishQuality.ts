import type { FishQuality } from './fishingTypes'

export const FISH_QUALITIES = ['white', 'gold', 'red'] as const

export const FISH_QUALITY_CONFIG: Record<FishQuality, {
  label: string
  priceMultiplier: number
  chancePercent: number
}> = {
  white: { label: '白色', priceMultiplier: 1, chancePercent: 80 },
  gold: { label: '金色', priceMultiplier: 2, chancePercent: 15 },
  red: { label: '红色', priceMultiplier: 3, chancePercent: 5 },
}

export function normalizeFishQuality(value: unknown): FishQuality {
  return value === 'gold' || value === 'red' ? value : 'white'
}
