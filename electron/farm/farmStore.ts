import fs from 'node:fs'
import path from 'node:path'

import { CROPS, PLOT_COUNT } from './farmCatalog'
import { createDefaultFarm, settle, type FarmActionResult } from './farmEngine'
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
  return typeof value === 'string' && value in CROPS
}

function isPlotState(value: unknown): value is PlotState {
  if (!isRecord(value)) return false
  if (value.status === 'empty') return true
  if (value.status !== 'growing' && value.status !== 'ready' && value.status !== 'withered') return false
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
    if (!isFarmState(parsed)) {
      return { state: createDefaultFarm(now), didReset: true }
    }
    return { state: parsed, didReset: false }
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
