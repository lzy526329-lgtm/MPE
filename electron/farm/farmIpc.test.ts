import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { withSeedCounts } from './cropCatalog'
import { createDefaultGameState } from '../game/gameEngine'
import { saveGameAtomic, type GameStoreFileOps } from '../game/gameStore'
import type { GameState, GameViewState } from '../game/gameTypes'
import {
  FARM_PERSISTENCE_ERROR,
  createFarmHandlers,
  type FarmHandlerName,
  type FarmHandlers,
} from './farmIpc'
import type { FarmActionResult } from './farmEngine'

const NOW = 5_000
const dirs: string[] = []

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mpt-farm-ipc-'))
  dirs.push(dir)
  return dir
}

function seededGame(): GameState {
  const game = createDefaultGameState(1_000)
  game.farm.lastSettledAt = 1_000
  game.farm.lastWeatherRollAt = 1_000
  game.farm.plots[0] = {
    status: 'growing',
    cropId: 'wheat',
    plantedAt: 1_000,
    lastWateredAt: 1_000,
    progressMs: 0,
    hasBug: true,
  }
  game.farm.plots[1] = {
    status: 'ready',
    cropId: 'wheat',
    plantedAt: 0,
    lastWateredAt: 1_000,
    progressMs: 20 * 60_000,
  }
  return game
}

type Harness = {
  dir: string
  handlers: FarmHandlers
  publish: ReturnType<typeof vi.fn>
  publishPetStatus: ReturnType<typeof vi.fn>
}

function harness(fileOps: Partial<GameStoreFileOps> = {}): Harness {
  const dir = makeDir()
  saveGameAtomic(dir, seededGame())
  const publish = vi.fn()
  const publishPetStatus = vi.fn()
  const handlers = createFarmHandlers({
    userDataPath: () => dir,
    now: () => NOW,
    publish,
    publishPetStatus,
    fileOps,
  })
  return { dir, handlers, publish, publishPetStatus }
}

