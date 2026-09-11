import { getFurnitureEntry, getFurnitureIds, type FurnitureId } from '../game/furnitureCatalog'
import { normalizeItemCount } from '../game/gameCatalog'
import { furnitureCounts } from '../game/furnitureCatalog'
import type { GameMutationResult, GameState } from '../game/gameTypes'
import type { HouseDecorPlacement, HouseSurface } from '../farm/farmTypes'

const clone = (s: GameState): GameState => ({ ...s, wallet: { ...s.wallet }, inventory: { ...s.inventory, decors: { ...s.inventory.decors }, furniture: furnitureCounts(s.inventory.furniture ?? {}) }, house: { placedDecors: (s.house?.placedDecors ?? []).map((x) => ({ ...x })) } })
const validId = (id: string): id is FurnitureId => getFurnitureIds().includes(id as FurnitureId)
const validSurface = (s: string): s is HouseSurface => ['floor', 'left-wall', 'right-wall'].includes(s)
const house = (s: GameState) => s.house ?? (s.house = { placedDecors: [] })
const norm = (x: HouseDecorPlacement): HouseDecorPlacement => ({ ...x, left: Math.max(0, Math.min(100, Math.round(x.left * 100) / 100)), top: Math.max(0, Math.min(100, Math.round(x.top * 100) / 100)), width: Math.max(2, Math.min(60, Math.round(x.width * 100) / 100)), zIndex: Math.max(0, Math.min(30, Math.round(x.zIndex))), rotation: ((Math.round(x.rotation ?? 0) % 360) + 360) % 360 })

export function placeHouseDecor(state: GameState, decorId: string, surface: HouseSurface, view: GameMutationResult['state']): GameMutationResult & { instance?: HouseDecorPlacement } {
  if (!validId(decorId) || !validSurface(surface)) return { ok: false, code: 'UNKNOWN_ITEM', message: '素材不可用', game: clone(state), state: view }
  if ((state.inventory.furniture?.[decorId as FurnitureId] ?? 0) < 1) return { ok: false, code: 'INSUFFICIENT_STOCK', message: '请先在家具商店购买', game: clone(state), state: view }
  const i = house(state).placedDecors.length
  const instance = norm({ instanceId: `house-${decorId}-${Date.now()}-${i}`, decorId, surface, left: surface === 'left-wall' ? 28 : surface === 'right-wall' ? 62 : 42, top: surface === 'floor' ? 58 : 28, width: getFurnitureEntry(decorId).defaultWidth, zIndex: i + 1 })
  const game = clone(state)
  game.inventory.furniture![decorId as FurnitureId] = normalizeItemCount((game.inventory.furniture?.[decorId as FurnitureId] ?? 0) - 1)
  house(game).placedDecors.push(instance)
  return { ok: true, game, state: view, instance }
}

export function removeHouseDecor(state: GameState, instanceId: string, view: GameMutationResult['state']): GameMutationResult {
  const target = house(state).placedDecors.find((x) => x.instanceId === instanceId)
  if (!target) return { ok: false, code: 'INVALID_STATE', message: '找不到该素材', game: clone(state), state: view }
  const game = clone(state)
  house(game).placedDecors = house(game).placedDecors.filter((x) => x.instanceId !== instanceId)
  game.inventory.furniture![target.decorId as FurnitureId] = normalizeItemCount((game.inventory.furniture?.[target.decorId as FurnitureId] ?? 0) + 1)
  return { ok: true, game, state: view }
}

export function saveHouseDecors(state: GameState, placements: HouseDecorPlacement[], view: GameMutationResult['state']): GameMutationResult {
  if (!Array.isArray(placements) || placements.length !== house(state).placedDecors.length) return { ok: false, code: 'INVALID_STATE', message: '摆放数据无效', game: clone(state), state: view }
  const ids = new Set(house(state).placedDecors.map((x) => x.instanceId))
  if (placements.some((x) => !x || !ids.has(x.instanceId) || !validId(x.decorId) || !validSurface(x.surface))) return { ok: false, code: 'INVALID_STATE', message: '摆放数据无效', game: clone(state), state: view }
  const game = clone(state)
  house(game).placedDecors = placements.map(norm)
  return { ok: true, game, state: view }
}
