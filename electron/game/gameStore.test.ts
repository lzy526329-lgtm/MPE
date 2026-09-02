import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { withSeedCounts } from '../farm/cropCatalog'
import type { FarmState } from '../farm/farmTypes'
import { buySeed, createDefaultGameState } from './gameEngine'
import { foodCounts } from './gameCatalog'
import {
  loadGame,
  parseGamePayload,
  peekWalletCoins,
  readGameState,
  saveGameAtomic,
  type GameStoreFileOps,
  withGame,
} from './gameStore'

const dirs: string[] = []

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mpt-game-'))
  dirs.push(dir)
  return dir
}

type PersistenceCounter = {
  ops: Partial<GameStoreFileOps>
  calls: { write: number; rename: number }
}

function countPersistence(): PersistenceCounter {
  const calls = { write: 0, rename: 0 }
  return {
    calls,
    ops: {
      writeFileSync: ((...args: unknown[]) => {
        calls.write += 1
        return Reflect.apply(writeFileSync, undefined, args)
      }) as typeof writeFileSync,
      renameSync: ((...args: unknown[]) => {
        calls.rename += 1
        return Reflect.apply(renameSync, undefined, args)
      }) as typeof renameSync,
    },
  }
}

function readRawGame(dir: string): Record<string, any> {
  return JSON.parse(readFileSync(join(dir, 'game.json'), 'utf8')) as Record<string, any>
}

function writeRawGame(dir: string, payload: unknown): void {
  writeFileSync(join(dir, 'game.json'), JSON.stringify(payload, null, 2))
}

function corruptBackups(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.startsWith('game.json.corrupt.'))
}

function failReading(target: string, error: Error): typeof readFileSync {
  return ((...args: unknown[]) => {
    if (String(args[0]) === target) throw error
    return Reflect.apply(readFileSync, undefined, args)
  }) as typeof readFileSync
}