function storedGame(dir: string): GameState {
  return JSON.parse(readFileSync(join(dir, 'game.json'), 'utf8')) as GameState
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

type SuccessCase = {
  name: FarmHandlerName
  invoke: (handlers: FarmHandlers) => Promise<FarmActionResult>
  expect: (result: FarmActionResult & { ok: true }, stored: GameState) => void
}

const successCases: SuccessCase[] = [
  {
    name: 'getState',
    invoke: (handlers) => handlers.getState(),
    expect: (result) => {
      expect(result.state.plots).toHaveLength(24)
      expect(result.state.seeds).toEqual(withSeedCounts({ wheat: 5 }))
      expect(result.context).toMatchObject({
        farmLevel: 0,
        farmTotalXp: 0,
        walletCoins: 100,
        farmXpProgress: { current: 0, required: 500, isMaxLevel: false },
      })
    },
  },
  {
    name: 'plant',
    invoke: (handlers) => handlers.plant({ plotIndex: 2, cropId: 'wheat' }),
    expect: (result, stored) => {
      expect(result.state.plots[2]).toMatchObject({
        status: 'growing',
        cropId: 'wheat',
        plantedAt: NOW,
      })
      expect(result.state.seeds.wheat).toBe(4)
      expect(stored.inventory.seeds.wheat).toBe(4)
    },
  },
  {
    name: 'water',
    invoke: (handlers) => handlers.water({ plotIndex: 0 }),
    expect: (result) => {
      expect(result.state.plots[0]).toMatchObject({ lastWateredAt: NOW })
    },
  },
  {
    name: 'debug',
    invoke: (handlers) => handlers.debug({ plotIndex: 0 }),
    expect: (result) => {
      expect(result.state.plots[0]).not.toHaveProperty('hasBug')
    },
  },
  {
    name: 'harvest',
    invoke: (handlers) => handlers.harvest({ plotIndex: 1 }),
    expect: (result, stored) => {
      expect(result.state.plots[1]).toEqual({ status: 'empty' })
      expect(result.state.inventory.wheat).toBeGreaterThanOrEqual(1)
      expect(stored.inventory.produce.wheat).toBe(result.state.inventory.wheat)
    },
  },
  {
    name: 'claimDailySeeds',
    invoke: (handlers) => handlers.claimDailySeeds(),
    expect: (result, stored) => {
      expect(result.state.seeds).toEqual(withSeedCounts({ wheat: 8 }))
      expect(stored.inventory.seeds).toEqual(withSeedCounts({ wheat: 8 }))
    },
  },
  {
    name: 'waterAll',
    invoke: (handlers) => handlers.waterAll(),
    expect: (result) => {
      expect(result.state.plots[0]).toMatchObject({ lastWateredAt: NOW })
      expect(result.state.plots[1]).toMatchObject({ lastWateredAt: NOW })
    },
  },
  {
    name: 'harvestAll',
    invoke: (handlers) => handlers.harvestAll(),
    expect: (result, stored) => {
      expect(result.state.plots[1]).toEqual({ status: 'empty' })
      expect(stored.inventory.produce.wheat).toBeGreaterThanOrEqual(1)
    },
  },
]

describe('createFarmHandlers wiring', () => {
  it('exposes exactly the nine farm channels', () => {
    const { handlers } = harness()

    expect(Object.keys(handlers).sort()).toEqual(
      [
        'claimDailySeeds',
        'debug',
        'getState',
        'harvest',
        'harvestAll',
        'plant',
        'unlockPlot',
        'water',
        'waterAll',
      ].sort(),
    )
  })

  it.each(successCases)(
    '$name settles to now, returns a farm result and persists the unified state',
    async ({ invoke, expect: assert }) => {
      const { dir, handlers, publish, publishPetStatus } = harness()

      const result = await invoke(handlers)

      expect(result.ok).toBe(true)
      expect(result.state.lastSettledAt).toBe(NOW)
      expect(result.state.seeds).toBeTypeOf('object')
      expect(result.state.inventory).toBeTypeOf('object')
      expect(result).not.toHaveProperty('game')
      const stored = storedGame(dir)
      expect(stored.farm.lastSettledAt).toBe(NOW)
      expect(stored.farm).not.toHaveProperty('seeds')
      expect(stored.farm).not.toHaveProperty('inventory')
      assert(result as FarmActionResult & { ok: true }, stored)

      expect(publish).toHaveBeenCalledOnce()
      const published = publish.mock.calls[0][0] as GameViewState
      expect(published.wallet.coins).toBe(100)
      expect(published.seedOffers).toHaveLength(5)
      expect(published.inventory.seeds).toEqual(stored.inventory.seeds)
      expect(publishPetStatus).not.toHaveBeenCalled()
    },
  )

  it('unlockPlot deducts coins, publishes wallet changes and refreshes pet status', async () => {
    const { dir, handlers, publish, publishPetStatus } = harness()
    const game = seededGame()
    game.farm.totalXp = 500
    saveGameAtomic(dir, game)

    const result = await handlers.unlockPlot({ plotIndex: 6 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.plots[6]).toEqual({ status: 'empty' })
    expect(result.context?.walletCoins).toBe(85)
    expect(storedGame(dir).wallet.coins).toBe(85)
    expect(publish).toHaveBeenCalledOnce()
    expect(publishPetStatus).toHaveBeenCalledOnce()
  })
})

describe('createFarmHandlers failures', () => {
  const failureCases: {
    name: FarmHandlerName
    invoke: (handlers: FarmHandlers) => Promise<FarmActionResult>
  }[] = [
    { name: 'plant', invoke: (handlers) => handlers.plant({ plotIndex: 99, cropId: 'wheat' }) },
    { name: 'water', invoke: (handlers) => handlers.water({ plotIndex: 99 }) },
    { name: 'debug', invoke: (handlers) => handlers.debug({ plotIndex: 99 }) },
    { name: 'harvest', invoke: (handlers) => handlers.harvest({ plotIndex: 99 }) },
  ]

  it.each(failureCases)(
    '$name returns a renderable failure without publishing',
    async ({ invoke }) => {
      const { handlers, publish, publishPetStatus } = harness()

      const result = await invoke(handlers)

      expect(result.ok).toBe(false)
      expect(result).toMatchObject({ ok: false, error: expect.any(String) })
      expect(result.state.plots).toHaveLength(24)
      expect(publish).not.toHaveBeenCalled()
      expect(publishPetStatus).not.toHaveBeenCalled()
    },
  )

  it('does not persist the settle of a failed action and recomputes it next time', async () => {
    const { dir, handlers } = harness()

    const failed = await handlers.water({ plotIndex: 99 })

    expect(failed.ok).toBe(false)
    expect(storedGame(dir).farm.lastSettledAt).toBe(1_000)
    expect(storedGame(dir).farm.plots[0]).toMatchObject({ progressMs: 0 })

    const next = await handlers.water({ plotIndex: 0 })

    expect(next.ok).toBe(true)
    expect(next.state.lastSettledAt).toBe(NOW)
    expect(storedGame(dir).farm.lastSettledAt).toBe(NOW)
    expect(storedGame(dir).farm.plots[0]).toMatchObject({ progressMs: 2_000 })
  })

  it('converts a persistence failure into a renderable result instead of rejecting', async () => {
    const { dir, handlers, publish, publishPetStatus } = harness({
      writeFileSync() {
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
      },
    })
    const before = readFileSync(join(dir, 'game.json'), 'utf8')

    const result = await handlers.plant({ plotIndex: 2, cropId: 'wheat' })

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ ok: false, error: FARM_PERSISTENCE_ERROR })
    expect(result.state.plots).toHaveLength(24)
    expect(result.state.seeds.wheat).toBe(5)
    expect(readFileSync(join(dir, 'game.json'), 'utf8')).toBe(before)
    expect(publish).not.toHaveBeenCalled()
    expect(publishPetStatus).not.toHaveBeenCalled()
  })

  it('returns a renderable result when the save cannot even be read', async () => {
    const { handlers, publish } = harness({
      readFileSync() {
        throw Object.assign(new Error('denied'), { code: 'EACCES' })
      },
    })

    const result = await handlers.getState()

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ ok: false, error: FARM_PERSISTENCE_ERROR })
    expect(result.state.plots).toHaveLength(24)
    expect(publish).not.toHaveBeenCalled()
  })
})

