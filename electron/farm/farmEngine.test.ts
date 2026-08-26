import { describe, expect, it } from 'vitest'

import { DEFAULT_SEEDS, DAILY_SEEDS } from './farmCatalog'
import {
  claimDailySeeds,
  clearWithered,
  createDefaultFarm,
  harvest,
  plant,
  rollOpenEvents,
  settle,
  squashBug,
  water,
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

function witheredPlot(state: FarmState, index = 0): PlotPlanted {
  const plot = state.plots[index]
  expect(plot.status).toBe('withered')
  return plot as PlotPlanted
}

function plantLettuce(state = createDefaultFarm(T0), now = T0): FarmState {
  const planted = plant(state, 0, 'lettuce', now)
  expect(planted.ok).toBe(true)
  if (!planted.ok) return state
  return planted.state
}

function growReadyLettuce(): FarmState {
  let state = plantLettuce()

  state = settle(state, T0 + 40_000)
  const firstWater = water(state, 0, T0 + 40_000)
  expect(firstWater.ok).toBe(true)
  if (!firstWater.ok) return state

  state = settle(firstWater.state, T0 + 80_000)
  const secondWater = water(state, 0, T0 + 80_000)
  expect(secondWater.ok).toBe(true)
  if (!secondWater.ok) return state

  return settle(secondWater.state, T0 + 120_000)
}

describe('farmEngine default state', () => {
  it('creates six empty plots with starter seeds and clear weather', () => {
    const state = createDefaultFarm(T0)

    expect(state).toMatchObject({
      version: 1,
      plotCount: 6,
      weather: 'clear',
      lastSettledAt: T0,
      seeds: DEFAULT_SEEDS,
      inventory: {},
    })
    expect(state.plots).toHaveLength(6)
    expect(state.plots.every((plot) => plot.status === 'empty')).toBe(true)
  })
})

describe('farmEngine settle', () => {
  it('matures lettuce when watered and enough time passes', () => {
    const state = growReadyLettuce()

    expect(state.plots[0]).toMatchObject({ status: 'ready' })
  })

  it('pauses growth while lettuce is short of water', () => {
    const state = plantLettuce()

    const settled = settle(state, T0 + 80_000)

    const plot = growingPlot(settled)
    expect(plot.progressMs).toBe(45_000)
  })

  it('withers lettuce when drought lasts past twice the water interval', () => {
    const state = plantLettuce()

    const settled = settle(state, T0 + 91_000)

    expect(witheredPlot(settled).progressMs).toBe(45_000)
  })

  it('keeps a crop ready when it matured before later drought would wither it', () => {
    const planted = plantLettuce()
    const state: FarmState = {
      ...planted,
      lastSettledAt: T0 + 100_000,
      plots: planted.plots.map((plot, index) =>
        index === 0 && plot.status === 'growing'
          ? { ...plot, lastWateredAt: T0 + 100_000, progressMs: 100_000 }
          : plot,
      ),
    }

    const settled = settle(state, T0 + 300_000)

    expect(settled.plots[0]).toMatchObject({ status: 'ready', progressMs: 120_000 })
  })

  it('extends the water interval while raining', () => {
    const state = {
      ...plantLettuce(),
      weather: 'rain' as const,
    }

    const settled = settle(state, T0 + 60_000)

    const plot = growingPlot(settled)
    expect(plot.progressMs).toBe(60_000)
  })

  it('slows growth by half when a plot has a bug', () => {
    const state = plantLettuce()
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
    const state = plantLettuce()

    const settled = settle(state, T0 - 1_000)

    expect(settled.lastSettledAt).toBe(T0 - 1_000)
    expect(growingPlot(settled).progressMs).toBe(0)
  })
})

describe('farmEngine actions', () => {
  it('plants by consuming one seed and initializing the plot', () => {
    const state = createDefaultFarm(T0)

    const planted = plant(state, 0, 'tomato', T0 + 10)

    expect(planted.ok).toBe(true)
    if (!planted.ok) return
    expect(planted.state.seeds.tomato).toBe(DEFAULT_SEEDS.tomato - 1)
    expect(planted.state.plots[0]).toMatchObject({
      status: 'growing',
      cropId: 'tomato',
      plantedAt: T0 + 10,
      lastWateredAt: T0 + 10,
      progressMs: 0,
    })
  })

  it('waters a growing or ready plot', () => {
    const state = plantLettuce()
    const watered = water(state, 0, T0 + 30_000)
    expect(watered.ok).toBe(true)
    if (!watered.ok) return

    const readyState = growReadyLettuce()
    const readyWatered = water(readyState, 0, T0 + 150_000)
    expect(readyWatered.ok).toBe(true)
    if (!readyWatered.ok) return
    expect(readyPlot(readyWatered.state).lastWateredAt).toBe(T0 + 150_000)
  })

  it('clears a bug from a planted plot', () => {
    const state = plantLettuce()
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

  it('harvests a ready plot into inventory and empties the plot', () => {
    const state = growReadyLettuce()

    const harvested = harvest(state, 0, T0 + 120_000, () => 0.99)

    expect(harvested.ok).toBe(true)
    if (!harvested.ok) return
    expect(harvested.state.inventory.lettuce).toBe(2)
    expect(harvested.state.plots[0]).toEqual({ status: 'empty' })
  })

  it('clears withered plots without refunding seeds', () => {
    const state = settle(plantLettuce(), T0 + 91_000)

    const cleared = clearWithered(state, 0)

    expect(cleared.ok).toBe(true)
    if (!cleared.ok) return
    expect(cleared.state.plots[0]).toEqual({ status: 'empty' })
    expect(cleared.state.seeds.lettuce).toBe(DEFAULT_SEEDS.lettuce - 1)
  })

  it('grants daily seeds once per local day', () => {
    const dayOne = new Date(2026, 7, 26, 9).getTime()
    const dayTwo = new Date(2026, 7, 27, 9).getTime()
    const state = createDefaultFarm(dayOne)

    const firstClaim = claimDailySeeds(state, dayOne)
    expect(firstClaim.ok).toBe(true)
    if (!firstClaim.ok) return
    expect(firstClaim.state.seeds.lettuce).toBe(DEFAULT_SEEDS.lettuce + DAILY_SEEDS.lettuce)
    expect(firstClaim.state.seeds.tomato).toBe(DEFAULT_SEEDS.tomato + DAILY_SEEDS.tomato)

    const duplicateClaim = claimDailySeeds(firstClaim.state, dayOne + 60_000)
    expect(duplicateClaim.ok).toBe(false)
    expect(duplicateClaim.state).toEqual(firstClaim.state)

    const nextDayClaim = claimDailySeeds(firstClaim.state, dayTwo)
    expect(nextDayClaim.ok).toBe(true)
  })
})

describe('farmEngine rollOpenEvents', () => {
  it('adds bugs to growing plots and rolls weather after cooldown', () => {
    const planted = plantLettuce()
    const state: FarmState = {
      ...planted,
      lastWeatherRollAt: T0 - 30 * 60_000 - 1,
    } as FarmState
    const rolls = [0.1, 0.2]

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
