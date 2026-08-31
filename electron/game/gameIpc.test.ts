import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDefaultGameState } from './gameEngine'
import { createGameHandlers } from './gameIpc'
import { saveGameAtomic } from './gameStore'

const dirs: string[] = []

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mpt-game-ipc-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('createGameHandlers', () => {
  it('returns the starter wallet and wheat seed offer', async () => {
    const handlers = createGameHandlers({
      userDataPath: makeDir(),
      now: () => 1_000,
      publish: vi.fn(),
      publishPetStatus: vi.fn(),
    })

    const state = await handlers.getState()

    expect(state.wallet.coins).toBe(100)
    expect(state.seedOffers).toEqual([{ cropId: 'wheat', name: '小麦种子', price: 5 }])
    expect(state.produceOffers).toEqual([{ produceId: 'wheat', name: '小麦', price: 4 }])
  })

  it('publishes the updated game and pet status after a successful sale', async () => {
    const publish = vi.fn()
    const publishPetStatus = vi.fn()
    const dir = makeDir()
    const handlers = createGameHandlers({
      userDataPath: dir,
      now: () => 1_000,
      publish,
      publishPetStatus,
    })
    const initial = createDefaultGameState(1_000)
    initial.inventory.produce = { wheat: 2 }
    saveGameAtomic(dir, initial)

    const result = await handlers.sellProduce('wheat')

    expect(result.ok).toBe(true)
    expect(result.state.wallet.coins).toBe(104)
    expect(result.state.inventory.produce.wheat).toBe(1)
    expect(publish).toHaveBeenCalledOnce()
    expect(publishPetStatus).toHaveBeenCalledOnce()
  })

  it('does not publish after a failed sale', async () => {
    const publish = vi.fn()
    const publishPetStatus = vi.fn()
    const handlers = createGameHandlers({
      userDataPath: makeDir(),
      now: () => 1_000,
      publish,
      publishPetStatus,
    })

    const result = await handlers.sellProduce('wheat')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INSUFFICIENT_STOCK')
    expect(publish).not.toHaveBeenCalled()
    expect(publishPetStatus).not.toHaveBeenCalled()
  })

  it('publishes the updated game and pet status after a successful purchase', async () => {
    const publish = vi.fn()
    const publishPetStatus = vi.fn()
    const handlers = createGameHandlers({
      userDataPath: makeDir(),
      now: () => 1_000,
      publish,
      publishPetStatus,
    })

    const result = await handlers.buySeed('wheat')

    expect(result.ok).toBe(true)
    expect(result.state.wallet.coins).toBe(95)
    expect(result.state.inventory.seeds.wheat).toBe(6)
    expect(publish).toHaveBeenCalledOnce()
    expect(publish).toHaveBeenCalledWith(result.state)
    expect(publishPetStatus).toHaveBeenCalledOnce()
  })

  it('does not publish game or pet status after a failed purchase', async () => {
    const publish = vi.fn()
    const publishPetStatus = vi.fn()
    const handlers = createGameHandlers({
      userDataPath: makeDir(),
      now: () => 1_000,
      publish,
      publishPetStatus,
    })

    const result = await handlers.buySeed('missing' as never)

    expect(result.ok).toBe(false)
    expect(publish).not.toHaveBeenCalled()
    expect(publishPetStatus).not.toHaveBeenCalled()
  })

  it('reports a persistence failure with the unchanged state instead of rejecting', async () => {
    const dir = makeDir()
    saveGameAtomic(dir, createDefaultGameState(1_000))
    const before = readFileSync(join(dir, 'game.json'), 'utf8')
    const publish = vi.fn()
    const publishPetStatus = vi.fn()
    const handlers = createGameHandlers({
      userDataPath: dir,
      now: () => 1_000,
      publish,
      publishPetStatus,
      fileOps: {
        writeFileSync() {
          throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
        },
      },
    })

    const result = await handlers.buySeed('wheat')

    expect(result).toMatchObject({ ok: false, code: 'PERSISTENCE_FAILED' })
    expect(result.state.wallet.coins).toBe(100)
    expect(result.state.inventory.seeds.wheat).toBe(5)
    expect(result.state.seedOffers).toHaveLength(1)
    expect(readFileSync(join(dir, 'game.json'), 'utf8')).toBe(before)
    expect(publish).not.toHaveBeenCalled()
    expect(publishPetStatus).not.toHaveBeenCalled()
  })

  it('falls back to the last known state when the failed save cannot be re-read', async () => {
    const dir = makeDir()
    saveGameAtomic(dir, { ...createDefaultGameState(1_000), wallet: { coins: 64 } })
    let reads = 0
    const handlers = createGameHandlers({
      userDataPath: dir,
      now: () => 1_000,
      publish: vi.fn(),
      publishPetStatus: vi.fn(),
      fileOps: {
        readFileSync: ((...args: unknown[]) => {
          reads += 1
          if (reads > 2) throw Object.assign(new Error('denied'), { code: 'EACCES' })
          return Reflect.apply(readFileSync, undefined, args)
        }) as typeof readFileSync,
        writeFileSync() {
          throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
        },
      },
    })

    expect((await handlers.getState()).wallet.coins).toBe(64)
    const result = await handlers.buySeed('wheat')

    expect(result).toMatchObject({ ok: false, code: 'PERSISTENCE_FAILED' })
    expect(result.state.wallet.coins).toBe(64)
    expect(result.state.seedOffers).toHaveLength(1)
  })

  it('returns a renderable zero state when nothing can be read at all', async () => {
    const handlers = createGameHandlers({
      userDataPath: makeDir(),
      now: () => 1_000,
      publish: vi.fn(),
      publishPetStatus: vi.fn(),
      fileOps: {
        existsSync: () => true,
        readFileSync() {
          throw Object.assign(new Error('denied'), { code: 'EACCES' })
        },
      },
    })

    const result = await handlers.buySeed('wheat')

    expect(result).toMatchObject({ ok: false, code: 'PERSISTENCE_FAILED' })
    expect(result.state.wallet.coins).toBe(0)
    expect(result.state.inventory.seeds).toEqual({ wheat: 0 })
    expect(result.state.seedOffers).toHaveLength(1)
  })
})
