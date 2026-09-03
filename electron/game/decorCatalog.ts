import catalog from './decorCatalog.json'

export type DecorFarmClick =
  | { action: 'toast'; message: string }
  | { action: 'openShop' }

export type DecorCatalogEntry = {
  name: string
  price: number
  /** public/farm/ 下的文件名 */
  src: string
  defaultWidth: number
  /** 最多可拥有数量（背包未摆 + 已摆放）；省略表示不限 */
  max?: number
  /** 农场非编辑模式下点击已摆放装饰的行为 */
  farmClick?: DecorFarmClick
}

export type DecorCatalogFile = {
  version: number
  decors: Record<string, DecorCatalogEntry>
}

const DECOR_CATALOG = catalog as DecorCatalogFile

export type DecorId = keyof typeof catalog.decors & string

export type DecorOffer = {
  decorId: DecorId
  name: string
  price: number
  src: string
  defaultWidth: number
  max?: number
}

function assertFarmClick(id: string, value: unknown): asserts value is DecorFarmClick {
  if (!value || typeof value !== 'object') {
    throw new Error(`decorCatalog: ${id}.farmClick must be an object`)
  }
  const click = value as Record<string, unknown>
  if (click.action === 'toast') {
    if (typeof click.message !== 'string' || click.message.trim().length === 0) {
      throw new Error(`decorCatalog: ${id}.farmClick.message must be a non-empty string`)
    }
    return
  }
  if (click.action === 'openShop') return
  throw new Error(`decorCatalog: ${id}.farmClick.action must be toast or openShop`)
}

function assertDecorEntry(id: string, entry: DecorCatalogEntry): void {
  if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
    throw new Error(`decorCatalog: ${id}.name must be a non-empty string`)
  }
  if (typeof entry.src !== 'string' || entry.src.trim().length === 0) {
    throw new Error(`decorCatalog: ${id}.src must be a non-empty string`)
  }
  for (const field of ['price', 'defaultWidth'] as const) {
    const value = entry[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`decorCatalog: ${id}.${field} must be a non-negative number`)
    }
  }
  if (entry.defaultWidth <= 0 || entry.defaultWidth > 60) {
    throw new Error(`decorCatalog: ${id}.defaultWidth must be between 1 and 60`)
  }
  if (entry.max !== undefined) {
    if (typeof entry.max !== 'number' || !Number.isInteger(entry.max) || entry.max < 1) {
      throw new Error(`decorCatalog: ${id}.max must be a positive integer`)
    }
  }
  if (entry.farmClick !== undefined) assertFarmClick(id, entry.farmClick)
}

function decorEntries(): [DecorId, DecorCatalogEntry][] {
  return Object.entries(DECOR_CATALOG.decors).map(([id, entry]) => {
    assertDecorEntry(id, entry)
    return [id as DecorId, entry]
  })
}

export function getDecorIds(): DecorId[] {
  return Object.keys(DECOR_CATALOG.decors) as DecorId[]
}

export function buildEmptyDecorCounts(): Record<DecorId, number> {
  return Object.fromEntries(getDecorIds().map((id) => [id, 0])) as Record<DecorId, number>
}

export function withDecorCounts(counts: Partial<Record<DecorId, number>>): Record<DecorId, number> {
  return { ...buildEmptyDecorCounts(), ...counts }
}

export function getDecorCatalogEntry(decorId: DecorId): DecorCatalogEntry {
  const entry = DECOR_CATALOG.decors[decorId]
  if (!entry) throw new Error(`decorCatalog: unknown decor ${decorId}`)
  return entry
}

export function getDecorAssetPath(decorId: DecorId): string {
  return getDecorCatalogEntry(decorId).src
}

export function getDecorFarmClick(decorId: string): DecorFarmClick | null {
  if (!getDecorIds().includes(decorId as DecorId)) return null
  return getDecorCatalogEntry(decorId as DecorId).farmClick ?? null
}

export function countOwnedDecor(state: {
  inventory: { decors: Record<string, number> }
  farm: { placedDecors: { decorId: string }[] }
}, decorId: DecorId): number {
  const bag = state.inventory.decors[decorId] ?? 0
  const placed = state.farm.placedDecors.filter((item) => item.decorId === decorId).length
  return bag + placed
}

export function buildDecorOffers(): readonly DecorOffer[] {
  return decorEntries().map(([decorId, entry]) => ({
    decorId,
    name: entry.name,
    price: entry.price,
    src: entry.src,
    defaultWidth: entry.defaultWidth,
    ...(entry.max !== undefined ? { max: entry.max } : {}),
  }))
}

decorEntries()
