import type { CropId } from '../farm/farmTypes'
import type { ProduceOffer, SeedOffer } from './gameTypes'
import { mergeLegacySeeds } from '../farm/farmCatalog'

export const INITIAL_COINS = 100
export const SEED_OFFERS: readonly SeedOffer[] = [
  { cropId: 'wheat', name: '小麦种子', price: 5 },
]

/** 农产品回收价（单次出售 1 个） */
export const PRODUCE_OFFERS: readonly ProduceOffer[] = [
  { produceId: 'wheat', name: '小麦', price: 3 },
]

/**
 * Coins and inventory counts are non-negative safe integers. A finite fractional
 * amount keeps its whole part instead of being discarded, so a rounding bug in a
 * caller cannot silently erase a balance.
 */
export function normalizeItemCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER)
}

export function seedCounts(input: Record<string, number> = {}): Record<CropId, number> {
  return mergeLegacySeeds(input) as Record<CropId, number>
}
