import fs from 'node:fs'
import path from 'node:path'

import { createDefaultFarm } from '../farm/farmEngine'
import { parseFarmPayload } from '../farm/farmStore'
import type { FarmState } from '../farm/farmTypes'
import { migrateLegacyGameState } from './gameEngine'
import { normalizeItemCount, seedCounts, foodCounts } from './gameCatalog'
import type { FarmCoreState, GameState } from './gameTypes'

export type PersistableMutation = { ok: boolean; game: GameState }
export type GameMutator<T extends PersistableMutation> = (state: GameState) => T | Promise<T>

export type GameStoreFileOps = {
  existsSync: typeof fs.existsSync
  mkdirSync: typeof fs.mkdirSync
  readFileSync: typeof fs.readFileSync
  renameSync: typeof fs.renameSync
  unlinkSync: typeof fs.unlinkSync
  writeFileSync: typeof fs.writeFileSync
}

export type GameLoadOutcome = {
  state: GameState
  /** The stored bytes differ from the canonical serialization of `state`. */
  dirty: boolean
  /** The stored bytes could not be parsed at all and need a corrupt backup. */
  corrupt: boolean
}

const defaultFileOps: GameStoreFileOps = {
  existsSync: fs.existsSync,
  mkdirSync: fs.mkdirSync,
  readFileSync: fs.readFileSync,
  renameSync: fs.renameSync,
  unlinkSync: fs.unlinkSync,
  writeFileSync: fs.writeFileSync,
}

let gameQueue: Promise<void> = Promise.resolve()

function resolveFileOps(fileOps: Partial<GameStoreFileOps>): GameStoreFileOps {
  return { ...defaultFileOps, ...fileOps }
}

function gameFile(userDataPath: string): string {
  return path.join(userDataPath, 'game.json')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function serializeGame(state: GameState): string {
  return JSON.stringify(state, null, 2)
}

function normalizeCountRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([key, count]) => [key, normalizeItemCount(count)]),
  )
}

/**
 * Migration flags are recovered field by field. A parseable `game.json` always
 * means initialization already happened, so an unreadable flag defaults to
 * `true` and can never trigger a second starter grant or legacy re-import.
 */
function parseMigrations(value: unknown): GameState['migrations'] {
  const source = isRecord(value) ? value : {}
  const flag = (candidate: unknown): boolean =>
    typeof candidate === 'boolean' ? candidate : true
  return {
    starterCoinsGranted: flag(source.starterCoinsGranted),
    legacyPetImported: flag(source.legacyPetImported),
    legacyFarmImported: flag(source.legacyFarmImported),
  }
}

/**
 * A damaged farm subtree is rebuilt from the default farm instead of discarding
 * the whole save, so the wallet, inventory and migration flags survive.
 */
function parseFarmCore(
  value: unknown,
  now: number,
  seeds: Record<string, number>,
  produce: Record<string, number>,
): FarmCoreState {
  if (isRecord(value)) {
    const candidate = { ...value, seeds, inventory: produce }
    const fallbackNow =
      typeof value.lastSettledAt === 'number' && Number.isFinite(value.lastSettledAt)
        ? value.lastSettledAt
        : now
    const parsed = parseFarmPayload(JSON.stringify(candidate), fallbackNow)
    if (!parsed.didReset) {
      const { seeds: _seeds, inventory: _inventory, ...farm } = parsed.state
      return farm
    }
  }
  const { seeds: _defaultSeeds, inventory: _defaultProduce, ...farm } = createDefaultFarm(now)
  return farm
}

export function parseGamePayload(raw: string, now: number): GameState {
  const value = JSON.parse(raw) as unknown
  if (!isRecord(value) || value.version !== 1) throw new Error('Invalid game payload')

  const wallet = isRecord(value.wallet) ? value.wallet : {}
  const inventory = isRecord(value.inventory) ? value.inventory : {}
  const food = foodCounts(normalizeCountRecord(inventory.food))
  const seeds = seedCounts(normalizeCountRecord(inventory.seeds))
  const produce = normalizeCountRecord(inventory.produce)

  return {
    version: 1,
    wallet: { coins: normalizeItemCount(wallet.coins) },
    inventory: { food, seeds, produce },
    farm: parseFarmCore(value.farm, now, seeds, produce),
    migrations: parseMigrations(value.migrations),
  }
}

