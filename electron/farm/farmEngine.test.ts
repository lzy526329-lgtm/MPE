import { describe, expect, it } from 'vitest'

import { INITIAL_UNLOCKED_PLOTS, DEFAULT_SEEDS, DAILY_SEEDS } from './farmCatalog'
import {
  claimDailySeeds,
  createDefaultFarm,
  harvest,
  harvestAll,
  plant,
  rollOpenEvents,
  settle,
  squashBug,
  unlockPlot,
  migratePlotLocks,
  water,
  waterAll,
} from './farmEngine'
import type { FarmState, PlotPlanted } from './farmTypes'

const T0 = 1_000_000

function growingPlot(state: FarmState, index = 0): PlotPlanted {
  const plot = state.plots[index]
  expect(plot.status).toBe('growing')
  return plot as PlotPlanted
}

function readyPlot(state: FarmState, index = 0): PlotPlanted {
  const plot = state.plots[index]
  expect(plot.status).toBe('ready')
  return plot as PlotPlanted
}

function plantWheat(state = createDefaultFarm(T0), now = T0): FarmState {
  const planted = plant(state, 0, 'wheat', now)
  expect(planted.ok).toBe(true)
  if (!planted.ok) return state
  return planted.state
}

function growReadyWheat(): FarmState {
  const state = { ...plantWheat(), weather: 'rain' as const }
  return settle(state, T0 + 21 * 60_000)
}

describe('farmEngine default state', () => {
  it('creates four unlocked plots and locks the rest by default', () => {
    const state = createDefaultFarm(T0)

    expect(state).toMatchObject({
      version: 1,
      plotCount: 24,
      weather: 'clear',
      lastSettledAt: T0,
      seeds: DEFAULT_SEEDS,
      inventory: {},
    })
    expect(state.plots).toHaveLength(24)
    expect(state.plots.slice(0, INITIAL_UNLOCKED_PLOTS).every((plot) => plot.status === 'empty')).toBe(
      true,
    )
    expect(state.plots.slice(INITIAL_UNLOCKED_PLOTS).every((plot) => plot.status === 'locked')).toBe(
      true,
    )
  })
})

describe('farmEngine settle', () => {
  it('matures wheat when watered and enough time passes', () => {
    const state = growReadyWheat()

    expect(state.plots[0]).toMatchObject({ status: 'ready' })
  })

  it('pauses growth while wheat is short of water', () => {
    const state = plantWheat()

    const settled = settle(state, T0 + 7 * 60_000)

    const plot = growingPlot(settled)
    expect(plot.progressMs).toBe(5 * 60_000)
  })

  it('does not count time before a delayed plant toward progress', () => {
    const state = createDefaultFarm(T0)
    const planted = plant(state, 0, 'wheat', T0 + 10_000)
    expect(planted.ok).toBe(true)
    if (!planted.ok) return

    const settled = settle(planted.state, T0 + 30_000)

    expect(growingPlot(settled).progressMs).toBe(20_000)
  })

  it('keeps growing when drought lasts past three water intervals', () => {
    const state = plantWheat()

    const settled = settle(state, T0 + 16 * 60_000)

    expect(growingPlot(settled).progressMs).toBe(5 * 60_000)
  })

  it('does not advance progress after drought when settle runs again', () => {
    const state = settle(plantWheat(), T0 + 7 * 60_000)

    const settled = settle(state, T0 + 16 * 60_000)

    expect(growingPlot(settled).progressMs).toBe(5 * 60_000)
  })

  it('keeps a crop ready when it matured before extended drought', () => {
    const planted = plantWheat()
    const state: FarmState = {
      ...planted,
      lastSettledAt: T0 + 100_000,
      plots: planted.plots.map((plot, index) =>
        index === 0 && plot.status === 'growing'
          ? { ...plot, lastWateredAt: T0 + 100_000, progressMs: 20 * 60_000 }
          : plot,
      ),
    }

    const settled = settle(state, T0 + 300_000)

    expect(settled.plots[0]).toMatchObject({ status: 'ready', progressMs: 20 * 60_000 })
  })

  it('auto-waters while raining so growth never pauses for drought', () => {
    const state = {
      ...plantWheat(),
      weather: 'rain' as const,
    }

    const settled = settle(state, T0 + 60_000)

    const plot = growingPlot(settled)
    expect(plot.progressMs).toBe(60_000)
  })

  it('slows growth by half when a plot has a bug', () => {
    const state = plantWheat()
    const buggyState: FarmState = {
      ...state,
      plots: state.plots.map((plot, index) =>
        index === 0 && plot.status === 'growing' ? { ...plot, hasBug: true } : plot,
      ),
    }

    const settled = settle(buggyState, T0 + 40_000)

    const plot = growingPlot(settled)
    expect(plot.progressMs).toBe(20_000)
  })

  it('aligns lastSettledAt without advancing plots after clock rollback', () => {
    const state = plantWheat()

    const settled = settle(state, T0 - 1_000)

    expect(settled.lastSettledAt).toBe(T0 - 1_000)
    expect(growingPlot(settled).progressMs).toBe(0)
  })
})

