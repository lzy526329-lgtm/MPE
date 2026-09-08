import catalog from './fishCatalog.json'
import type { FishId, FishRarity } from './fishingTypes'

export type FishCatalogEntry = {
  name: string
  rarity: FishRarity
  weightMin: number
  weightMax: number
  basePrice: number
  image: string
}

const FISH_CATALOG = catalog as {
  version: number
  fish: Record<FishId, FishCatalogEntry>
}

const RARITIES: FishRarity[] = ['common', 'uncommon', 'rare', 'precious']

function assertFishEntry(id: string, entry: FishCatalogEntry): void {
  if (!entry.name.trim() || !entry.image.trim()) throw new Error(`fishCatalog: invalid ${id}`)
  if (!RARITIES.includes(entry.rarity)) throw new Error(`fishCatalog: invalid rarity for ${id}`)
  for (const value of [entry.weightMin, entry.weightMax, entry.basePrice]) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`fishCatalog: invalid number for ${id}`)
  }
  if (entry.weightMax < entry.weightMin) throw new Error(`fishCatalog: invalid weight range for ${id}`)
}

if (FISH_CATALOG.version !== 1) throw new Error('fishCatalog: unsupported version')
for (const [id, entry] of Object.entries(FISH_CATALOG.fish)) assertFishEntry(id, entry)

export function getFishIds(): FishId[] {
  return Object.keys(FISH_CATALOG.fish) as FishId[]
}

export function isFishId(value: unknown): value is FishId {
  return typeof value === 'string' && value in FISH_CATALOG.fish
}

export function getFishCatalogEntry(fishId: FishId): FishCatalogEntry {
  return FISH_CATALOG.fish[fishId]
}

export function getFishIdsByRarity(rarity: FishRarity): FishId[] {
  return getFishIds().filter((id) => FISH_CATALOG.fish[id].rarity === rarity)
}

const FISH_RARITY_LABELS: Record<FishRarity, string> = {
  common: '普通',
  uncommon: '少见',
  rare: '稀有',
  precious: '珍贵',
}

export function fishRarityLabel(rarity: FishRarity): string {
  return FISH_RARITY_LABELS[rarity]
}
