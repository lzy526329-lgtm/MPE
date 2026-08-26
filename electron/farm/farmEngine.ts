import {
  BUG_CHANCE,
  DAILY_SEEDS,
  DEFAULT_SEEDS,
  PLOT_COUNT,
  RAIN_CHANCE,
  WEATHER_COOLDOWN_MS,
  getCrop,
} from './farmCatalog'
import type { CropId, FarmState, PlotPlanted, PlotState, Weather } from './farmTypes'

export type FarmActionResult =
  | { ok: true; state: FarmState }
  | { ok: false; error: string; state: FarmState }

type FarmStateWithEvents = FarmState & { lastWeatherRollAt?: number }

function cloneRecord(record: Record<string, number>): Record<string, number> {
  return { ...record }
}

function localDateKey(now: number): string {
  const date = new Date(now)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function waterIntervalForWeather(cropId: CropId, weather: Weather): number {
  const interval = getCrop(cropId).waterIntervalMs
  return weather === 'rain' ? interval * 1.5 : interval
}

function advancePlot(plot: PlotState, from: number, now: number, weather: Weather): PlotState {
  if (plot.status !== 'growing') {
    return plot
  }

  const crop = getCrop(plot.cropId)
  const waterIntervalMs = waterIntervalForWeather(plot.cropId, weather)
  const witherAt = plot.lastWateredAt + 2 * waterIntervalMs

  if (now > witherAt) {
    const growthUntilDrought = Math.max(0, Math.min(waterIntervalMs, witherAt - Math.max(from, plot.lastWateredAt)))
    const growthDelta = plot.hasBug ? growthUntilDrought * 0.5 : growthUntilDrought
    const progressMs = Math.min(crop.growMs, plot.progressMs + growthDelta)
    if (progressMs >= crop.growMs) {
      return {
        ...plot,
        status: 'ready',
        progressMs: crop.growMs,
      }
    }

    return {
      ...plot,
      status: 'withered',
      progressMs,
    }
  }

  const growthWindowEnd = Math.min(now, plot.lastWateredAt + waterIntervalMs)
  const growthMs = Math.max(0, growthWindowEnd - from)
  const growthDelta = plot.hasBug ? growthMs * 0.5 : growthMs
  const progressMs = Math.min(crop.growMs, plot.progressMs + growthDelta)

  if (progressMs >= crop.growMs) {
    return {
      ...plot,
      status: 'ready',
      progressMs: crop.growMs,
    }
  }

  return {
    ...plot,
    progressMs,
  }
}

function replacePlot(state: FarmState, plotIndex: number, plot: PlotState): FarmState {
  return {
    ...state,
    plots: state.plots.map((current, index) => (index === plotIndex ? plot : current)),
  }
}

function validPlot(state: FarmState, plotIndex: number): boolean {
  return Number.isInteger(plotIndex) && plotIndex >= 0 && plotIndex < state.plots.length
}

function failure(state: FarmState, error: string): FarmActionResult {
  return { ok: false, error, state }
}

function success(state: FarmState): FarmActionResult {
  return { ok: true, state }
}

export function createDefaultFarm(now: number): FarmState {
  return {
    version: 1,
    plotCount: PLOT_COUNT,
    plots: Array.from({ length: PLOT_COUNT }, () => ({ status: 'empty' })),
    inventory: {},
    seeds: cloneRecord(DEFAULT_SEEDS),
    weather: 'clear',
    lastSettledAt: now,
  }
}

export function settle(state: FarmState, now: number): FarmState {
  if (now < state.lastSettledAt) {
    return { ...state, lastSettledAt: now }
  }

  const from = state.lastSettledAt
  return {
    ...state,
    plots: state.plots.map((plot) => advancePlot(plot, from, now, state.weather)),
    lastSettledAt: now,
  }
}

export function plant(state: FarmState, plotIndex: number, cropId: CropId, now: number): FarmActionResult {
  if (!validPlot(state, plotIndex)) {
    return failure(state, 'Invalid plot')
  }

  const plot = state.plots[plotIndex]
  if (plot.status !== 'empty') {
    return failure(state, 'Plot is not empty')
  }

  const seedCount = state.seeds[cropId] ?? 0
  if (seedCount < 1) {
    return failure(state, 'Not enough seeds')
  }

  return success(
    replacePlot(
      {
        ...state,
        seeds: {
          ...state.seeds,
          [cropId]: seedCount - 1,
        },
      },
      plotIndex,
      {
        status: 'growing',
        cropId,
        plantedAt: now,
        lastWateredAt: now,
        progressMs: 0,
      },
    ),
  )
}

export function water(state: FarmState, plotIndex: number, now: number): FarmActionResult {
  if (!validPlot(state, plotIndex)) {
    return failure(state, 'Invalid plot')
  }

  const plot = state.plots[plotIndex]
  if (plot.status !== 'growing' && plot.status !== 'ready') {
    return failure(state, 'Plot cannot be watered')
  }

  return success(replacePlot(state, plotIndex, { ...plot, lastWateredAt: now }))
}

export function squashBug(state: FarmState, plotIndex: number): FarmActionResult {
  if (!validPlot(state, plotIndex)) {
    return failure(state, 'Invalid plot')
  }

  const plot = state.plots[plotIndex]
  if (plot.status === 'empty' || !plot.hasBug) {
    return failure(state, 'No bug to squash')
  }

  const nextPlot: PlotPlanted = { ...plot }
  delete nextPlot.hasBug
  return success(replacePlot(state, plotIndex, nextPlot))
}

export const debugPlot = squashBug

export function harvest(
  state: FarmState,
  plotIndex: number,
  _now: number,
  rng: () => number = Math.random,
): FarmActionResult {
  if (!validPlot(state, plotIndex)) {
    return failure(state, 'Invalid plot')
  }

  const plot = state.plots[plotIndex]
  if (plot.status !== 'ready') {
    return failure(state, 'Plot is not ready')
  }

  const crop = getCrop(plot.cropId)
  const span = crop.yieldMax - crop.yieldMin + 1
  const roll = Math.max(0, Math.min(0.999999999, rng()))
  const amount = crop.yieldMin + Math.floor(roll * span)

  return success(
    replacePlot(
      {
        ...state,
        inventory: {
          ...state.inventory,
          [crop.yieldItemId]: (state.inventory[crop.yieldItemId] ?? 0) + amount,
        },
      },
      plotIndex,
      { status: 'empty' },
    ),
  )
}

export function clearWithered(state: FarmState, plotIndex: number): FarmActionResult {
  if (!validPlot(state, plotIndex)) {
    return failure(state, 'Invalid plot')
  }

  if (state.plots[plotIndex].status !== 'withered') {
    return failure(state, 'Plot is not withered')
  }

  return success(replacePlot(state, plotIndex, { status: 'empty' }))
}

export function claimDailySeeds(state: FarmState, now: number): FarmActionResult {
  const today = localDateKey(now)
  if (state.lastDailySeedClaimAt === today) {
    return failure(state, 'Daily seeds already claimed')
  }

  const seeds = cloneRecord(state.seeds)
  for (const [cropId, amount] of Object.entries(DAILY_SEEDS)) {
    seeds[cropId] = (seeds[cropId] ?? 0) + amount
  }

  return success({
    ...state,
    seeds,
    lastDailySeedClaimAt: today,
  })
}

export function rollOpenEvents(state: FarmState, now: number, rng: () => number = Math.random): FarmState {
  const withBugs: FarmState = {
    ...state,
    plots: state.plots.map((plot) => {
      if (plot.status !== 'growing' || plot.hasBug) {
        return plot
      }

      return rng() < BUG_CHANCE ? { ...plot, hasBug: true } : plot
    }),
  }

  const eventState = withBugs as FarmStateWithEvents
  const shouldRollWeather =
    eventState.lastWeatherRollAt === undefined || now - eventState.lastWeatherRollAt > WEATHER_COOLDOWN_MS

  if (!shouldRollWeather) {
    return withBugs
  }

  return {
    ...withBugs,
    weather: rng() < RAIN_CHANCE ? 'rain' : 'clear',
    lastWeatherRollAt: now,
  } as FarmStateWithEvents
}
