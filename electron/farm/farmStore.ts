import fs from 'node:fs'
import path from 'node:path'

import { CROPS, mergeLegacyProduce, mergeLegacySeeds, normalizeLegacyCropId, PLOT_COUNT } from './farmCatalog'
import { parsePlacedDecors } from './decorEngine'
import { createDefaultFarm, migratePlotLocks, settle, type FarmActionResult } from './farmEngine'
import type { CropId, FarmState, PlotState } from './farmTypes'

type ParseFarmResult = {
  state: FarmState
  didReset: boolean
}

type FarmMutator = (state: FarmState) => FarmActionResult | Promise<FarmActionResult>

let farmQueue: Promise<void> = Promise.resolve()

function farmFile(userDataPath: string) {
  return path.join(userDataPath, 'farm.json')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false
  return Object.values(value).every((item) => typeof item === 'number' && Number.isFinite(item))
}

function isCropId(value: unknown): value is CropId {
  return value === 'wheat' || normalizeLegacyCropId(value) === 'wheat'
}

function normalizePlot(value: unknown): PlotState {
  if (!isRecord(value) || value.status === 'empty') return { status: 'empty' }
  if (value.status === 'locked') return { status: 'locked' }
  const rawStatus = value.status === 'withered' ? 'growing' : value.status
  if (rawStatus !== 'growing' && rawStatus !== 'ready') {
    return { status: 'empty' }
  }
  const cropId = normalizeLegacyCropId(value.cropId)
  if (
    !cropId ||
    typeof value.plantedAt !== 'number' ||
    !Number.isFinite(value.plantedAt) ||
    typeof value.lastWateredAt !== 'number' ||
    !Number.isFinite(value.lastWateredAt) ||
    typeof value.progressMs !== 'number' ||
    !Number.isFinite(value.progressMs) ||
    (value.hasBug !== undefined && typeof value.hasBug !== 'boolean')
  ) {
    return { status: 'empty' }
  }
  return {
    status: rawStatus,
    cropId,
    plantedAt: value.plantedAt,
    lastWateredAt: value.lastWateredAt,
    progressMs: value.progressMs,
    ...(value.hasBug ? { hasBug: true } : {}),
  }
}

function normalizeFarmPayload(value: unknown, plotCount: number): FarmState | null {
  if (!isRecord(value) || value.version !== 1 || value.plotCount !== plotCount) return null
  if (!Array.isArray(value.plots) || value.plots.length !== plotCount) return null
  if (value.weather !== 'clear' && value.weather !== 'rain') return null
  if (typeof value.lastSettledAt !== 'number' || !Number.isFinite(value.lastSettledAt)) return null
  if (value.lastDailySeedClaimAt !== undefined && typeof value.lastDailySeedClaimAt !== 'string') {
    return null
  }
  if (value.lastWeatherRollAt !== undefined) {
    if (typeof value.lastWeatherRollAt !== 'number' || !Number.isFinite(value.lastWeatherRollAt)) {
      return null
    }
  }

  const seeds = mergeLegacySeeds(isNumberRecord(value.seeds) ? value.seeds : {})
  const inventory = mergeLegacyProduce(isNumberRecord(value.inventory) ? value.inventory : {})
  const plots = migratePlotLocks(value.plots.map(normalizePlot))

  return {
    version: 1,
    plotCount: PLOT_COUNT,
    plots,
    inventory,
    seeds,
    weather: value.weather,
    lastSettledAt: value.lastSettledAt,
    totalXp:
      typeof value.totalXp === 'number' && Number.isFinite(value.totalXp) && value.totalXp >= 0
        ? Math.floor(value.totalXp)
        : 0,
    ...(value.lastDailySeedClaimAt ? { lastDailySeedClaimAt: value.lastDailySeedClaimAt } : {}),
    ...(value.lastWeatherRollAt !== undefined ? { lastWeatherRollAt: value.lastWeatherRollAt } : {}),
    placedDecors: parsePlacedDecors(value.placedDecors),
  }
}

function isPlotState(value: unknown): value is PlotState {
  if (!isRecord(value)) return false
  if (value.status === 'empty' || value.status === 'locked') return true
  if (value.status !== 'growing' && value.status !== 'ready') return false
  return (
    isCropId(value.cropId) &&
    typeof value.plantedAt === 'number' &&
    Number.isFinite(value.plantedAt) &&
    typeof value.lastWateredAt === 'number' &&
    Number.isFinite(value.lastWateredAt) &&
    typeof value.progressMs === 'number' &&
    Number.isFinite(value.progressMs) &&
    (value.hasBug === undefined || typeof value.hasBug === 'boolean')
  )
}

function isFarmState(value: unknown): value is FarmState {
  if (!isRecord(value)) return false
  if (value.version !== 1 || value.plotCount !== PLOT_COUNT) return false
  if (!Array.isArray(value.plots) || value.plots.length !== PLOT_COUNT) return false
  if (!value.plots.every(isPlotState)) return false
  if (!isNumberRecord(value.inventory) || !isNumberRecord(value.seeds)) return false
  if (value.weather !== 'clear' && value.weather !== 'rain') return false
  if (typeof value.lastSettledAt !== 'number' || !Number.isFinite(value.lastSettledAt)) return false
  if (value.lastDailySeedClaimAt !== undefined && typeof value.lastDailySeedClaimAt !== 'string') return false
  if (value.lastWeatherRollAt !== undefined) {
    return typeof value.lastWeatherRollAt === 'number' && Number.isFinite(value.lastWeatherRollAt)
  }
  return true
}

export function parseFarmPayload(raw: string, now: number): ParseFarmResult {
  try {
    const parsed = JSON.parse(raw) as unknown
    const state = normalizeFarmPayload(parsed, PLOT_COUNT)
    if (!state) {
      return { state: createDefaultFarm(now), didReset: true }
    }
    return { state, didReset: false }
  } catch {
    return { state: createDefaultFarm(now), didReset: true }
  }
}

function moveCorruptFarm(filePath: string, now: number) {
  if (!fs.existsSync(filePath)) return
  const baseTarget = `${filePath}.corrupt.${now}`
  let target = baseTarget
  let suffix = 1
  while (fs.existsSync(target)) {
    target = `${baseTarget}.${suffix}`
    suffix += 1
  }
  fs.renameSync(filePath, target)
}

export function saveFarm(userDataPath: string, state: FarmState): void {
  const filePath = farmFile(userDataPath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2))
}

export function loadFarm(userDataPath: string, now: number): FarmState {
  const filePath = farmFile(userDataPath)
  let result: ParseFarmResult

  try {
    result = parseFarmPayload(fs.readFileSync(filePath, 'utf8'), now)
  } catch {
    result = { state: createDefaultFarm(now), didReset: fs.existsSync(filePath) }
  }

  if (result.didReset) {
    moveCorruptFarm(filePath, now)
  }

  const state = settle(result.state, now)
  saveFarm(userDataPath, state)
  return state
}

export function withFarm(userDataPath: string, now: number, mutator: FarmMutator): Promise<FarmActionResult> {
  const run = farmQueue.then(async () => {
    const state = loadFarm(userDataPath, now)
    const result = await mutator(state)
    saveFarm(userDataPath, result.state)
    return result
  })
  farmQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}
