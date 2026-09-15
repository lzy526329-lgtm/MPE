import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createDefaultGameState } from '../game/gameEngine'
import { loadGame, onGameSaved, saveGameAtomic } from '../game/gameStore'
import { GameApiError } from './api'
import { createSessionStore } from './sessionStore'
import { createSyncCoordinator } from './syncCoordinator'
import type { SaveResult, SaveUpload } from './types'

const cleanup: Array<() => void> = []
function cloud(coins = 100, revision = 1): SaveResult {
  const game = createDefaultGameState(1_000)
  game.wallet.coins = coins
  const payload = JSON.stringify(game)
  return {
    status: 'synced',
    save: { userId: 42, payload, schemaVersion: 2, revision, checksum: createHash('sha256').update(payload).digest('hex'), sourceDeviceId: 'remote', clientUpdatedAt: '2026-09-15T00:00:00.000Z', createdAt: '2026-09-15T00:00:00.000Z', updatedAt: '2026-09-15T00:00:00.000Z' },
    summary: { coins, farmTotalXp: 0, totalCaught: 0, sourceDeviceId: 'remote', clientUpdatedAt: '2026-09-15T00:00:00.000Z' },
  }
}
function setup(guest = false) {
  vi.useFakeTimers()
  const dir = mkdtempSync(join(tmpdir(), 'account-sync-'))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  saveGameAtomic(dir, createDefaultGameState(1_000))
  const sessionStore = createSessionStore(dir, { isEncryptionAvailable: () => false, encryptString: () => Buffer.alloc(0), decryptString: () => '' })
  if (!guest) sessionStore.setSession({ userId: 42, email: 'player@example.com', nickname: null, status: 1, token: 'secret', deviceId: sessionStore.getDeviceId(), lastRevision: 0 })
  const api = {
    getSave: vi.fn<() => Promise<SaveResult>>().mockResolvedValue({ status: 'empty', save: null, summary: null }),
    putSave: vi.fn<(token: string, upload: SaveUpload) => Promise<SaveResult>>().mockImplementation(async (_token, upload) => cloud(JSON.parse(upload.payload).wallet.coins, upload.baseRevision + 1)),
    resolveSave: vi.fn().mockResolvedValue(cloud(100, 3)),
  }
  const sync = createSyncCoordinator({ userDataPath: dir, api, now: () => 1_000, debounceMs: 2_000, sessionStore })
  cleanup.push(() => sync.dispose())
  cleanup.push(onGameSaved(event => { if (event.userDataPath === dir) sync.markDirty() }))
  const save = (coins: number) => saveGameAtomic(dir, { ...loadGame(dir, 1_000), wallet: { coins } })
  return { dir, sessionStore, api, sync, save }
}
afterEach(() => {
  cleanup.splice(0).reverse().forEach(fn => fn())
  vi.useRealTimers()
})

it('keeps guests local without any account network calls', async () => {
  const { sync, api, save } = setup(true)
  save(37)
  await sync.syncNow()
  await vi.advanceTimersByTimeAsync(70_000)
  expect(sync.getState().status).toBe('local-only')
  expect(api.getSave).not.toHaveBeenCalled()
  expect(api.putSave).not.toHaveBeenCalled()
})

it('debounces local changes and uploads the latest exact version-two bytes with base revision zero', async () => {
  const { sync, api, save } = setup()
  save(35)
  await vi.advanceTimersByTimeAsync(1_000)
  save(28)
  await vi.advanceTimersByTimeAsync(1_999)
  expect(api.putSave).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  const upload = api.putSave.mock.calls[0][1]
  expect(upload.baseRevision).toBe(0)
  expect(upload.schemaVersion).toBe(2)
  expect(JSON.parse(upload.payload).wallet.coins).toBe(28)
  expect(upload.payload).toBe(JSON.stringify(JSON.parse(upload.payload)))
  expect(upload.checksum).toBe(createHash('sha256').update(upload.payload, 'utf8').digest('hex'))
  expect(sync.getState().status).toBe('synced')
})

it('binds an identical cloud save without an unnecessary upload', async () => {
  const { sync, api, sessionStore } = setup()
  api.getSave.mockResolvedValue(cloud(100, 9))
  await sync.syncNow()
  expect(api.putSave).not.toHaveBeenCalled()
  expect(sessionStore.getSession()?.lastRevision).toBe(9)
  expect(sync.getState().status).toBe('synced')
})

it('keeps writes playable while offline and retries after 5, 15, then 60 seconds', async () => {
  const { sync, api, save, dir } = setup()
  api.getSave.mockRejectedValue(new Error('offline'))
  await sync.syncNow()
  expect(sync.getState().status).toBe('offline-pending')
  save(15)
  expect(loadGame(dir, 1_000).wallet.coins).toBe(15)
  await vi.advanceTimersByTimeAsync(4_999)
  expect(api.getSave).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(api.getSave).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(15_000)
  expect(api.getSave).toHaveBeenCalledTimes(3)
  api.getSave.mockResolvedValue({ status: 'empty', save: null, summary: null })
  await vi.advanceTimersByTimeAsync(60_000)
  expect(sync.getState().status).toBe('synced')
  expect(JSON.parse(api.putSave.mock.calls[0][1].payload).wallet.coins).toBe(15)
})

