import catalog from './furnitureCatalog.json'

export type FurnitureId = keyof typeof catalog.furniture & string
export type FurnitureEntry = { name: string; price: number; src: string; defaultWidth: number; max?: number }
export type FurnitureOffer = FurnitureEntry & { furnitureId: FurnitureId }

const entries = () => Object.entries(catalog.furniture) as [FurnitureId, FurnitureEntry][]
export function getFurnitureIds(): FurnitureId[] { return entries().map(([id]) => id) }
export function getFurnitureEntry(id: FurnitureId): FurnitureEntry {
  const entry = catalog.furniture[id]
  if (!entry) throw new Error(`furnitureCatalog: unknown furniture ${id}`)
  return entry as FurnitureEntry
}
export function buildEmptyFurnitureCounts(): Record<FurnitureId, number> {
  return Object.fromEntries(getFurnitureIds().map((id) => [id, 0])) as Record<FurnitureId, number>
}
export function furnitureCounts(input: Record<string, number> = {}): Record<FurnitureId, number> {
  return Object.fromEntries(getFurnitureIds().map((id) => [id, Math.max(0, Math.floor(input[id] ?? 0))])) as Record<FurnitureId, number>
}
export function buildFurnitureOffers(): readonly FurnitureOffer[] {
  return entries().map(([furnitureId, entry]) => ({ furnitureId, ...entry }))
}
