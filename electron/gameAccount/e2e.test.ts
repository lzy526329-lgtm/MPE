import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { saveGameAtomic } from '../game/gameStore'
import { createGameApi } from './api'
import { createAccountE2eFixtures } from './e2e-fixtures'
import { createSessionStore } from './sessionStore'
import { createSyncCoordinator } from './syncCoordinator'

it('carries HTTP envelopes through the API and sync coordinator into local persistence and ban handling', async () => {
  const fixtures = createAccountE2eFixtures()
  const dir = mkdtempSync(join(tmpdir(), 'game-account-e2e-'))
  const calls: Array<{ path: string; method: string; body: any }> = []
  const replies = [
    { status: 200, code: 200, data: fixtures.empty },
    { status: 200, code: 200, data: fixtures.localCloud },
    { status: 409, code: 'SAVE_CONFLICT', data: fixtures.conflict },
    { status: 200, code: 200, data: fixtures.resolved },
    { status: 403, code: 'ACCOUNT_BANNED', data: {} },
  ]
  const api = createGameApi('https://game.example.invalid', async (url, options) => {
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer test-only-session')
    calls.push({ path: new URL(url).pathname, method: options.method!, body: options.body ? JSON.parse(String(options.body)) : null })
    const reply = replies.shift()!
    expect(reply).toBeDefined()
    return new Response(JSON.stringify({ code: reply.code, msg: reply.code === 'ACCOUNT_BANNED' ? 'test ban reason' : 'success', data: reply.data }), { status: reply.status })
  })
  const store = createSessionStore(dir, { isEncryptionAvailable: () => false, encryptString: () => Buffer.alloc(0), decryptString: () => '' })
  store.setSession({ userId: 42, email: 'player@example.com', nickname: 'Player', status: 1, token: 'test-only-session', deviceId: store.getDeviceId(), lastRevision: 0 })
  saveGameAtomic(dir, fixtures.local)
  const sync = createSyncCoordinator({ userDataPath: dir, api, sessionStore: store, now: () => fixtures.now })
  try {
    await sync.syncNow()
    expect(sync.getState().status).toBe('synced')
    expect(store.getSession()?.lastRevision).toBe(1)
    expect(calls[1].body).toMatchObject({ baseRevision: 0, schemaVersion: 2 })
    expect(JSON.parse(calls[1].body.payload).wallet.coins).toBe(125)

    saveGameAtomic(dir, fixtures.changed)
    sync.markDirty()
    await sync.syncNow()
    expect(sync.getState()).toMatchObject({ status: 'conflict', conflict: { local: { coins: 300 }, cloud: { coins: 800 }, cloudRevision: 2 } })
    const before = readFileSync(join(dir, 'game.json'), 'utf8')
    await sync.resolveConflict('local')
    expect(calls[3]).toMatchObject({ path: '/api/game/save/resolve', method: 'POST', body: { choice: 'local', baseRevision: 2 } })
    expect(sync.getState().status).toBe('synced')
    expect(store.getSession()?.lastRevision).toBe(3)
    expect(readFileSync(join(dir, 'game.json'), 'utf8')).toBe(before)

    sync.markDirty()
    await sync.syncNow()
    expect(store.getSession()).toBeNull()
    expect(sync.getState()).toMatchObject({ status: 'local-only', error: { code: 'ACCOUNT_BANNED', message: 'test ban reason' } })
    expect(readFileSync(join(dir, 'game.json'), 'utf8')).toBe(before)
    await sync.syncNow()
    expect(calls).toHaveLength(5)
    expect(replies).toHaveLength(0)
  } finally {
    sync.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})
