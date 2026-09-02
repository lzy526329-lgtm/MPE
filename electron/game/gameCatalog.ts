import type { CropId } from '../farm/farmTypes'
import type { ProduceOffer, SeedOffer } from './gameTypes'
import type { FoodId, FoodOffer } from './foodCatalog'
import type { SupplyId, SupplyOffer } from './supplyCatalog'
import { mergeLegacySeeds } from '../farm/farmCatalog'
import { buildProduceOffers, buildSeedOffers } from '../farm/cropCatalog'
import { buildEmptyFoodCounts, buildFoodOffers } from './foodCatalog'
import { buildEmptySupplyCounts, buildSupplyOffers } from './supplyCatalog'
import type { DecorId, DecorOffer } from './decorCatalog'
import { buildEmptyDecorCounts, buildDecorOffers } from './decorCatalog'

export type { FoodId } from './foodCatalog'
export type { DecorId } from './decorCatalog'

export const INITIAL_COINS = 100
export const SEED_OFFERS: readonly SeedOffer[] = buildSeedOffers()
export const FOOD_OFFERS: readonly FoodOffer[] = buildFoodOffers()
export const SUPPLY_OFFERS: readonly SupplyOffer[] = buildSupplyOffers()
export const DECOR_OFFERS: readonly DecorOffer[] = buildDecorOffers()

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

export function supplyCounts(input: Record<string, number> = {}): Record<SupplyId, number> {
  const next = buildEmptySupplyCounts()
  for (const id of Object.keys(next) as SupplyId[]) {
    next[id] = normalizeItemCount(input[id])
  }
  return next
}

export function foodCounts(input: Record<string, number> = {}): Record<FoodId, number> {
  const next = buildEmptyFoodCounts()
  for (const id of Object.keys(next) as FoodId[]) {
    next[id] = normalizeItemCount(input[id])
  }
  return next
}

export function decorCounts(input: Record<string, number> = {}): Record<DecorId, number> {
  const next = buildEmptyDecorCounts()
  for (const id of Object.keys(next) as DecorId[]) {
    next[id] = normalizeItemCount(input[id])
  }
  return next
}

export function seedCounts(input: Record<string, number> = {}): Record<CropId, number> {
  return mergeLegacySeeds(input) as Record<CropId, number>
}
