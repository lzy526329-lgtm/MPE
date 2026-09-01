import type { CropId } from '../farm/farmTypes'
import type { ProduceOffer, SeedOffer } from './gameTypes'
import type { FoodId, FoodOffer } from './foodCatalog'
import { mergeLegacySeeds } from '../farm/farmCatalog'
import { buildProduceOffers, buildSeedOffers } from '../farm/cropCatalog'
import { buildEmptyFoodCounts, buildFoodOffers } from './foodCatalog'

export type { FoodId } from './foodCatalog'

export const INITIAL_COINS = 100
export const SEED_OFFERS: readonly SeedOffer[] = buildSeedOffers()
export const FOOD_OFFERS: readonly FoodOffer[] = buildFoodOffers()

/** 农产品回收价（单次出售 1 个） */
export const PRODUCE_OFFERS: readonly ProduceOffer[] = buildProduceOffers()

/**
 * Coins and inventory counts are non-negative safe integers. A finite fractional
 * amount keeps its whole part instead of being discarded, so a rounding bug in a
 * caller cannot silently erase a balance.
 */
export function normalizeItemCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER)
}

export function foodCounts(input: Record<string, number> = {}): Record<FoodId, number> {
  const next = buildEmptyFoodCounts()
  for (const id of Object.keys(next) as FoodId[]) {
    next[id] = normalizeItemCount(input[id])
  }
  return next
}

export function seedCounts(input: Record<string, number> = {}): Record<CropId, number> {
  return mergeLegacySeeds(input) as Record<CropId, number>
}