describe('registerFarmIpc', () => {
  const CHANNELS = [
    'farm:get-state',
    'farm:plant',
    'farm:water',
    'farm:debug',
    'farm:harvest',
    'farm:unlock-plot',
    'farm:claim-daily-seeds',
    'farm:water-all',
    'farm:harvest-all',
  ]

  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('electron')
  })

  it('binds each farm channel to the matching handler and broadcasts through the window', async () => {
    const dir = makeDir()
    saveGameAtomic(dir, seededGame())
    const registered = new Map<string, (event: unknown, request?: unknown) => unknown>()
    const send = vi.fn()

    vi.resetModules()
    vi.doMock('electron', () => ({
      app: { getPath: () => dir },
      ipcMain: {
        handle: (channel: string, listener: (event: unknown, request?: unknown) => unknown) => {
          registered.set(channel, listener)
        },
      },
      BrowserWindow: class {},
      Menu: { buildFromTemplate: vi.fn() },
      powerMonitor: { getSystemIdleTime: vi.fn(() => 0) },
      screen: {},
    }))
    const { registerFarmIpc } = await import('./farmIpc')
    registerFarmIpc(() => ({ webContents: { send } }) as never)

    expect([...registered.keys()]).toEqual(CHANNELS)

    const planted = (await registered.get('farm:plant')?.(null, {
      plotIndex: 2,
      cropId: 'wheat',
    })) as FarmActionResult
    expect(planted.ok).toBe(true)
    expect(planted.state.plots[2]).toMatchObject({ status: 'growing', cropId: 'wheat' })
    expect(planted.state.seeds.wheat).toBe(4)
    expect(send).toHaveBeenCalledWith('game:state-changed', expect.anything())

    const claimed = (await registered.get('farm:claim-daily-seeds')?.(null)) as FarmActionResult
    expect(claimed.ok).toBe(true)
    expect(claimed.state.seeds).toEqual(withSeedCounts({ wheat: 7 }))
  })
})
