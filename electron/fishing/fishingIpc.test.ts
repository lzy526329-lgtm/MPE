import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDefaultGameState } from '../game/gameEngine'
import { loadGame, saveGameAtomic } from '../game/gameStore'
import { createFishingHandlers } from './fishingIpc'
import { createFishingSessionManager } from './fishingSession'

const dirs: string[] = []

function makeDir() {
  const dir = mkdtempSync(join(tmpdir(), 'mpt-fishing-ipc-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('fishing handlers', () => {
  it('deducts bait and persists a catch only after a timely reel', async () => {
    const dir = makeDir()
    let now = 1_000
    const game = createDefaultGameState(now)
    game.inventory.baits.basic = 1
    saveGameAtomic(dir, game)
    const handlers = createFishingHandlers({
      userDataPath: dir,
      now: () => now,
      sessions: createFishingSessionManager({
        now: () => now,
        rng: () => 0,
        randomUUID: () => 'token-1',
      }),
      publish: vi.fn(),
    })

    const cast = await handlers.cast(12, 'basic')
    expect(cast).toMatchObject({
      ok: true,
      state: { inventory: { baits: { basic: 0 } } },
      session: { token: 'token-1', biteAt: 3_500, windowMs: 2_000 },
    })

    now = 3_500
    const reeled = await handlers.reel(12, 'token-1')
    expect(reeled).toMatchObject({
      ok: true,
      status: 'caught',
      catch: { id: 'token-1', fishId: 'crucian' },
    })
    expect(loadGame(dir, now).inventory.fish).toHaveLength(1)
  })

  it('does not deduct bait when the fish bag is full', async () => {
    const dir = makeDir()
    const game = createDefaultGameState(1_000)
    game.inventory.baits.basic = 1
    game.inventory.fish = Array.from({ length: 100 }, (_, index) => ({
      id: `fish-${index}`,
      fishId: 'crucian' as const,
      weightKg: 0.4,
      sellPrice: 3,
      caughtAt: index,
    }))
    saveGameAtomic(dir, game)
    const handlers = createFishingHandlers({
      userDataPath: dir,
      now: () => 1_000,
      sessions: createFishingSessionManager({
        now: () => 1_000,
        rng: () => 0,
        randomUUID: () => 'token-1',
      }),
      publish: vi.fn(),
    })

    expect(await handlers.cast(12, 'basic')).toMatchObject({
      ok: false,
      code: 'FISH_BAG_FULL',
    })
    expect(loadGame(dir, 1_000).inventory.baits.basic).toBe(1)
  })
})
