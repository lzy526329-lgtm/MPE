import {
  countOwnedDecor,
  getDecorCatalogEntry,
  getDecorIds,
  type DecorId,
} from '../game/decorCatalog'
import { decorCounts, normalizeItemCount } from '../game/gameCatalog'
import type { GameMutationResult, GameState } from '../game/gameTypes'
import type { PlacedDecor } from './farmTypes'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function clampZIndex(value: number): number {
  return Math.max(0, Math.min(30, Math.round(value)))
}

function cloneInventory(state: GameState) {
  return {
    food: { ...state.inventory.food },
    supplies: { ...state.inventory.supplies },
    seeds: { ...state.inventory.seeds },
    produce: { ...state.inventory.produce },
    decors: { ...state.inventory.decors },
  }
}

function cloneGame(state: GameState): GameState {
  return {
    version: state.version,
    wallet: { ...state.wallet },
    inventory: cloneInventory(state),
    farm: {
      ...state.farm,
      plots: state.farm.plots.map((plot) => ({ ...plot })),
      placedDecors: state.farm.placedDecors.map((decor) => ({ ...decor })),
    },
    migrations: { ...state.migrations },
  }
}

function isDecorId(value: string): value is DecorId {
  return getDecorIds().includes(value as DecorId)
}

export function normalizePlacedDecor(value: PlacedDecor): PlacedDecor {
  const normalized: PlacedDecor = {
    instanceId: value.instanceId,
    decorId: value.decorId,
    left: round2(value.left),
    top: round2(value.top),
    width: round2(Math.max(2, Math.min(60, value.width))),
    zIndex: clampZIndex(value.zIndex),
  }
  if (value.flipX) normalized.flipX = true
  return normalized
}

export function parsePlacedDecor(value: unknown): PlacedDecor | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (typeof item.instanceId !== 'string' || item.instanceId.trim().length === 0) return null
  if (typeof item.decorId !== 'string' || !isDecorId(item.decorId)) return null
  if (typeof item.left !== 'number' || !Number.isFinite(item.left)) return null
  if (typeof item.top !== 'number' || !Number.isFinite(item.top)) return null
  if (typeof item.width !== 'number' || !Number.isFinite(item.width)) return null
  if (typeof item.zIndex !== 'number' || !Number.isFinite(item.zIndex)) return null
  return normalizePlacedDecor({
    instanceId: item.instanceId,
    decorId: item.decorId,
    left: item.left,
    top: item.top,
    width: item.width,
    zIndex: item.zIndex,
    flipX: item.flipX === true,
  })
}

export function parsePlacedDecors(value: unknown): PlacedDecor[] {
  if (!Array.isArray(value)) return []
  return value.map(parsePlacedDecor).filter((item): item is PlacedDecor => item !== null)
}

function defaultPlacement(decorId: DecorId, index: number): Pick<PlacedDecor, 'left' | 'top' | 'width' | 'zIndex'> {
  const entry = getDecorCatalogEntry(decorId)
  return {
    left: round2(10 + (index % 4) * 4),
    top: round2(20 + Math.floor(index / 4) * 6),
    width: entry.defaultWidth,
    zIndex: 1 + index,
  }
}

export function buyDecor(state: GameState, decorId: string, view: GameMutationResult['state']): GameMutationResult {
  if (!isDecorId(decorId)) {
    return { ok: false, code: 'UNKNOWN_ITEM', message: '未知商品', game: cloneGame(state), state: view }
  }

  const offer = getDecorCatalogEntry(decorId)
  if (offer.max !== undefined) {
    const owned = countOwnedDecor(state, decorId)
    if (owned >= offer.max) {
      return {
        ok: false,
        code: 'INVALID_STATE',
        message: `最多购买 ${offer.max} 个`,
        game: cloneGame(state),
        state: view,
      }
    }
  }

  if (state.wallet.coins < offer.price) {
    return {
      ok: false,
      code: 'INSUFFICIENT_COINS',
      message: '金币不足',
      game: cloneGame(state),
      state: view,
    }
  }

  const game: GameState = {
    ...cloneGame(state),
    wallet: { coins: state.wallet.coins - offer.price },
    inventory: {
      ...cloneInventory(state),
      decors: {
        ...state.inventory.decors,
        [decorId]: state.inventory.decors[decorId] + 1,
      },
    },
  }

  return { ok: true, game, state: view }
}

