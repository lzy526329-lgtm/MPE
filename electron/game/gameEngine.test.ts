import { describe, expect, it } from 'vitest'

import { claimDailySeeds, harvest, plant } from '../farm/farmEngine'
import type { FarmState } from '../farm/farmTypes'
import {
  applyCompatFarmState,
  buySeed,
  createDefaultGameState,
  migrateLegacyGameState,
  runFarmAction,
  toCompatFarmState,
  toGameActionResult,
  unlockPlotWithPayment,
} from './gameEngine'

const legacyFarm: FarmState = {
  version: 1,
  plotCount: 24,
  plots: Array.from({ length: 24 }, () => ({ status: 'empty' })),
  seeds: { lettuce: 2, tomato: 1, pumpkin: 0 },
  inventory: { lettuce: 3, tomato: 1 },
  weather: 'rain',
  lastSettledAt: 500,
}

describe('createDefaultGameState', () => {
  it('creates a new game with 100 coins and default wheat seeds', () => {
    const state = createDefaultGameState(1_000)
    expect(state.wallet.coins).toBe(100)
    expect(state.inventory.seeds).toEqual({ wheat: 5 })
    expect(state.migrations.starterCoinsGranted).toBe(true)
  })
})

describe('migrateLegacyGameState', () => {
  it('keeps positive legacy coins and merges farm inventory into wheat', () => {
    const state = migrateLegacyGameState({ now: 1_000, petCoins: 37, farm: legacyFarm })
    expect(state.wallet.coins).toBe(37)
    expect(state.inventory.seeds).toEqual({ wheat: 3 })
    expect(state.inventory.produce).toEqual({ wheat: 4 })
  })

  it('grants 100 coins when legacy coins are zero', () => {
    expect(migrateLegacyGameState({ now: 1_000, petCoins: 0, farm: legacyFarm }).wallet.coins).toBe(100)
  })

  it.each([
    [42.7, 42],
    [-5, 100],
    [Number.NaN, 100],
    [Number.POSITIVE_INFINITY, 100],
    [undefined, 100],
  ])('normalizes legacy coins %s to %s', (petCoins, expected) => {
    expect(migrateLegacyGameState({ now: 1_000, petCoins, farm: legacyFarm }).wallet.coins).toBe(
      expected,
    )
  })

  it('marks the pet import only when legacy pet coins existed', () => {
    expect(
      migrateLegacyGameState({ now: 1_000, petCoins: 12, farm: legacyFarm }).migrations,
    ).toEqual({
      starterCoinsGranted: true,
      legacyPetImported: true,
      legacyFarmImported: true,
    })
    expect(migrateLegacyGameState({ now: 1_000, farm: null }).migrations).toEqual({
      starterCoinsGranted: true,
      legacyPetImported: false,
      legacyFarmImported: false,
    })
  })

  it('does not alias the legacy farm plots into the migrated state', () => {
    const source: FarmState = {
      ...legacyFarm,
      plots: legacyFarm.plots.map(() => ({ status: 'empty' as const })),
    }

    const migrated = migrateLegacyGameState({ now: 1_000, petCoins: 5, farm: source })
    migrated.farm.plots[0] = {
      status: 'growing',
      cropId: 'wheat',
      plantedAt: 1,
      lastWateredAt: 1,
      progressMs: 0,
    }

    expect(source.plots[0]).toEqual({ status: 'empty' })
    expect(migrated.farm.plots).not.toBe(source.plots)
  })
})

describe('buySeed', () => {
  it('buys one wheat seed without mutating the input', () => {
    const before = createDefaultGameState(1_000)
    const result = buySeed(before, 'wheat')
    expect(result.ok).toBe(true)
    expect(result.state.wallet.coins).toBe(95)
    expect(result.state.inventory.seeds.wheat).toBe(6)
    expect(result.game.wallet.coins).toBe(95)
    expect(before.wallet.coins).toBe(100)
    expect(before.inventory.seeds.wheat).toBe(5)
  })

  it('does not change state when coins are insufficient', () => {
    const before = { ...createDefaultGameState(1_000), wallet: { coins: 4 } }
    const result = buySeed(before, 'wheat')
    expect(result).toMatchObject({ ok: false, code: 'INSUFFICIENT_COINS' })
    expect(result.state.wallet.coins).toBe(4)
    expect(result.state.inventory.seeds.wheat).toBe(5)
  })

  it('rejects an unknown item', () => {
    expect(buySeed(createDefaultGameState(1_000), 'rice')).toMatchObject({
      ok: false,
      code: 'UNKNOWN_ITEM',
    })
  })
})

describe('farm compat mapping', () => {
  it('maps unified inventory to compat farm view', () => {
    const game = createDefaultGameState(1_000)
    game.inventory.produce = { wheat: 2 }
    const farm = toCompatFarmState(game)
    expect(farm.seeds).toEqual(game.inventory.seeds)
    expect(farm.inventory).toEqual(game.inventory.produce)
    expect(farm.weather).toBe(game.farm.weather)
    expect(farm.plots).toEqual(game.farm.plots)
  })

  it('syncs compat farm inventory back to unified state', () => {
    const game = createDefaultGameState(1_000)
    const farm = toCompatFarmState(game)
    const updatedFarm: FarmState = {
      ...farm,
      seeds: { ...farm.seeds, wheat: 1 },
      inventory: { ...farm.inventory, wheat: 5 },
    }
    const next = applyCompatFarmState(game, updatedFarm)
    expect(next.inventory.seeds.wheat).toBe(1)
    expect(next.inventory.produce).toEqual({ wheat: 5 })
    expect(next.wallet).toEqual(game.wallet)
  })
})

