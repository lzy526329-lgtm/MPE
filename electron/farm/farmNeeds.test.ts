import { describe, expect, it } from 'vitest'

import { createDefaultFarm, plant, settle } from './farmEngine'
import { detectFarmNeeds } from './farmNeeds'
import type { FarmState, PlotPlanted } from './farmTypes'

const T0 = 1_000_000
const WHEAT_WATER_MS = 5 * 60_000

function plantWheat(state = createDefaultFarm(T0), now = T0): FarmState {
  const planted = plant(state, 0, 'wheat', now)
  expect(planted.ok).toBe(true)
  if (!planted.ok) return state
  return planted.state
}

function withBug(state: FarmState, index = 0): FarmState {
  return {
    ...state,
    plots: state.plots.map((plot, i) =>
      i === index && (plot.status === 'growing' || plot.status === 'ready')
        ? { ...plot, hasBug: true }
        : plot,
    ),
  }
}

describe('detectFarmNeeds', () => {
  it('finds nothing on an empty farm', () => {
    expect(detectFarmNeeds(createDefaultFarm(T0), T0)).toEqual([])
  })

  it('reports water when a growing crop is past its interval', () => {
    const state = plantWheat()
    expect(detectFarmNeeds(state, T0 + WHEAT_WATER_MS + 1)).toEqual(['water'])
  })

  it('does not report water before the interval elapses', () => {
    expect(detectFarmNeeds(plantWheat(), T0 + WHEAT_WATER_MS)).toEqual([])
  })

  it('does not report water during rain', () => {
    const state = { ...plantWheat(), weather: 'rain' as const }
    expect(detectFarmNeeds(state, T0 + WHEAT_WATER_MS + 1)).toEqual([])
  })

  it('reports bug on an infested growing crop instead of water', () => {
    const state = withBug(plantWheat())
    expect(detectFarmNeeds(state, T0 + WHEAT_WATER_MS + 1)).toEqual(['bug'])
  })

  it('reports harvest when a crop is ready', () => {
    const grown = settle({ ...plantWheat(), weather: 'rain' }, T0 + 21 * 60_000)
    expect((grown.plots[0] as PlotPlanted).status).toBe('ready')
    expect(detectFarmNeeds(grown, T0 + 21 * 60_000)).toEqual(['harvest'])
  })

  it('orders harvest before bug before water across plots', () => {
    const planted: PlotPlanted = {
      status: 'growing',
      cropId: 'wheat',
      plantedAt: T0,
      lastWateredAt: T0,
      progressMs: 0,
    }
    const state: FarmState = {
      ...createDefaultFarm(T0),
      plots: [
        { ...planted, status: 'ready', progressMs: 20 * 60_000 },
        { ...planted, hasBug: true },
        { ...planted, lastWateredAt: T0 },
        ...createDefaultFarm(T0).plots.slice(3),
      ],
    }

    expect(detectFarmNeeds(state, T0 + WHEAT_WATER_MS + 1)).toEqual(['harvest', 'bug', 'water'])
  })
})
