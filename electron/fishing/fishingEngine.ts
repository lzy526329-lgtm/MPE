import { FISH_RARITIES, getBaitCatalogEntry } from './baitCatalog'
import { getFishCatalogEntry, getFishIdsByRarity } from './fishCatalog'
import { FISH_QUALITIES, FISH_QUALITY_CONFIG } from './fishQuality'
import type { BaitId, FishCatch, FishId, FishQuality, FishRarity } from './fishingTypes'

function clampRoll(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1 - Number.EPSILON, Math.max(0, value))
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function chooseFish(baitId: BaitId, rng: () => number = Math.random): FishId {
  const roll = clampRoll(rng())
  const weights = getBaitCatalogEntry(baitId).rarityWeights
  let start = 0
  let rarity: FishRarity = 'common'

  for (const candidate of FISH_RARITIES) {
    const end = start + weights[candidate]
    if (roll < end && weights[candidate] > 0) {
      rarity = candidate
      const fish = getFishIdsByRarity(candidate)
      const normalized = (roll - start) / weights[candidate]
      return fish[Math.min(fish.length - 1, Math.floor(normalized * fish.length))]
    }
    start = end
  }

  rarity = FISH_RARITIES.findLast((item) => weights[item] > 0) ?? rarity
  return getFishIdsByRarity(rarity).at(-1)!
}

function chooseFishQuality(rng: () => number): FishQuality {
  const roll = clampRoll(rng()) * 100
  let threshold = 0
  for (const quality of FISH_QUALITIES) {
    threshold += FISH_QUALITY_CONFIG[quality].chancePercent
    if (roll < threshold) return quality
  }
  return 'red'
}

export function createFishCatch(
  fishId: FishId,
  now: number,
  id: string,
  rng: () => number = Math.random,
): FishCatch {
  const fish = getFishCatalogEntry(fishId)
  const roll = clampRoll(rng())
  const weightKg = roundTo(fish.weightMin + (fish.weightMax - fish.weightMin) * roll, 2)
  const position =
    fish.weightMax === fish.weightMin
      ? 0
      : (weightKg - fish.weightMin) / (fish.weightMax - fish.weightMin)
  const multiplier = 0.8 + position * 0.7
  const quality = chooseFishQuality(rng)
  const basePrice = Math.max(1, Math.round(fish.basePrice * multiplier))
  return {
    id,
    fishId,
    quality,
    weightKg,
    sellPrice: basePrice * FISH_QUALITY_CONFIG[quality].priceMultiplier,
    caughtAt: now,
  }
}