describe('runFarmAction', () => {
  it('plants by consuming the unified seed inventory', () => {
    const game = createDefaultGameState(1_000)
    const result = runFarmAction(game, (farm) => plant(farm, 0, 'wheat', 1_000))

    expect(result.ok).toBe(true)
    expect(result.game.inventory.seeds.wheat).toBe(4)
    expect(result.farm.state.plots[0].status).toBe('growing')
  })

  it('adds daily seeds to unified inventory', () => {
    const game = createDefaultGameState(1_000)
    const result = runFarmAction(game, (farm) => claimDailySeeds(farm, 1_000))

    expect(result.game.inventory.seeds).toEqual({ wheat: 8 })
  })

  it('moves harvest yield into unified produce inventory', () => {
    const game = createDefaultGameState(1_000)
    game.farm.plots[0] = {
      status: 'ready',
      cropId: 'wheat',
      plantedAt: 0,
      lastWateredAt: 0,
      progressMs: 20 * 60_000,
    }

    const result = runFarmAction(game, (farm) => harvest(farm, 0, 1_000, () => 0))

    expect(result.game.inventory.produce.wheat).toBe(1)
  })
})

describe('toGameActionResult', () => {
  it('strips internal game state from mutation results', () => {
    const result = buySeed(createDefaultGameState(1_000), 'wheat')
    const action = toGameActionResult(result)
    expect(action.ok).toBe(true)
    expect(action.state.wallet.coins).toBe(95)
    expect('game' in action).toBe(false)
  })

  it.each([
    ['INSUFFICIENT_COINS', 'wheat', 4, '金币不足'],
    ['UNKNOWN_ITEM', 'rice', 100, '未知商品'],
  ] as const)('keeps the %s failure renderable without internal state', (code, cropId, coins, message) => {
    const before = { ...createDefaultGameState(1_000), wallet: { coins } }

    const action = toGameActionResult(buySeed(before, cropId))

    expect(action).toEqual({
      ok: false,
      code,
      message,
      state: {
        wallet: { coins },
        inventory: before.inventory,
        seedOffers: [{ cropId: 'wheat', name: '小麦种子', price: 5 }],
      },
    })
    expect('game' in action).toBe(false)
  })
})

describe('game state immutability', () => {
  it('never aliases nested wallet, inventory or farm data through a purchase', () => {
    const before = createDefaultGameState(1_000)
    const result = buySeed(before, 'wheat')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.game.wallet).not.toBe(before.wallet)
    expect(result.game.inventory).not.toBe(before.inventory)
    expect(result.game.inventory.seeds).not.toBe(before.inventory.seeds)
    expect(result.game.inventory.food).not.toBe(before.inventory.food)
    expect(result.game.inventory.produce).not.toBe(before.inventory.produce)
    expect(result.game.farm).not.toBe(before.farm)
    expect(result.game.farm.plots).not.toBe(before.farm.plots)
    expect(result.game.farm.plots[0]).not.toBe(before.farm.plots[0])
    expect(result.game.migrations).not.toBe(before.migrations)
    expect(result.state.wallet).not.toBe(result.game.wallet)
    expect(result.state.inventory.seeds).not.toBe(result.game.inventory.seeds)

    result.game.farm.plots[0] = {
      status: 'growing',
      cropId: 'wheat',
      plantedAt: 1,
      lastWateredAt: 1,
      progressMs: 0,
    }
    result.game.inventory.produce.wheat = 9
    result.state.inventory.seeds.wheat = 99

    expect(before.farm.plots[0]).toEqual({ status: 'empty' })
    expect(before.inventory.produce).toEqual({})
    expect(before.inventory.seeds.wheat).toBe(5)
    expect(result.game.inventory.seeds.wheat).toBe(6)
  })

  it('never aliases nested data through the compat farm round trip', () => {
    const game = createDefaultGameState(1_000)
    const farm = toCompatFarmState(game)

    expect(farm.plots).not.toBe(game.farm.plots)
    expect(farm.plots[0]).not.toBe(game.farm.plots[0])
    expect(farm.seeds).not.toBe(game.inventory.seeds)
    expect(farm.inventory).not.toBe(game.inventory.produce)

    const next = applyCompatFarmState(game, farm)

    expect(next.farm.plots).not.toBe(farm.plots)
    expect(next.farm.plots[0]).not.toBe(farm.plots[0])
    expect(next.inventory.seeds).not.toBe(farm.seeds)
    expect(next.inventory.produce).not.toBe(farm.inventory)
    expect(next.wallet).not.toBe(game.wallet)
  })
})

describe('gameEngine unlockPlotWithPayment', () => {
  it('unlocks a plot and deducts coins when level is sufficient', () => {
    const game = createDefaultGameState(1_000)
    const result = unlockPlotWithPayment(game, 4, 0, 1_000)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.game.wallet.coins).toBe(85)
    expect(result.game.farm.plots[4]).toEqual({ status: 'empty' })
  })

  it('rejects unlock when level is too low', () => {
    const game = createDefaultGameState(1_000)
    const result = unlockPlotWithPayment(game, 9, 0, 1_000)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.farm.error).toContain('等级')
    expect(result.game.wallet.coins).toBe(100)
  })

  it('rejects unlock when coins are insufficient', () => {
    const game = { ...createDefaultGameState(1_000), wallet: { coins: 5 } }
    const result = unlockPlotWithPayment(game, 4, 0, 1_000)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.farm.error).toContain('金币')
  })
})