describe('farmEngine actions', () => {
  it('plants by consuming one seed and initializing the plot', () => {
    const state = createDefaultFarm(T0)

    const planted = plant(state, 0, 'wheat', T0 + 10)

    expect(planted.ok).toBe(true)
    if (!planted.ok) return
    expect(planted.state.seeds.wheat).toBe(DEFAULT_SEEDS.wheat - 1)
    expect(planted.state.plots[0]).toMatchObject({
      status: 'growing',
      cropId: 'wheat',
      plantedAt: T0 + 10,
      lastWateredAt: T0 + 10,
      progressMs: 0,
    })
  })

  it('rejects unknown crop ids even when a seed count exists', () => {
    const state: FarmState = {
      ...createDefaultFarm(T0),
      seeds: {
        ...DEFAULT_SEEDS,
        weed: 1,
      },
    }

    const planted = plant(state, 0, 'weed' as never, T0)

    expect(planted.ok).toBe(false)
    expect(planted.state).toEqual(state)
    expect(planted.state.plots[0]).toEqual({ status: 'empty' })
  })

  it('waters a growing or ready plot', () => {
    const state = plantWheat()
    const watered = water(state, 0, T0 + 30_000)
    expect(watered.ok).toBe(true)
    if (!watered.ok) return

    const readyState = growReadyWheat()
    const readyWatered = water(readyState, 0, T0 + 22 * 60_000)
    expect(readyWatered.ok).toBe(true)
    if (!readyWatered.ok) return
    expect(readyPlot(readyWatered.state).lastWateredAt).toBe(T0 + 22 * 60_000)
  })

  it('waters all planted plots at once', () => {
    let state = plantWheat()
    const second = plant(state, 1, 'wheat', T0)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    state = second.state

    const watered = waterAll(state, T0 + 1)
    expect(watered.ok).toBe(true)
    if (!watered.ok) return
    expect(growingPlot(watered.state, 0).lastWateredAt).toBe(T0 + 1)
    expect(growingPlot(watered.state, 1).lastWateredAt).toBe(T0 + 1)
  })

  it('clears a bug from a planted plot', () => {
    const state = plantWheat()
    const buggyState: FarmState = {
      ...state,
      plots: state.plots.map((plot, index) =>
        index === 0 && plot.status === 'growing' ? { ...plot, hasBug: true } : plot,
      ),
    }

    const cleared = squashBug(buggyState, 0)

    expect(cleared.ok).toBe(true)
    if (!cleared.ok) return
    expect(growingPlot(cleared.state).hasBug).toBeUndefined()
  })

  it('harvests all ready plots at once', () => {
    const ready = growReadyWheat()
    const harvested = harvestAll(ready, T0 + 21 * 60_000, () => 0)
    expect(harvested.ok).toBe(true)
    if (!harvested.ok) return
    expect(harvested.state.plots[0].status).toBe('empty')
    expect(harvested.state.inventory.wheat).toBeGreaterThan(0)
  })

  it('harvests a ready plot into inventory and empties the plot', () => {
    const state = growReadyWheat()

    const harvested = harvest(state, 0, T0 + 21 * 60_000, () => 0.99)

    expect(harvested.ok).toBe(true)
    if (!harvested.ok) return
    expect(harvested.state.inventory.wheat).toBe(2)
    expect(harvested.state.plots[0]).toEqual({ status: 'empty' })
  })

  it('rejects planting on locked plots', () => {
    const state = createDefaultFarm(T0)
    const planted = plant(state, 4, 'wheat', T0)
    expect(planted.ok).toBe(false)
    if (!planted.ok) expect(planted.error).toContain('解锁')
  })

  it('unlocks a locked plot into empty land', () => {
    const state = createDefaultFarm(T0)
    const unlocked = unlockPlot(state, 4)
    expect(unlocked.ok).toBe(true)
    if (!unlocked.ok) return
    expect(unlocked.state.plots[4]).toEqual({ status: 'empty' })
  })

  it('keeps player-unlocked empty plots after migratePlotLocks', () => {
    const state = createDefaultFarm(T0)
    const unlocked = unlockPlot(state, 4)
    expect(unlocked.ok).toBe(true)
    if (!unlocked.ok) return

    const migrated = migratePlotLocks(unlocked.state.plots)
    expect(migrated[4]).toEqual({ status: 'empty' })
    expect(migrated[5]).toEqual({ status: 'locked' })
  })

  it('grants daily seeds once per local day', () => {
    const dayOne = new Date(2026, 7, 26, 9).getTime()
    const dayTwo = new Date(2026, 7, 27, 9).getTime()
    const state = createDefaultFarm(dayOne)

    const firstClaim = claimDailySeeds(state, dayOne)
    expect(firstClaim.ok).toBe(true)
    if (!firstClaim.ok) return
    expect(firstClaim.state.seeds.wheat).toBe(DEFAULT_SEEDS.wheat + DAILY_SEEDS.wheat)

    const duplicateClaim = claimDailySeeds(firstClaim.state, dayOne + 60_000)
    expect(duplicateClaim.ok).toBe(false)
    expect(duplicateClaim.state).toEqual(firstClaim.state)

    const nextDayClaim = claimDailySeeds(firstClaim.state, dayTwo)
    expect(nextDayClaim.ok).toBe(true)
  })
})

describe('farmEngine rollOpenEvents', () => {
  it('adds bugs to growing plots and rolls weather after cooldown', () => {
    const planted = plantWheat()
    const state: FarmState = {
      ...planted,
      lastWeatherRollAt: T0 - 30 * 60_000 - 1,
    } as FarmState
    const rolls = [0.05, 0.2]

    const rolled = rollOpenEvents(state, T0, () => rolls.shift() ?? 1)

    expect(rolled.weather).toBe('rain')
    expect(growingPlot(rolled).hasBug).toBe(true)
    expect((rolled as FarmState & { lastWeatherRollAt?: number }).lastWeatherRollAt).toBe(T0)
  })

  it('does not reroll weather before cooldown', () => {
    const state = {
      ...createDefaultFarm(T0),
      weather: 'rain' as const,
      lastWeatherRollAt: T0 - 1_000,
    } as FarmState

    const rolled = rollOpenEvents(state, T0, () => 0.99)

    expect(rolled.weather).toBe('rain')
    expect((rolled as FarmState & { lastWeatherRollAt?: number }).lastWeatherRollAt).toBe(T0 - 1_000)
  })
})