function legacyFarm(): FarmState {
  return {
    version: 1,
    plotCount: 24,
    plots: Array.from({ length: 24 }, (_, index) =>
      index === 0
        ? {
            status: 'growing',
            cropId: 'wheat',
            plantedAt: 100,
            lastWateredAt: 400,
            progressMs: 300,
            hasBug: true,
          }
        : { status: 'empty' },
    ),
    seeds: { lettuce: 2, tomato: 1, pumpkin: 0 },
    inventory: { lettuce: 3, tomato: 1 },
    weather: 'rain',
    lastSettledAt: 500,
    totalXp: 0,
    lastDailySeedClaimAt: '2026-08-27',
    lastWeatherRollAt: 450,
    placedDecors: [],
  }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('loadGame migration', () => {
  it('creates and persists the starter economy for a new user', () => {
    const dir = makeDir()

    const state = loadGame(dir, 1_000)

    expect(state.wallet.coins).toBe(100)
    expect(state.inventory.seeds).toEqual(withSeedCounts({ wheat: 5 }))
    expect(existsSync(join(dir, 'game.json'))).toBe(true)
  })

  it('imports legacy pet coins and the complete legacy farm inventory', () => {
    const dir = makeDir()
    const petPath = join(dir, 'pet.json')
    const farmPath = join(dir, 'farm.json')
    const farm = legacyFarm()
    writeFileSync(petPath, JSON.stringify({ profile: { coins: 42 } }))
    writeFileSync(farmPath, JSON.stringify(farm))
    const petBefore = readFileSync(petPath)
    const farmBefore = readFileSync(farmPath)

    const state = loadGame(dir, 1_000)

    expect(state.wallet.coins).toBe(42)
    expect(state.inventory.seeds).toEqual(withSeedCounts({ wheat: 3 }))
    expect(state.inventory.produce).toEqual({ wheat: 4 })
    expect(state.farm.plots[0]).toMatchObject({ status: 'growing', cropId: 'wheat' })
    expect(state.farm.weather).toBe(farm.weather)
    expect(state.farm.lastSettledAt).toBe(farm.lastSettledAt)
    expect(state.farm.lastDailySeedClaimAt).toBe(farm.lastDailySeedClaimAt)
    expect(state.farm.lastWeatherRollAt).toBe(farm.lastWeatherRollAt)
    expect(state.migrations).toEqual({
      starterCoinsGranted: true,
      legacyPetImported: true,
      legacyFarmImported: true,
    })
    expect(existsSync(petPath)).toBe(true)
    expect(existsSync(farmPath)).toBe(true)
    expect(readFileSync(petPath)).toEqual(petBefore)
    expect(readFileSync(farmPath)).toEqual(farmBefore)
  })

  it('grants starter coins only on the first migration when legacy coins are zero', () => {
    const dir = makeDir()
    writeFileSync(join(dir, 'pet.json'), JSON.stringify({ profile: { coins: 0 } }))

    expect(loadGame(dir, 1_000).wallet.coins).toBe(100)
    const saved = loadGame(dir, 1_000)
    saved.wallet.coins = 0
    saveGameAtomic(dir, saved)

    expect(loadGame(dir, 2_000).wallet.coins).toBe(0)
  })

  it('never reimports changed legacy files after game.json exists', () => {
    const dir = makeDir()
    writeFileSync(join(dir, 'pet.json'), JSON.stringify({ profile: { coins: 42 } }))
    writeFileSync(join(dir, 'farm.json'), JSON.stringify(legacyFarm()))
    const first = loadGame(dir, 1_000)
    first.wallet.coins = 7
    first.inventory.seeds.wheat = 9
    saveGameAtomic(dir, first)
    writeFileSync(join(dir, 'pet.json'), JSON.stringify({ profile: { coins: 999 } }))
    const changedFarm = legacyFarm()
    changedFarm.seeds.wheat = 99
    writeFileSync(join(dir, 'farm.json'), JSON.stringify(changedFarm))

    const reloaded = loadGame(dir, 2_000)

    expect(reloaded.wallet.coins).toBe(7)
    expect(reloaded.inventory.seeds.wheat).toBe(9)
  })

  it('propagates a game file read error without marking the save corrupt', () => {
    const dir = makeDir()
    const game = createDefaultGameState(1_000)
    game.wallet.coins = 27
    saveGameAtomic(dir, game)
    const before = readFileSync(join(dir, 'game.json'), 'utf8')
    const readError = Object.assign(new Error('game read denied'), { code: 'EACCES' })

    expect(() =>
      loadGame(dir, 2_000, {
        readFileSync() {
          throw readError
        },
      }),
    ).toThrow(readError)

    expect(readFileSync(join(dir, 'game.json'), 'utf8')).toBe(before)
    expect(readdirSync(dir).filter((name) => name.startsWith('game.json.corrupt.'))).toEqual([])
  })

  it('aborts migration when the legacy pet file cannot be read', () => {
    const dir = makeDir()
    const petPath = join(dir, 'pet.json')
    writeFileSync(petPath, JSON.stringify({ profile: { coins: 42 } }))
    const readError = Object.assign(new Error('pet I/O failed'), { code: 'EIO' })

    expect(() =>
      loadGame(dir, 1_000, {
        readFileSync: failReading(petPath, readError),
      }),
    ).toThrow(readError)

    expect(existsSync(join(dir, 'game.json'))).toBe(false)
  })

  it('aborts migration when the legacy farm file cannot be read', () => {
    const dir = makeDir()
    const farmPath = join(dir, 'farm.json')
    writeFileSync(farmPath, JSON.stringify(legacyFarm()))
    const readError = Object.assign(new Error('farm read denied'), { code: 'EACCES' })

    expect(() =>
      loadGame(dir, 1_000, {
        readFileSync: failReading(farmPath, readError),
      }),
    ).toThrow(readError)

    expect(existsSync(join(dir, 'game.json'))).toBe(false)
  })
})

describe('game payload validation and recovery', () => {
  it('repairs invalid economic counts in an otherwise valid game', () => {
    const game = createDefaultGameState(1_000)
    game.wallet.coins = Number.NaN
    game.inventory.seeds.wheat = -3
    game.inventory.food.cookie = 1.5
    game.inventory.produce.wheat = Number.POSITIVE_INFINITY

    const parsed = parseGamePayload(
      JSON.stringify(game, (_key, value) => {
        if (typeof value === 'number' && !Number.isFinite(value)) return 'invalid'
        return value
      }),
      1_000,
    )

    expect(parsed.wallet.coins).toBe(0)
    expect(parsed.inventory.seeds).toEqual(withSeedCounts({}))
    expect(parsed.inventory.food).toEqual(foodCounts({ cookie: 1 }))
    expect(parsed.inventory.produce).toEqual({ wheat: 0 })
  })

  it('floors finite fractional counts instead of zeroing them', () => {
    const game = createDefaultGameState(1_000)
    game.wallet.coins = 12.9
    game.inventory.seeds.wheat = 4.2
    game.inventory.produce.wheat = 7.999

    const parsed = parseGamePayload(JSON.stringify(game), 1_000)

    expect(parsed.wallet.coins).toBe(12)
    expect(parsed.inventory.seeds.wheat).toBe(4)
    expect(parsed.inventory.produce.wheat).toBe(7)
  })

  it('backs up a corrupt game file before rebuilding it', () => {
    const dir = makeDir()
    writeFileSync(join(dir, 'game.json'), '{broken')

    const state = loadGame(dir, 1_000)

    expect(state.wallet.coins).toBe(100)
    expect(readdirSync(dir).some((name) => name.startsWith('game.json.corrupt.1000'))).toBe(true)
  })
})

describe('subtree recovery without economy loss', () => {
  it('keeps a zeroed wallet and starter flag when the farm subtree is corrupt', () => {
    const dir = makeDir()
    writeFileSync(join(dir, 'pet.json'), JSON.stringify({ profile: { coins: 999 } }))
    const game = createDefaultGameState(1_000)
    game.wallet.coins = 0
    saveGameAtomic(dir, game)
    const raw = readRawGame(dir)
    raw.farm.plots = 'not-an-array'
    writeRawGame(dir, raw)

    const state = loadGame(dir, 2_000)

    expect(state.wallet.coins).toBe(0)
    expect(state.migrations.starterCoinsGranted).toBe(true)
    expect(state.farm.plots).toHaveLength(24)
    expect(state.inventory.seeds).toEqual(withSeedCounts({ wheat: 5 }))
    expect(corruptBackups(dir)).toEqual([])

    const counter = countPersistence()
    expect(loadGame(dir, 3_000, counter.ops).wallet.coins).toBe(0)
    expect(loadGame(dir, 4_000, counter.ops).wallet.coins).toBe(0)
    expect(counter.calls).toEqual({ write: 0, rename: 0 })
  })

  it('reaches a stable file after repairing a reordered save exactly once', () => {
    const dir = makeDir()
    saveGameAtomic(dir, { ...createDefaultGameState(1_000), wallet: { coins: 17 } })
    const raw = readRawGame(dir)
    writeRawGame(dir, {
      migrations: raw.migrations,
      farm: { lastSettledAt: raw.farm.lastSettledAt, ...raw.farm },
      inventory: { produce: raw.inventory.produce, seeds: raw.inventory.seeds },
      wallet: raw.wallet,
      version: 1,
    })
    const counter = countPersistence()

    expect(loadGame(dir, 2_000, counter.ops).wallet.coins).toBe(17)
    expect(counter.calls.write).toBe(1)

    expect(loadGame(dir, 3_000, counter.ops).wallet.coins).toBe(17)
    expect(loadGame(dir, 4_000, counter.ops).wallet.coins).toBe(17)
    expect(counter.calls.write).toBe(1)
    expect(corruptBackups(dir)).toEqual([])
  })

  it('keeps the wallet and inventory when the migrations subtree is corrupt', () => {
    const dir = makeDir()
    writeFileSync(join(dir, 'pet.json'), JSON.stringify({ profile: { coins: 999 } }))
    const game = createDefaultGameState(1_000)
    game.wallet.coins = 0
    game.inventory.seeds.wheat = 11
    saveGameAtomic(dir, game)
    const raw = readRawGame(dir)
    raw.migrations = 'broken'
    writeRawGame(dir, raw)

    const state = loadGame(dir, 2_000)

    expect(state.wallet.coins).toBe(0)
    expect(state.inventory.seeds.wheat).toBe(11)
    expect(state.migrations.starterCoinsGranted).toBe(true)
    expect(corruptBackups(dir)).toEqual([])
  })

  it('keeps the wallet and farm when the inventory subtree is missing', () => {
    const dir = makeDir()
    const game = createDefaultGameState(1_000)
    game.wallet.coins = 3
    saveGameAtomic(dir, game)
    const raw = readRawGame(dir)
    delete raw.inventory
    writeRawGame(dir, raw)

    const state = loadGame(dir, 2_000)

    expect(state.wallet.coins).toBe(3)
    expect(state.inventory.seeds).toEqual(withSeedCounts({}))
    expect(state.inventory.food).toEqual(foodCounts({}))
    expect(state.farm.plots).toHaveLength(24)
    expect(state.migrations.starterCoinsGranted).toBe(true)
    expect(corruptBackups(dir)).toEqual([])
  })

  it('keeps the farm and flags when only the wallet subtree is corrupt', () => {
    const dir = makeDir()
    const game = createDefaultGameState(1_000)
    saveGameAtomic(dir, game)
    const raw = readRawGame(dir)
    raw.wallet = { coins: 'lots' }
    writeRawGame(dir, raw)

    const state = loadGame(dir, 2_000)

    expect(state.wallet.coins).toBe(0)
    expect(state.migrations.starterCoinsGranted).toBe(true)
    expect(state.inventory.seeds).toEqual(withSeedCounts({ wheat: 5 }))
    expect(corruptBackups(dir)).toEqual([])
  })
})

describe('read-only game access', () => {
  it('never writes or renames while repeatedly peeking a canonical save', () => {
    const dir = makeDir()
    saveGameAtomic(dir, { ...createDefaultGameState(1_000), wallet: { coins: 42 } })
    const counter = countPersistence()

    expect(peekWalletCoins(dir, 1_000, counter.ops)).toBe(42)
    expect(peekWalletCoins(dir, 2_000, counter.ops)).toBe(42)
    expect(peekWalletCoins(dir, 3_000, counter.ops)).toBe(42)

    expect(counter.calls).toEqual({ write: 0, rename: 0 })
  })

  it('never writes while peeking a missing or repairable save', () => {
    const dir = makeDir()
    const missingCounter = countPersistence()

    expect(peekWalletCoins(dir, 1_000, missingCounter.ops)).toBe(100)
    expect(missingCounter.calls).toEqual({ write: 0, rename: 0 })
    expect(existsSync(join(dir, 'game.json'))).toBe(false)

    saveGameAtomic(dir, createDefaultGameState(1_000))
    const raw = readRawGame(dir)
    raw.wallet.coins = -5
    writeRawGame(dir, raw)
    const repairCounter = countPersistence()

    expect(peekWalletCoins(dir, 2_000, repairCounter.ops)).toBe(0)
    expect(repairCounter.calls).toEqual({ write: 0, rename: 0 })
  })

  it('does not rewrite a canonical save on loadGame', () => {
    const dir = makeDir()
    saveGameAtomic(dir, { ...createDefaultGameState(1_000), wallet: { coins: 42 } })
    const counter = countPersistence()

    expect(loadGame(dir, 1_000, counter.ops).wallet.coins).toBe(42)
    expect(loadGame(dir, 2_000, counter.ops).wallet.coins).toBe(42)

    expect(counter.calls).toEqual({ write: 0, rename: 0 })
  })

  it('writes back exactly once when repairing a non-canonical save', () => {
    const dir = makeDir()
    saveGameAtomic(dir, createDefaultGameState(1_000))
    const raw = readRawGame(dir)
    raw.wallet.coins = -5
    writeRawGame(dir, raw)
    const counter = countPersistence()

    expect(loadGame(dir, 2_000, counter.ops).wallet.coins).toBe(0)
    expect(counter.calls.write).toBe(1)

    expect(loadGame(dir, 3_000, counter.ops).wallet.coins).toBe(0)
    expect(counter.calls.write).toBe(1)
  })

  it('reports repair state without touching the disk', () => {
    const dir = makeDir()
    saveGameAtomic(dir, createDefaultGameState(1_000))
    const canonical = countPersistence()

    expect(readGameState(dir, 1_000, canonical.ops)).toMatchObject({
      dirty: false,
      corrupt: false,
    })

    writeFileSync(join(dir, 'game.json'), '{broken')
    const broken = countPersistence()
    const outcome = readGameState(dir, 2_000, broken.ops)

    expect(outcome.corrupt).toBe(true)
    expect(outcome.dirty).toBe(true)
    expect(outcome.state.wallet.coins).toBe(100)
    expect(broken.calls).toEqual({ write: 0, rename: 0 })
    expect(corruptBackups(dir)).toEqual([])
  })

  it('leaves the wallet untouched during a double withGame purchase', async () => {
    const dir = makeDir()
    saveGameAtomic(dir, { ...createDefaultGameState(1_000), wallet: { coins: 40 } })
    const counter = countPersistence()

    await withGame(dir, 1_000, (state) => buySeed(state, 'wheat'), counter.ops)

    expect(counter.calls.write).toBe(1)
    expect(peekWalletCoins(dir, 1_000)).toBe(35)
  })
})

describe('atomic persistence', () => {
  it('keeps the old file and removes a partial temp file when writing fails', () => {
    const dir = makeDir()
    const original = createDefaultGameState(1_000)
    original.wallet.coins = 31
    saveGameAtomic(dir, original)
    const before = readFileSync(join(dir, 'game.json'), 'utf8')
    const updated = { ...original, wallet: { coins: 9 } }

    expect(() =>
      saveGameAtomic(dir, updated, {
        writeFileSync(filePath, data) {
          writeFileSync(filePath, data)
          throw new Error('temp write failed')
        },
      }),
    ).toThrow('temp write failed')

    expect(readFileSync(join(dir, 'game.json'), 'utf8')).toBe(before)
    expect(readdirSync(dir).filter((name) => name.startsWith('game.json.tmp-'))).toEqual([])
  })

  it('keeps the old file and removes the temp file when replacement fails', () => {
    const dir = makeDir()
    const original = createDefaultGameState(1_000)
    original.wallet.coins = 31
    saveGameAtomic(dir, original)
    const before = readFileSync(join(dir, 'game.json'), 'utf8')
    const failingOps: Partial<GameStoreFileOps> = {
      renameSync() {
        throw new Error('replace failed')
      },
    }
    const updated = { ...original, wallet: { coins: 9 } }

    expect(() => saveGameAtomic(dir, updated, failingOps)).toThrow('replace failed')

    expect(readFileSync(join(dir, 'game.json'), 'utf8')).toBe(before)
    expect(readdirSync(dir).filter((name) => name.startsWith('game.json.tmp-'))).toEqual([])
  })
})

describe('withGame serialization', () => {
  it('serializes purchases so the wallet cannot overspend', async () => {
    const dir = makeDir()
    saveGameAtomic(dir, { ...createDefaultGameState(1_000), wallet: { coins: 5 } })

    const results = await Promise.all([
      withGame(dir, 1_000, (state) => buySeed(state, 'wheat')),
      withGame(dir, 1_000, (state) => buySeed(state, 'wheat')),
    ])

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(loadGame(dir, 1_000).wallet.coins).toBe(0)
  })

  it('does not save a failed mutation result', async () => {
    const dir = makeDir()
    const initial = createDefaultGameState(1_000)
    saveGameAtomic(dir, initial)

    await withGame(dir, 1_000, (state) => ({
      ok: false as const,
      game: { ...state, wallet: { coins: 1 } },
      reason: 'declined',
    }))

    expect(loadGame(dir, 1_000).wallet.coins).toBe(100)
  })

  it('continues processing after a rejected mutator without poisoning the queue', async () => {
    const dir = makeDir()

    await expect(withGame(dir, 1_000, () => Promise.reject(new Error('mutator failed')))).rejects.toThrow(
      'mutator failed',
    )
    const result = await withGame(dir, 1_000, (state) => ({
      ok: true as const,
      game: { ...state, wallet: { coins: 23 } },
      source: 'farm-coordinator' as const,
    }))

    expect(result.source).toBe('farm-coordinator')
    expect(peekWalletCoins(dir, 1_000)).toBe(23)
  })
})
