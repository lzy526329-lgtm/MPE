import {
  BUG_CHANCE,
  CROPS,
  DAILY_SEEDS,
  DEFAULT_SEEDS,
  INITIAL_UNLOCKED_PLOTS,
  PLOT_COUNT,
  RAIN_CHANCE,
  WEATHER_COOLDOWN_MS,
  getCrop,
  isPlotLocked,
  plotUnlockRequirement,
} from './farmCatalog'
import type { CropId, FarmState, PlotPlanted, PlotState, Weather } from './farmTypes'

export type FarmActionResult =
  | { ok: true; state: FarmState; context?: import('./farmTypes').FarmPageContext }
  | { ok: false; error: string; state: FarmState; context?: import('./farmTypes').FarmPageContext }

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
  return weather === 'rain' ? interval * 2 : interval
}

function isRainAutoWater(weather: Weather): boolean {
  return weather === 'rain'
}

function isCropId(cropId: string): cropId is CropId {
  return cropId in CROPS
}

function advancePlot(plot: PlotState, from: number, now: number, weather: Weather): PlotState {
  if (plot.status !== 'growing') {
    return plot
  }

  const crop = getCrop(plot.cropId)
  const waterIntervalMs = waterIntervalForWeather(plot.cropId, weather)
  const growthStart = Math.max(from, plot.plantedAt)
  const droughtAt = isRainAutoWater(weather) ? Number.POSITIVE_INFINITY : plot.lastWateredAt + waterIntervalMs

  const growthWindowEnd = Math.min(now, droughtAt)
  const growthMs = Math.max(0, growthWindowEnd - growthStart)
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

export function createDefaultPlots(): PlotState[] {
  return Array.from({ length: PLOT_COUNT }, (_, index) =>
    index < INITIAL_UNLOCKED_PLOTS ? { status: 'empty' } : { status: 'locked' },
  )
}

/** 旧存档（全部为空地）：前 4 格可用，其余锁定。已有 locked 状态的存档保留玩家解锁结果。 */
export function migratePlotLocks(plots: PlotState[]): PlotState[] {
  const hasLockState = plots.some((plot) => plot.status === 'locked')
  if (hasLockState) {
    return plots.map((plot, index) =>
      index < INITIAL_UNLOCKED_PLOTS && plot.status === 'locked' ? { status: 'empty' } : plot,
    )
  }

  return plots.map((plot, index) => {
    if (index < INITIAL_UNLOCKED_PLOTS) {
      return plot.status === 'locked' ? { status: 'empty' } : plot
    }
    if (plot.status === 'growing' || plot.status === 'ready') return plot
    return { status: 'locked' }
  })
}

export function createDefaultFarm(now: number): FarmState {
  return {
    version: 1,
    plotCount: PLOT_COUNT,
    plots: createDefaultPlots(),
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
    return failure(state, '地块无效')
  }

  if (!isCropId(cropId)) {
    return failure(state, '未知作物')
  }

  const plot = state.plots[plotIndex]
  if (isPlotLocked(plot)) {
    return failure(state, '这块地还没解锁')
  }
  if (plot.status !== 'empty') {
    return failure(state, '这块地已经有作物了')
  }

  const seedCount = state.seeds[cropId] ?? 0
  if (seedCount < 1) {
    return failure(state, `${getCrop(cropId).name}种子不够了，请先点下方「领种子」`)
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
    return failure(state, '地块无效')
  }

  const plot = state.plots[plotIndex]
  if (isPlotLocked(plot)) {
    return failure(state, '这块地还没解锁')
  }
  if (plot.status !== 'growing' && plot.status !== 'ready') {
    return failure(state, '这块地现在不用浇水')
  }

  return success(replacePlot(state, plotIndex, { ...plot, lastWateredAt: now }))
}

export function waterAll(state: FarmState, now: number): FarmActionResult {
  let next = state
  let watered = 0
  for (let i = 0; i < next.plots.length; i += 1) {
    const plot = next.plots[i]
    if (plot.status === 'growing' || plot.status === 'ready') {
      next = replacePlot(next, i, { ...plot, lastWateredAt: now })
      watered += 1
    }
  }
  if (watered === 0) {
    return failure(state, '没有需要浇水的地块')
  }
  return success(next)
}

export function harvestAll(
  state: FarmState,
  now: number,
  rng: () => number = Math.random,
): FarmActionResult {
  let next = state
  let harvested = 0
  for (let i = 0; i < next.plots.length; i += 1) {
    if (next.plots[i].status !== 'ready') continue
    const result = harvest(next, i, now, rng)
    if (!result.ok) continue
    next = result.state
    harvested += 1
  }
  if (harvested === 0) {
    return failure(state, '没有可收割的作物')
  }
  return success(next)
}

export function squashBug(state: FarmState, plotIndex: number): FarmActionResult {
  if (!validPlot(state, plotIndex)) {
    return failure(state, '地块无效')
  }

  const plot = state.plots[plotIndex]
  if (plot.status === 'locked') {
    return failure(state, '这块地还没解锁')
  }
  if (plot.status === 'empty' || !plot.hasBug) {
    return failure(state, '这里没有虫子')
  }

  const nextPlot: PlotPlanted = { ...plot }
  delete nextPlot.hasBug
  return success(replacePlot(state, plotIndex, nextPlot))
}

export function harvest(
  state: FarmState,
  plotIndex: number,
  _now: number,
  rng: () => number = Math.random,
): FarmActionResult {
  if (!validPlot(state, plotIndex)) {
    return failure(state, '地块无效')
  }

  const plot = state.plots[plotIndex]
  if (isPlotLocked(plot)) {
    return failure(state, '这块地还没解锁')
  }
  if (plot.status !== 'ready') {
    return failure(state, '还没成熟，不能收割')
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

export function unlockPlot(state: FarmState, plotIndex: number): FarmActionResult {
  if (!validPlot(state, plotIndex)) {
    return failure(state, '地块无效')
  }

  const plot = state.plots[plotIndex]
  if (!isPlotLocked(plot)) {
    return failure(state, '这块地已经解锁了')
  }

  if (!plotUnlockRequirement(plotIndex)) {
    return failure(state, '这块地无需解锁')
  }

  return success(replacePlot(state, plotIndex, { status: 'empty' }))
}

export function claimDailySeeds(state: FarmState, now: number): FarmActionResult {
  const today = localDateKey(now)
  if (state.lastDailySeedClaimAt === today) {
    return failure(state, '今天的免费种子已经领过了')
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
      if (plot.status !== 'growing' || plot.hasBug || isPlotLocked(plot)) {
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
