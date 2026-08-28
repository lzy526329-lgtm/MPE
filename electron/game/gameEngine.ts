import { createDefaultFarm, settle, unlockPlot, type FarmActionResult } from '../farm/farmEngine'
import type { CropId, FarmState } from '../farm/farmTypes'
import { mergeLegacyProduce, mergeLegacySeeds, plotUnlockRequirement } from '../farm/farmCatalog'
import { INITIAL_COINS, SEED_OFFERS, normalizeItemCount, seedCounts } from './gameCatalog'
import type {
  FarmCoreState,
  FarmGameMutationResult,
  GameActionResult,
  GameMutationResult,
  GameState,
  GameViewState,
  InventoryState,
} from './gameTypes'

export type LegacyGameInput = {
  now: number
  petCoins?: number
  farm: FarmState | null
}

function cloneRecord(record: Record<string, number>): Record<string, number> {
  return { ...record }
}

function cloneInventory(inventory: InventoryState): InventoryState {
  return {
    food: cloneRecord(inventory.food),
    seeds: { ...inventory.seeds },
    produce: cloneRecord(inventory.produce),
  }
}

function cloneFarmCore(farm: FarmCoreState): FarmCoreState {
  return {
    ...farm,
    plots: farm.plots.map((plot) => ({ ...plot })),
  }
}

function cloneGameState(state: GameState): GameState {
  return {
    version: state.version,
    wallet: { ...state.wallet },
    inventory: cloneInventory(state.inventory),
    farm: cloneFarmCore(state.farm),
    migrations: { ...state.migrations },
  }
}

function splitFarmState(farm: FarmState): {
  farmCore: FarmCoreState
  seeds: Record<CropId, number>
  produce: Record<string, number>
} {
  const { seeds, inventory, ...farmCore } = farm
  return {
    farmCore: cloneFarmCore(farmCore),
    seeds: mergeLegacySeeds(seeds) as Record<CropId, number>,
    produce: mergeLegacyProduce(inventory),
  }
}

function resolveLegacyCoins(petCoins?: number): number {
  const coins = normalizeItemCount(petCoins)
  return coins > 0 ? coins : INITIAL_COINS
}

export function createDefaultGameState(now: number): GameState {
  const defaultFarm = createDefaultFarm(now)
  const { farmCore, seeds, produce } = splitFarmState(defaultFarm)

  return {
    version: 1,
    wallet: { coins: INITIAL_COINS },
    inventory: {
      food: {},
      seeds,
      produce,
    },
    farm: farmCore,
    migrations: {
      starterCoinsGranted: true,
      legacyPetImported: false,
      legacyFarmImported: false,
    },
  }
}

export function migrateLegacyGameState(input: LegacyGameInput): GameState {
  const defaultFarm = createDefaultFarm(input.now)
  const legacy = input.farm ?? defaultFarm
  const { farmCore, seeds, produce } = splitFarmState(legacy)

  return {
    version: 1,
    wallet: { coins: resolveLegacyCoins(input.petCoins) },
    inventory: {
      food: {},
      seeds,
      produce,
    },
    farm: farmCore,
    migrations: {
      starterCoinsGranted: true,
      legacyPetImported: input.petCoins !== undefined,
      legacyFarmImported: input.farm !== null,
    },
  }
}

export function toGameViewState(state: GameState): GameViewState {
  return {
    wallet: { ...state.wallet },
    inventory: cloneInventory(state.inventory),
    seedOffers: SEED_OFFERS.map((offer) => ({ ...offer })),
  }
}

/**
 * Last-resort view for renderers when neither the save nor a cached state can be
 * reached. It stays renderable while making it obvious that nothing was loaded.
 */
export function emptyGameViewState(): GameViewState {
  return {
    wallet: { coins: 0 },
    inventory: { food: {}, seeds: seedCounts(), produce: {} },
    seedOffers: SEED_OFFERS.map((offer) => ({ ...offer })),
  }
}

export function toCompatFarmState(state: GameState): FarmState {
  return {
    ...cloneFarmCore(state.farm),
    seeds: mergeLegacySeeds(state.inventory.seeds as Record<string, number>) as Record<
      CropId,
      number
    >,
    inventory: mergeLegacyProduce(state.inventory.produce),
  }
}

export function applyCompatFarmState(state: GameState, farm: FarmState): GameState {
  const { farmCore, seeds, produce } = splitFarmState(farm)

  return {
    ...cloneGameState(state),
    farm: farmCore,
    inventory: {
      ...cloneInventory(state.inventory),
      seeds,
      produce,
    },
  }
}

export function runFarmAction(
  state: GameState,
  action: (farm: FarmState) => FarmActionResult,
): FarmGameMutationResult {
  const farm = action(toCompatFarmState(state))
  const game = applyCompatFarmState(state, farm.state)

  return farm.ok ? { ok: true, game, farm } : { ok: false, game, farm }
}

export function unlockPlotWithPayment(
  state: GameState,
  plotIndex: number,
  playerLevel: number,
  now: number,
): FarmGameMutationResult {
  const settledGame = applyCompatFarmState(state, settle(toCompatFarmState(state), now))
  const requirement = plotUnlockRequirement(plotIndex)
  const farmView = toCompatFarmState(settledGame)

  if (!requirement) {
    return {
      ok: false,
      game: cloneGameState(settledGame),
      farm: { ok: false, error: '这块地无需解锁', state: farmView },
    }
  }

  if (playerLevel < requirement.level) {
    return {
      ok: false,
      game: cloneGameState(settledGame),
      farm: {
        ok: false,
        error: `需要等级 ${requirement.level} 才能解锁`,
        state: farmView,
      },
    }
  }

  if (settledGame.wallet.coins < requirement.coins) {
    return {
      ok: false,
      game: cloneGameState(settledGame),
      farm: { ok: false, error: '金币不足', state: farmView },
    }
  }

  const unlocked = unlockPlot(farmView, plotIndex)
  if (!unlocked.ok) {
    return { ok: false, game: cloneGameState(settledGame), farm: unlocked }
  }

  const game: GameState = {
    ...applyCompatFarmState(settledGame, unlocked.state),
    wallet: { coins: settledGame.wallet.coins - requirement.coins },
  }

  return { ok: true, game, farm: unlocked }
}

export function buySeed(state: GameState, cropId: string): GameMutationResult {
  const offer = SEED_OFFERS.find((item) => item.cropId === cropId)
  const view = toGameViewState(state)

  if (!offer) {
    return {
      ok: false,
      code: 'UNKNOWN_ITEM',
      message: '未知商品',
      game: cloneGameState(state),
      state: view,
    }
  }

  if (state.wallet.coins < offer.price) {
    return {
      ok: false,
      code: 'INSUFFICIENT_COINS',
      message: '金币不足',
      game: cloneGameState(state),
      state: view,
    }
  }

  const game: GameState = {
    ...cloneGameState(state),
    wallet: { coins: state.wallet.coins - offer.price },
    inventory: {
      ...cloneInventory(state.inventory),
      seeds: {
        ...state.inventory.seeds,
        [offer.cropId]: state.inventory.seeds[offer.cropId] + 1,
      },
    },
  }

  return {
    ok: true,
    game,
    state: toGameViewState(game),
  }
}

export function toGameActionResult(result: GameMutationResult): GameActionResult {
  if (result.ok) {
    return { ok: true, state: result.state }
  }

  return {
    ok: false,
    code: result.code,
    message: result.message,
    state: result.state,
  }
}