it('shows both summaries on first binding conflict without modifying either save', async () => {
  const { sync, api, dir } = setup()
  api.getSave.mockResolvedValue(cloud(800, 5))
  const before = readFileSync(join(dir, 'game.json'), 'utf8')
  await sync.syncNow()
  expect(sync.getState()).toMatchObject({ status: 'conflict', conflict: { local: { coins: 100 }, cloud: { coins: 800 }, cloudRevision: 5 } })
  expect(readFileSync(join(dir, 'game.json'), 'utf8')).toBe(before)
  expect(api.putSave).not.toHaveBeenCalled()
})

it('handles a revision race as a conflict and resolves local against the observed revision', async () => {
  const { sync, api, save } = setup()
  await sync.syncNow()
  save(43)
  api.putSave.mockRejectedValueOnce(new GameApiError('SAVE_CONFLICT', 'choose', 409, cloud(800, 2)))
  await sync.syncNow()
  expect(sync.getState().status).toBe('conflict')
  await sync.resolveConflict('local')
  expect(api.resolveSave.mock.calls[0][1]).toMatchObject({ choice: 'local', baseRevision: 2 })
  expect(JSON.parse(api.resolveSave.mock.calls[0][1].payload).wallet.coins).toBe(43)
  expect(sync.getState().status).toBe('synced')
})

it('backs up local bytes before cloud replacement without immediately reuploading', async () => {
  const { sync, api, dir, sessionStore } = setup()
  api.getSave.mockResolvedValue(cloud(800, 2))
  api.resolveSave.mockResolvedValue(cloud(800, 2))
  const before = readFileSync(join(dir, 'game.json'), 'utf8')
  await sync.syncNow()
  await sync.resolveConflict('cloud')
  expect(api.resolveSave.mock.calls[0][1]).toEqual({ choice: 'cloud', baseRevision: 2 })
  expect(loadGame(dir, 1_000).wallet.coins).toBe(800)
  const backup = readdirSync(dir).find(name => name.startsWith('game.json.backup-'))!
  expect(readFileSync(join(dir, backup), 'utf8')).toBe(before)
  await vi.advanceTimersByTimeAsync(10_000)
  expect(api.putSave).not.toHaveBeenCalled()
  expect(sessionStore.getSession()?.lastRevision).toBe(2)
})

it('clears a banned session and stops retries while preserving local bytes', async () => {
  const { sync, api, dir, sessionStore } = setup()
  const before = readFileSync(join(dir, 'game.json'), 'utf8')
  api.getSave.mockRejectedValue(new GameApiError('ACCOUNT_BANNED', 'reason', 403))
  await sync.syncNow()
  expect(sessionStore.getSession()).toBeNull()
  expect(sync.getState()).toMatchObject({ status: 'local-only', error: { code: 'ACCOUNT_BANNED', message: 'reason' } })
  expect(readFileSync(join(dir, 'game.json'), 'utf8')).toBe(before)
  await vi.advanceTimersByTimeAsync(120_000)
  expect(api.getSave).toHaveBeenCalledTimes(1)
})

it('does not let an older upload acknowledge local writes made while it was in flight', async () => {
  const { sync, api, save } = setup()
  await sync.syncNow()
  let finish!: (save: SaveResult) => void
  api.putSave.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  save(90)
  const pending = sync.syncNow()
  await vi.advanceTimersByTimeAsync(0)
  save(80)
  finish(cloud(90, 2))
  await pending
  await vi.advanceTimersByTimeAsync(2_000)
  expect(JSON.parse(api.putSave.mock.calls.at(-1)![1].payload).wallet.coins).toBe(80)
  expect(api.putSave.mock.calls.at(-1)![1].baseRevision).toBe(2)
})

it('ignores a cloud response after logout', async () => {
  const { sync, api, sessionStore } = setup()
  let finish!: (save: SaveResult) => void
  api.getSave.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const pending = sync.syncNow()
  sessionStore.clearSession()
  sync.sessionChanged()
  finish(cloud(800, 9))
  await pending
  expect(sync.getState().status).toBe('local-only')
  expect(api.putSave).not.toHaveBeenCalled()
})

it('creates the local save before uploading for an account that has never opened the game', async () => {
  const { sync, dir, api } = setup()
  rmSync(join(dir, 'game.json'))
  await sync.syncNow()
  expect(JSON.parse(readFileSync(join(dir, 'game.json'), 'utf8')).version).toBe(2)
  expect(JSON.parse(api.putSave.mock.calls[0][1].payload).wallet.coins).toBe(100)
})

it('does not replace local progress when cloud payload validation fails', async () => {
  const { sync, api, dir } = setup()
  api.getSave.mockResolvedValue(cloud(800, 2))
  await sync.syncNow()
  const invalid = cloud(800, 2)
  invalid.save!.payload = invalid.save!.payload.replace('800', '900')
  api.resolveSave.mockResolvedValue(invalid)
  const before = readFileSync(join(dir, 'game.json'), 'utf8')
  await sync.resolveConflict('cloud')
  expect(readFileSync(join(dir, 'game.json'), 'utf8')).toBe(before)
  expect(sync.getState().status).toBe('conflict')
})