function moveCorruptGame(filePath: string, now: number, ops: GameStoreFileOps): void {
  if (!ops.existsSync(filePath)) return
  const baseTarget = `${filePath}.corrupt.${now}`
  let target = baseTarget
  let suffix = 1
  while (ops.existsSync(target)) {
    target = `${baseTarget}.${suffix}`
    suffix += 1
  }
  ops.renameSync(filePath, target)
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT'
}

function readLegacyPetCoins(userDataPath: string, ops: GameStoreFileOps): number | undefined {
  let raw: string
  try {
    raw = ops.readFileSync(path.join(userDataPath, 'pet.json'), 'utf8')
  } catch (error) {
    if (isMissingFileError(error)) return undefined
    throw error
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed) || !isRecord(parsed.profile)) return undefined
    return typeof parsed.profile.coins === 'number' ? parsed.profile.coins : undefined
  } catch {
    return undefined
  }
}

function readLegacyFarm(userDataPath: string, now: number, ops: GameStoreFileOps): FarmState | null {
  let raw: string
  try {
    raw = ops.readFileSync(path.join(userDataPath, 'farm.json'), 'utf8')
  } catch (error) {
    if (isMissingFileError(error)) return null
    throw error
  }
  const result = parseFarmPayload(raw, now)
  return result.didReset ? null : result.state
}

function rebuildFromLegacy(
  userDataPath: string,
  now: number,
  ops: GameStoreFileOps,
): GameState {
  return migrateLegacyGameState({
    now,
    petCoins: readLegacyPetCoins(userDataPath, ops),
    farm: readLegacyFarm(userDataPath, now, ops),
  })
}

/**
 * Reads the unified save without ever touching the disk. Callers decide whether
 * the reported repair is worth a write, which keeps high frequency readers such
 * as the pet status poll free of write amplification.
 */
export function readGameState(
  userDataPath: string,
  now: number,
  fileOps: Partial<GameStoreFileOps> = {},
): GameLoadOutcome {
  const ops = resolveFileOps(fileOps)
  const filePath = gameFile(userDataPath)

  if (ops.existsSync(filePath)) {
    const raw = ops.readFileSync(filePath, 'utf8') as string
    try {
      const state = parseGamePayload(raw, now)
      return { state, dirty: serializeGame(state) !== raw, corrupt: false }
    } catch {
      return { state: rebuildFromLegacy(userDataPath, now, ops), dirty: true, corrupt: true }
    }
  }

  return { state: rebuildFromLegacy(userDataPath, now, ops), dirty: true, corrupt: false }
}

/**
 * Reads the unified save and writes back only when the stored bytes are missing,
 * unparseable or non-canonical.
 */
export function loadGame(
  userDataPath: string,
  now: number,
  fileOps: Partial<GameStoreFileOps> = {},
): GameState {
  const ops = resolveFileOps(fileOps)
  const outcome = readGameState(userDataPath, now, ops)
  if (outcome.corrupt) moveCorruptGame(gameFile(userDataPath), now, ops)
  if (outcome.dirty) saveGameAtomic(userDataPath, outcome.state, ops)
  return outcome.state
}

export function saveGameAtomic(
  userDataPath: string,
  state: GameState,
  fileOps: Partial<GameStoreFileOps> = {},
): void {
  const ops = resolveFileOps(fileOps)
  const filePath = gameFile(userDataPath)
  ops.mkdirSync(path.dirname(filePath), { recursive: true })

  const baseTempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  let tempPath = baseTempPath
  let suffix = 1
  while (ops.existsSync(tempPath)) {
    tempPath = `${baseTempPath}-${suffix}`
    suffix += 1
  }

  try {
    ops.writeFileSync(tempPath, serializeGame(state))
    ops.renameSync(tempPath, filePath)
  } catch (error) {
    if (ops.existsSync(tempPath)) {
      try {
        ops.unlinkSync(tempPath)
      } catch {
        // Preserve the original persistence error.
      }
    }
    throw error
  }
}

export function withGame<T extends PersistableMutation>(
  userDataPath: string,
  now: number,
  mutator: GameMutator<T>,
  fileOps: Partial<GameStoreFileOps> = {},
): Promise<T> {
  const run = gameQueue.then(async () => {
    const state = loadGame(userDataPath, now, fileOps)
    const result = await mutator(state)
    if (result.ok) saveGameAtomic(userDataPath, result.game, fileOps)
    return result
  })
  gameQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** Read-only wallet access for high frequency callers; never writes. */
export function peekWalletCoins(
  userDataPath: string,
  now: number,
  fileOps: Partial<GameStoreFileOps> = {},
): number {
  return readGameState(userDataPath, now, fileOps).state.wallet.coins
}
