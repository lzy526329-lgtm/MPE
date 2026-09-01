import { createDefaultFarm, settle, unlockPlot, type FarmActionResult } from '../farm/farmEngine'
import type { CropId, FarmState } from '../farm/farmTypes'
import { mergeLegacyProduce, mergeLegacySeeds, plotUnlockRequirement } from '../farm/farmCatalog'
import { farmLevelFromTotalXp, grantFarmExperience } from '../farm/farmLevel'
import { UNLOCK_PLOT_XP } from '../farm/farmLevelCatalog'
import { INITIAL_COINS, PRODUCE_OFFERS, SEED_OFFERS, FOOD_OFFERS, SUPPLY_OFFERS, normalizeItemCount, seedCounts, foodCounts, supplyCounts } from './gameCatalog'
import type { FoodId, SupplyId } from './gameTypes'
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
    supplies: cloneRecord(inventory.supplies),
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
      food: foodCounts(),
      supplies: supplyCounts(),
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
      food: foodCounts(),
      supplies: supplyCounts(),
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
    produceOffers: PRODUCE_OFFERS.map((offer) => ({ ...offer })),
    foodOffers: FOOD_OFFERS.map((offer) => ({ ...offer })),
    supplyOffers: SUPPLY_OFFERS.map((offer) => ({ ...offer })),
  }
}

/**
 * Last-resort view for renderers when neither the save nor a cached state can be
 * reached. It stays renderable while making it obvious that nothing was loaded.
 */
export function emptyGameViewState(): GameViewState {
  return {
    wallet: { coins: 0 },
    inventory: { food: foodCounts(), supplies: supplyCounts(), seeds: seedCounts(), produce: {} },
    seedOffers: SEED_OFFERS.map((offer) => ({ ...offer })),
    produceOffers: PRODUCE_OFFERS.map((offer) => ({ ...offer })),
    foodOffers: FOOD_OFFERS.map((offer) => ({ ...offer })),
    supplyOffers: SUPPLY_OFFERS.map((offer) => ({ ...offer })),
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

export function runFarmActionWithXp(
  state: GameState,
  action: (farm: FarmState) => FarmActionResult,
  xpAmount: number,
  rng: () => number = Math.random,
): FarmGameMutationResult & { levelUpMessage?: string } {
  const result = runFarmAction(state, action)
  if (!result.ok || xpAmount <= 0) {
    return result
  }

  const grant = grantFarmExperience(result.game, xpAmount, rng)
  return {
    ok: result.ok,
    game: grant.game,
    farm: result.farm,
    levelUpMessage: grant.levelUpMessage,
  }
}

export function unlockPlotWithPayment(
  state: GameState,
  plotIndex: number,
  now: number,
  rng: () => number = Math.random,
): FarmGameMutationResult & { levelUpMessage?: string } {
  const settledGame = applyCompatFarmState(state, settle(toCompatFarmState(state), now))
  const requirement = plotUnlockRequirement(plotIndex)
  const farmView = toCompatFarmState(settledGame)
  const farmLevel = farmLevelFromTotalXp(settledGame.farm.totalXp ?? 0)

  if (!requirement) {
    return {
      ok: false,
      game: cloneGameState(settledGame),
      farm: { ok: false, error: '这块地无需解锁', state: farmView },
    }
  }

  if (farmLevel < requirement.level) {
    return {
      ok: false,
      game: cloneGameState(settledGame),
      farm: {
        ok: false,
        error: `需要农场 Lv.${requirement.level} 才能解锁`,
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

  const grant = grantFarmExperience(game, UNLOCK_PLOT_XP, rng)
  return {
    ok: true,
    game: grant.game,
    farm: unlocked,
    levelUpMessage: grant.levelUpMessage,
  }
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

export function sellProduce(state: GameState, produceId: string): GameMutationResult {
  const offer = PRODUCE_OFFERS.find((item) => item.produceId === produceId)
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

  const owned = state.inventory.produce[produceId] ?? 0
  if (owned < 1) {
    return {
      ok: false,
      code: 'INSUFFICIENT_STOCK',
      message: '库存不足',
      game: cloneGameState(state),
      state: view,
    }
  }

  const produce = cloneRecord(state.inventory.produce)
  const remaining = owned - 1
  if (remaining > 0) produce[produceId] = remaining
  else delete produce[produceId]

  const game: GameState = {
    ...cloneGameState(state),
    wallet: { coins: state.wallet.coins + offer.price },
    inventory: {
      ...cloneInventory(state.inventory),
      produce,
    },
  }

  return {
    ok: true,
    game,
    state: toGameViewState(game),
  }
}

export function buyFood(state: GameState, foodId: string): GameMutationResult {
  const offer = FOOD_OFFERS.find((item) => item.foodId === foodId)
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
      food: {
        ...state.inventory.food,
        [offer.foodId]: state.inventory.food[offer.foodId] + 1,
      },
    },
  }

  return {
    ok: true,
    game,
    state: toGameViewState(game),
  }
}

export function useFood(state: GameState, foodId: string): GameMutationResult {
  const entry = FOOD_OFFERS.find((item) => item.foodId === foodId)
  const view = toGameViewState(state)

  if (!entry) {
    return {
      ok: false,
      code: 'UNKNOWN_ITEM',
      message: '未知商品',
      game: cloneGameState(state),
      state: view,
    }
  }

  const owned = state.inventory.food[entry.foodId as FoodId] ?? 0
  if (owned < 1) {
    return {
      ok: false,
      code: 'INSUFFICIENT_STOCK',
      message: '库存不足',
      game: cloneGameState(state),
      state: view,
    }
  }

  const food = { ...state.inventory.food }
  const remaining = owned - 1
  if (remaining > 0) food[entry.foodId as FoodId] = remaining
  else food[entry.foodId as FoodId] = 0

  const game: GameState = {
    ...cloneGameState(state),
    inventory: {
      ...cloneInventory(state.inventory),
      food,
    },
  }

  return {
    ok: true,
    game,
    state: toGameViewState(game),
  }
}

export function buySupply(state: GameState, supplyId: string): GameMutationResult {
  const offer = SUPPLY_OFFERS.find((item) => item.supplyId === supplyId)
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
      supplies: {
        ...state.inventory.supplies,
        [offer.supplyId]: state.inventory.supplies[offer.supplyId] + 1,
      },
    },
  }

  return {
    ok: true,
    game,
    state: toGameViewState(game),
  }
}

export function useSupply(state: GameState, supplyId: string): GameMutationResult {
  const entry = SUPPLY_OFFERS.find((item) => item.supplyId === supplyId)
  const view = toGameViewState(state)

  if (!entry) {
    return {
      ok: false,
      code: 'UNKNOWN_ITEM',
      message: '未知商品',
      game: cloneGameState(state),
      state: view,
    }
  }

  const owned = state.inventory.supplies[entry.supplyId as SupplyId] ?? 0
  if (owned < 1) {
    return {
      ok: false,
      code: 'INSUFFICIENT_STOCK',
      message: '库存不足',
      game: cloneGameState(state),
      state: view,
    }
  }

  const supplies = { ...state.inventory.supplies }
  const remaining = owned - 1
  if (remaining > 0) supplies[entry.supplyId as SupplyId] = remaining
  else supplies[entry.supplyId as SupplyId] = 0

  const game: GameState = {
    ...cloneGameState(state),
    inventory: {
      ...cloneInventory(state.inventory),
      supplies,
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
