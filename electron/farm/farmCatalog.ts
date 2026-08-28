import type { CropDef, CropId } from './farmTypes'

export const PLOT_COUNT = 24

export const LEGACY_CROP_IDS = ['lettuce', 'tomato', 'pumpkin'] as const

export const CROPS: Record<CropId, CropDef> = {
  wheat: {
    id: 'wheat',
    name: '小麦',
    growMs: 20 * 60_000,
    waterIntervalMs: 5 * 60_000,
    yieldItemId: 'wheat',
    yieldMin: 1,
    yieldMax: 2,
  },
}

export const DEFAULT_SEEDS: Record<string, number> = {
  wheat: 5,
}

export const DAILY_SEEDS: Record<string, number> = {
  wheat: 3,
}

export const BUG_CHANCE = 0.1
export const RAIN_CHANCE = 0.35
export const WEATHER_COOLDOWN_MS = 30 * 60_000

export function getCrop(id: CropId): CropDef {
  return CROPS[id]
}

function floorCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

/** Merge legacy crop seeds into the single wheat inventory key. */
export function mergeLegacySeeds(seeds: Record<string, number>): Record<string, number> {
  let wheat = floorCount(seeds.wheat)
  for (const id of LEGACY_CROP_IDS) {
    wheat += floorCount(seeds[id])
  }
  return { wheat }
}

/** Merge legacy harvest items into wheat produce. */
export function mergeLegacyProduce(inventory: Record<string, number>): Record<string, number> {
  const next: Record<string, number> = {}
  let wheat = floorCount(inventory.wheat)
  for (const id of LEGACY_CROP_IDS) {
    wheat += floorCount(inventory[id])
  }
  if (wheat > 0) next.wheat = wheat
  for (const [key, count] of Object.entries(inventory)) {
    if (key === 'wheat' || (LEGACY_CROP_IDS as readonly string[]).includes(key)) continue
    const normalized = floorCount(count)
    if (normalized > 0) next[key] = normalized
  }
  return next
}

export function normalizeLegacyCropId(value: unknown): CropId | null {
  if (value === 'wheat') return 'wheat'
  if (typeof value === 'string' && (LEGACY_CROP_IDS as readonly string[]).includes(value)) {
    return 'wheat'
  }
  return null
}
