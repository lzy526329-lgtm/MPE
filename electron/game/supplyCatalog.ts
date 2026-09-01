import catalog from './supplyCatalog.json'

export type SupplyCatalogEntry = {
  name: string
  price: number
  /** 使用后增加的卫生值（0~100） */
  hygiene: number
  /** public/杂货/ 下的文件名 */
  image: string
}

export type SupplyCatalogFile = {
  version: number
  supplies: Record<string, SupplyCatalogEntry>
}

const SUPPLY_CATALOG = catalog as SupplyCatalogFile

export type SupplyId = keyof typeof catalog.supplies & string

export type SupplyOffer = { supplyId: SupplyId; name: string; price: number; hygiene: number }

function assertSupplyEntry(id: string, entry: SupplyCatalogEntry): void {
  if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
    throw new Error(`supplyCatalog: ${id}.name must be a non-empty string`)
  }
  if (typeof entry.image !== 'string' || entry.image.trim().length === 0) {
    throw new Error(`supplyCatalog: ${id}.image must be a non-empty string`)
  }
  for (const field of ['price', 'hygiene'] as const) {
    const value = entry[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`supplyCatalog: ${id}.${field} must be a non-negative number`)
    }
  }
  if (entry.hygiene <= 0 || entry.hygiene > 100) {
    throw new Error(`supplyCatalog: ${id}.hygiene must be between 1 and 100`)
  }
}

function supplyEntries(): [SupplyId, SupplyCatalogEntry][] {
  return Object.entries(SUPPLY_CATALOG.supplies).map(([id, entry]) => {
    assertSupplyEntry(id, entry)
    return [id as SupplyId, entry]
  })
}

export function getSupplyIds(): SupplyId[] {
  return Object.keys(SUPPLY_CATALOG.supplies) as SupplyId[]
}

export function buildEmptySupplyCounts(): Record<SupplyId, number> {
  return Object.fromEntries(getSupplyIds().map((id) => [id, 0])) as Record<SupplyId, number>
}

export function withSupplyCounts(counts: Partial<Record<SupplyId, number>>): Record<SupplyId, number> {
  return { ...buildEmptySupplyCounts(), ...counts }
}

export function getSupplyCatalogEntry(supplyId: SupplyId): SupplyCatalogEntry {
  const entry = SUPPLY_CATALOG.supplies[supplyId]
  if (!entry) throw new Error(`supplyCatalog: unknown supply ${supplyId}`)
  return entry
}

export function getSupplyImagePath(supplyId: SupplyId): string {
  return getSupplyCatalogEntry(supplyId).image
}

export function buildSupplyOffers(): readonly SupplyOffer[] {
  return supplyEntries().map(([supplyId, entry]) => ({
    supplyId,
    name: entry.name,
    price: entry.price,
    hygiene: entry.hygiene,
  }))
}

supplyEntries()
