import catalog from './foodCatalog.json'

export type FoodCatalogEntry = {
  name: string
  price: number
  /** 喂食后增加的饱食度（0~100） */
  satiety: number
  /** public/foods/ 下的文件名 */
  image: string
}

export type FoodCatalogFile = {
  version: number
  foods: Record<string, FoodCatalogEntry>
}

const FOOD_CATALOG = catalog as FoodCatalogFile

export type FoodId = keyof typeof catalog.foods & string

export type FoodOffer = { foodId: FoodId; name: string; price: number; satiety: number }

function assertFoodEntry(id: string, entry: FoodCatalogEntry): void {
  if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
    throw new Error(`foodCatalog: ${id}.name must be a non-empty string`)
  }
  if (typeof entry.image !== 'string' || entry.image.trim().length === 0) {
    throw new Error(`foodCatalog: ${id}.image must be a non-empty string`)
  }
  for (const field of ['price', 'satiety'] as const) {
    const value = entry[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`foodCatalog: ${id}.${field} must be a non-negative number`)
    }
  }
  if (entry.satiety <= 0 || entry.satiety > 100) {
    throw new Error(`foodCatalog: ${id}.satiety must be between 1 and 100`)
  }
}

function foodEntries(): [FoodId, FoodCatalogEntry][] {
  return Object.entries(FOOD_CATALOG.foods).map(([id, entry]) => {
    assertFoodEntry(id, entry)
    return [id as FoodId, entry]
  })
}

export function getFoodIds(): FoodId[] {
  return Object.keys(FOOD_CATALOG.foods) as FoodId[]
}

export function buildEmptyFoodCounts(): Record<FoodId, number> {
  return Object.fromEntries(getFoodIds().map((id) => [id, 0])) as Record<FoodId, number>
}

export function withFoodCounts(counts: Partial<Record<FoodId, number>>): Record<FoodId, number> {
  return { ...buildEmptyFoodCounts(), ...counts }
}

export function getFoodCatalog(): Readonly<FoodCatalogFile> {
  return FOOD_CATALOG
}

export function getFoodCatalogEntry(foodId: FoodId): FoodCatalogEntry {
  const entry = FOOD_CATALOG.foods[foodId]
  if (!entry) throw new Error(`foodCatalog: unknown food ${foodId}`)
  return entry
}

export function getFoodImagePath(foodId: FoodId): string {
  return getFoodCatalogEntry(foodId).image
}

export function buildFoodOffers(): readonly FoodOffer[] {
  return foodEntries().map(([foodId, entry]) => ({
    foodId,
    name: entry.name,
    price: entry.price,
    satiety: entry.satiety,
  }))
}

foodEntries()
