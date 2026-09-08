import catalog from './baitCatalog.json'
import type { BaitId, BaitOffer, FishRarity } from './fishingTypes'

export type BaitCatalogEntry = Omit<BaitOffer, 'baitId'> & {
  rarityWeights: Record<FishRarity, number>
}

const BAIT_CATALOG = catalog as {
  version: number
  baits: Record<BaitId, BaitCatalogEntry>
}

const RARITIES: FishRarity[] = ['common', 'uncommon', 'rare', 'precious']

function assertBaitEntry(id: string, entry: BaitCatalogEntry): void {
  if (!entry.name.trim() || !entry.description.trim() || !entry.image.trim()) {
    throw new Error(`baitCatalog: invalid ${id}`)
  }
  if (!Number.isFinite(entry.price) || entry.price < 0) {
    throw new Error(`baitCatalog: invalid price for ${id}`)
  }
  const sum = RARITIES.reduce((total, rarity) => {
    const weight = entry.rarityWeights[rarity]
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error(`baitCatalog: invalid ${rarity} weight for ${id}`)
    }
    return total + weight
  }, 0)
  if (Math.abs(sum - 1) > 1e-9) throw new Error(`baitCatalog: weights must total 1 for ${id}`)
}

if (BAIT_CATALOG.version !== 1) throw new Error('baitCatalog: unsupported version')
for (const [id, entry] of Object.entries(BAIT_CATALOG.baits)) assertBaitEntry(id, entry)

export function getBaitIds(): BaitId[] {
  return Object.keys(BAIT_CATALOG.baits) as BaitId[]
}

export function isBaitId(value: unknown): value is BaitId {
  return typeof value === 'string' && value in BAIT_CATALOG.baits
}

export function getBaitCatalogEntry(baitId: BaitId): BaitCatalogEntry {
  return BAIT_CATALOG.baits[baitId]
}

export function buildEmptyBaitCounts(): Record<BaitId, number> {
  return { basic: 0, premium: 0 }
}

export function buildBaitOffers(): BaitOffer[] {
  return getBaitIds().map((baitId) => {
    const { rarityWeights: _weights, ...entry } = getBaitCatalogEntry(baitId)
    return { baitId, ...entry }
  })
}

export const FISH_RARITIES = RARITIES
