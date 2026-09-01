import catalog from './cropCatalog.json'

export type CropCatalogEntry = {
  name: string
  seedName: string
  seedPrice: number
  produceName: string
  producePrice: number
  growMinutes: number
  waterIntervalMinutes: number
  yieldMin: number
  yieldMax: number
  starterSeeds: number
  dailySeeds: number
  /** 商店、背包展示图（public/farm/ 相对路径） */
  shopImg: string
  /** 农场 3 个生长阶段图（public/farm/ 相对路径） */
  sprites: readonly [string, string, string]
}

export type CropCatalogFile = {
  version: number
  crops: Record<string, CropCatalogEntry>
}

const CROP_CATALOG = catalog as unknown as CropCatalogFile

export type CropId = keyof typeof catalog.crops & string

export type CropDef = {
  id: CropId
  name: string
  growMs: number
  waterIntervalMs: number
  yieldItemId: string
  yieldMin: number
  yieldMax: number
}

type SeedOffer = { cropId: CropId; name: string; price: number }
type ProduceOffer = { produceId: string; name: string; price: number }

function minutesToMs(minutes: number): number {
  return minutes * 60_000
}

function assertCropEntry(id: string, entry: CropCatalogEntry): void {
  const numericFields: (keyof CropCatalogEntry)[] = [
    'seedPrice',
    'producePrice',
    'growMinutes',
    'waterIntervalMinutes',
    'yieldMin',
    'yieldMax',
    'starterSeeds',
    'dailySeeds',
  ]
  for (const field of numericFields) {
    const value = entry[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`cropCatalog: ${id}.${field} must be a non-negative number`)
    }
  }
  if (entry.yieldMax < entry.yieldMin) {
    throw new Error(`cropCatalog: ${id}.yieldMax must be >= yieldMin`)
  }
  if (typeof entry.shopImg !== 'string' || entry.shopImg.trim().length === 0) {
    throw new Error(`cropCatalog: ${id}.shopImg must be a non-empty string`)
  }
  if (entry.sprites.length !== 3) {
    throw new Error(`cropCatalog: ${id}.sprites must contain exactly 3 stage images`)
  }
}

function cropEntries(): [CropId, CropCatalogEntry][] {
  return Object.entries(CROP_CATALOG.crops).map(([id, entry]) => {
    assertCropEntry(id, entry)
    return [id as CropId, entry]
  })
}

export function getCropIds(): CropId[] {
  return Object.keys(CROP_CATALOG.crops) as CropId[]
}

export function buildEmptySeedCounts(): Record<CropId, number> {
  return Object.fromEntries(getCropIds().map((id) => [id, 0])) as Record<CropId, number>
}

export function withSeedCounts(counts: Partial<Record<CropId, number>>): Record<CropId, number> {
  return { ...buildEmptySeedCounts(), ...counts }
}

export function getCropCatalog(): Readonly<CropCatalogFile> {
  return CROP_CATALOG
}

export function getCropCatalogEntry(cropId: CropId): CropCatalogEntry {
  const entry = CROP_CATALOG.crops[cropId]
  if (!entry) throw new Error(`cropCatalog: unknown crop ${cropId}`)
  return entry
}

export function buildCrops(): Record<CropId, CropDef> {
  const crops = {} as Record<CropId, CropDef>
  for (const [id, entry] of cropEntries()) {
    crops[id] = {
      id,
      name: entry.name,
      growMs: minutesToMs(entry.growMinutes),
      waterIntervalMs: minutesToMs(entry.waterIntervalMinutes),
      yieldItemId: id,
      yieldMin: entry.yieldMin,
      yieldMax: entry.yieldMax,
    }
  }
  return crops
}

export function buildSeedOffers(): readonly SeedOffer[] {
  return cropEntries().map(([cropId, entry]) => ({
    cropId,
    name: entry.seedName,
    price: entry.seedPrice,
  }))
}

export function buildProduceOffers(): readonly ProduceOffer[] {
  return cropEntries().map(([cropId, entry]) => ({
    produceId: cropId,
    name: entry.produceName,
    price: entry.producePrice,
  }))
}

export function buildDefaultSeeds(): Record<string, number> {
  return Object.fromEntries(cropEntries().map(([id, entry]) => [id, entry.starterSeeds]))
}

export function buildDailySeeds(): Record<string, number> {
  return Object.fromEntries(cropEntries().map(([id, entry]) => [id, entry.dailySeeds]))
}

/** public/farm/ 下的相对路径，供渲染层拼 URL */
export function getCropSpritePaths(cropId: CropId): readonly string[] {
  return getCropCatalogEntry(cropId).sprites
}

export function getCropShopImgPath(cropId: CropId): string {
  return getCropCatalogEntry(cropId).shopImg
}

export function formatCropGrowLabel(cropId: CropId): string {
  const minutes = getCropCatalogEntry(cropId).growMinutes
  if (minutes < 60) return `成熟约 ${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  if (rem === 0) return `成熟约 ${hours} 小时`
  return `成熟约 ${hours} 小时 ${rem} 分钟`
}

// Validate on module load so bad JSON fails fast in tests and dev.
cropEntries()
