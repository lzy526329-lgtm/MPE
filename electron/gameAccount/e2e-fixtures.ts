import { createHash } from 'node:crypto'
import { createDefaultGameState } from '../game/gameEngine'
import type { GameState } from '../game/gameTypes'
import type { SaveResult } from './types'

// Test-only full game states: use the real schema without loading a user's files.
export function createAccountE2eFixtures() {
  const now = Date.parse('2026-09-15T06:00:00.000Z')
  const local = createDefaultGameState(now)
  local.wallet.coins = 125
  const changed = structuredClone(local)
  changed.wallet.coins = 300
  const remote = structuredClone(local)
  remote.wallet.coins = 800
  const timestamp = new Date(now).toISOString()
  function cloud(game: GameState, revision: number, status: 'synced' | 'conflict' = 'synced'): SaveResult {
    const payload = JSON.stringify(game)
    return {
      status,
      save: { userId: 42, payload, schemaVersion: 2, revision, checksum: createHash('sha256').update(payload).digest('hex'), sourceDeviceId: 'test-remote', clientUpdatedAt: timestamp, createdAt: timestamp, updatedAt: timestamp },
      summary: { coins: game.wallet.coins, farmTotalXp: game.farm.totalXp, totalCaught: game.fishing.totalCaught, clientUpdatedAt: timestamp, sourceDeviceId: 'test-remote' },
    }
  }
  return { now, local, changed, remote, empty: { status: 'empty', save: null, summary: null } as SaveResult,
    localCloud: cloud(local, 1), conflict: cloud(remote, 2, 'conflict'), resolved: cloud(changed, 3) }
}