export function placeDecor(
  state: GameState,
  decorId: DecorId,
  view: GameMutationResult['state'],
): GameMutationResult & { instance?: PlacedDecor } {
  if (!isDecorId(decorId)) {
    return { ok: false, code: 'UNKNOWN_ITEM', message: '未知装饰', game: cloneGame(state), state: view }
  }

  const owned = state.inventory.decors[decorId] ?? 0
  if (owned < 1) {
    return {
      ok: false,
      code: 'INSUFFICIENT_STOCK',
      message: '装饰库存不足',
      game: cloneGame(state),
      state: view,
    }
  }

  const placement = defaultPlacement(decorId, state.farm.placedDecors.length)
  const instance = normalizePlacedDecor({
    instanceId: `${decorId}-${Date.now()}-${state.farm.placedDecors.length}`,
    decorId,
    ...placement,
  })

  const decors = { ...state.inventory.decors }
  const remaining = owned - 1
  if (remaining > 0) decors[decorId] = remaining
  else decors[decorId] = 0

  const game: GameState = {
    ...cloneGame(state),
    inventory: {
      ...cloneInventory(state),
      decors,
    },
    farm: {
      ...state.farm,
      plots: state.farm.plots.map((plot) => ({ ...plot })),
      placedDecors: [...state.farm.placedDecors, instance],
    },
  }

  return { ok: true, game, state: view, instance }
}

export function savePlacedDecors(
  state: GameState,
  decors: PlacedDecor[],
  view: GameMutationResult['state'],
): GameMutationResult {
  const existingIds = new Set(state.farm.placedDecors.map((item) => item.instanceId))
  const normalized = decors.map(parsePlacedDecor).filter((item): item is PlacedDecor => item !== null)

  if (normalized.length !== decors.length) {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: '装饰数据无效',
      game: cloneGame(state),
      state: view,
    }
  }

  for (const decor of normalized) {
    if (!existingIds.has(decor.instanceId)) {
      return {
        ok: false,
        code: 'INVALID_STATE',
        message: '存在未拥有的装饰实例',
        game: cloneGame(state),
        state: view,
      }
    }
  }

  if (normalized.length !== state.farm.placedDecors.length) {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: '装饰数量不匹配',
      game: cloneGame(state),
      state: view,
    }
  }

  const game: GameState = {
    ...cloneGame(state),
    farm: {
      ...state.farm,
      plots: state.farm.plots.map((plot) => ({ ...plot })),
      placedDecors: normalized,
    },
  }

  return { ok: true, game, state: view }
}

export function removePlacedDecor(
  state: GameState,
  instanceId: string,
  view: GameMutationResult['state'],
): GameMutationResult {
  const target = state.farm.placedDecors.find((item) => item.instanceId === instanceId)
  if (!target || !isDecorId(target.decorId)) {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: '装饰不存在',
      game: cloneGame(state),
      state: view,
    }
  }

  const decorId = target.decorId
  const game: GameState = {
    ...cloneGame(state),
    inventory: {
      ...cloneInventory(state),
      decors: {
        ...state.inventory.decors,
        [decorId]: normalizeItemCount(state.inventory.decors[decorId] + 1),
      },
    },
    farm: {
      ...state.farm,
      plots: state.farm.plots.map((plot) => ({ ...plot })),
      placedDecors: state.farm.placedDecors.filter((item) => item.instanceId !== instanceId),
    },
  }

  return { ok: true, game, state: view }
}

export function ensureDecorInventory(state: GameState): GameState {
  return {
    ...state,
    inventory: {
      ...state.inventory,
      decors: decorCounts(state.inventory.decors),
    },
    farm: {
      ...state.farm,
      placedDecors: parsePlacedDecors(state.farm.placedDecors),
    },
  }
}
