import type { CropDef, CropId } from './farmTypes'
import {
  buildCrops,
  buildDailySeeds,
  buildDefaultSeeds,
  buildEmptySeedCounts,
  getCropIds,
} from './cropCatalog'
import { FARM_LEVEL_CAP } from './farmLevelCatalog'

export const PLOT_COUNT = 24
/** 初始 6 块解锁，其余 18 块需农场 Lv.1–18 逐块解锁 */
export const INITIAL_UNLOCKED_PLOTS = 6

export type PlotUnlockRequirement = {
  level: number
  coins: number
}

/** 第 7 块起：每块地对应 +1 农场等级，金币随序号递增 */
export function plotUnlockRequirement(plotIndex: number): PlotUnlockRequirement | null {
  if (plotIndex < INITIAL_UNLOCKED_PLOTS || plotIndex >= PLOT_COUNT) return null
  const tier = plotIndex - INITIAL_UNLOCKED_PLOTS
  return {
    level: Math.min(FARM_LEVEL_CAP, tier + 1),
    coins: 15 + tier * 10,
  }
}

export function isPlotLocked(plot: { status: string }): boolean {
  return plot.status === 'locked'
}

export const LEGACY_CROP_IDS = ['lettuce', 'tomato', 'pumpkin'] as const

export const CROPS: Record<CropId, CropDef> = buildCrops()

export const DEFAULT_SEEDS: Record<string, number> = buildDefaultSeeds()

export const DAILY_SEEDS: Record<string, number> = buildDailySeeds()

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

/** 归一化种子库存：保留各作物数量，旧版 lettuce/tomato/pumpkin 并入 wheat */
export function mergeLegacySeeds(seeds: Record<string, number>): Record<string, number> {
  const next = buildEmptySeedCounts()
  for (const id of getCropIds()) {
    next[id] = floorCount(seeds[id])
  }
  for (const id of LEGACY_CROP_IDS) {
    next.wheat += floorCount(seeds[id])
  }
  return next
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
  if (typeof value === 'string' && (getCropIds() as string[]).includes(value)) {
    return value as CropId
  }
  if (typeof value === 'string' && (LEGACY_CROP_IDS as readonly string[]).includes(value)) {
    return 'wheat'
  }
  return null
}
