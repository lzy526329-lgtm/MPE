import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createGameAccountHandlers } from './ipc'
import { createSessionStore } from './sessionStore'
import { createSyncCoordinator } from './syncCoordinator'
import { GameApiError } from './api'
import { saveGameAtomic } from '../game/gameStore'
import { createDefaultGameState } from '../game/gameEngine'
import type { AuthResult } from './types'

const cleanup: Array<() => void> = []
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'game-account-ipc-'))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  saveGameAtomic(dir, createDefaultGameState(1_000))
  const store = createSessionStore(dir, { isEncryptionAvailable: () => false, encryptString: () => Buffer.alloc(0), decryptString: () => '' })
  const auth: AuthResult = { token: 'private-token', expiresAt: '2026-10-01T00:00:00Z', user: { id: 42, uid: '123456789', email: 'player@example.com', nickname: 'Player', status: 1 } }
  const api = {
    login: vi.fn().mockResolvedValue(auth), register: vi.fn().mockResolvedValue(auth),
    logout: vi.fn().mockResolvedValue({}), me: vi.fn().mockResolvedValue({ user: auth.user, save: null }),
    changePassword: vi.fn().mockResolvedValue({}), resetPassword: vi.fn().mockResolvedValue({}),
    sendEmailCode: vi.fn().mockResolvedValue({ email: 'player@example.com', purpose: 'register' }),
    getSave: vi.fn().mockRejectedValue(new Error('offline')),
    putSave: vi.fn(), resolveSave: vi.fn(),
  }
  const sync = createSyncCoordinator({ userDataPath: dir, api, sessionStore: store })
  cleanup.push(() => sync.dispose())
  const handlers = createGameAccountHandlers({ api, store, sync, deviceName: 'Test desktop' })
  return { api, handlers, store, dir, auth }
}
afterEach(() => cleanup.splice(0).reverse().forEach(fn => fn()))

it('returns only safe account data to the renderer and forces the main-process device identity', async () => {
  const { handlers, api, store } = setup()
  const result = await handlers.gameAccountLogin({ email: 'player@example.com', password: 'Password1', deviceId: 'attacker', token: 'injected' } as never)
  expect(result).toMatchObject({ ok: true, data: { account: { userId: 42, email: 'player@example.com' } } })
  expect(JSON.stringify(result)).not.toContain('private-token')
  expect(api.login.mock.calls[0][0]).toEqual({ email: 'player@example.com', password: 'Password1', deviceId: store.getDeviceId(), deviceName: 'Test desktop' })
})

it('does not restore a login that finishes after a user has logged out', async () => {
  const { handlers, api, auth, store } = setup()
  let complete!: (auth: AuthResult) => void
  api.login.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  const pending = handlers.gameAccountLogin({ email: 'player@example.com', password: 'Password1' })
  await handlers.gameAccountLogout()
  complete(auth)
  await pending
  expect(store.getSession()).toBeNull()
  expect(api.getSave).not.toHaveBeenCalled()
})

it('clears banned sessions on protected account requests and retains local save bytes', async () => {
  const { handlers, api, store, dir } = setup()
  await handlers.gameAccountLogin({ email: 'player@example.com', password: 'Password1' })
  const before = readFileSync(join(dir, 'game.json'), 'utf8')
  api.me.mockRejectedValue(new GameApiError('ACCOUNT_BANNED', 'banned reason', 403))
  expect(await handlers.gameAccountMe()).toMatchObject({ ok: false, error: { code: 'ACCOUNT_BANNED' } })
  expect(store.getSession()).toBeNull()
  expect(await handlers.gameAccountGetState()).toMatchObject({ status: 'local-only', error: { code: 'ACCOUNT_BANNED', message: 'banned reason' } })
  expect(readFileSync(join(dir, 'game.json'), 'utf8')).toBe(before)
})

it('logs out locally even when remote logout is offline', async () => {
  const { handlers, api, store } = setup()
  await handlers.gameAccountLogin({ email: 'player@example.com', password: 'Password1' })
  api.logout.mockRejectedValue(new Error('offline'))
  await handlers.gameAccountLogout()
  expect(store.getSession()).toBeNull()
  expect(await handlers.gameAccountGetState()).toMatchObject({ status: 'local-only' })
})

it('clears all local credentials after successful password changes and matching resets', async () => {
  const { handlers, store } = setup()
  await handlers.gameAccountLogin({ email: 'player@example.com', password: 'Password1' })
  expect(await handlers.gameAccountChangePassword({ oldPassword: 'Password1', newPassword: 'Password2' })).toMatchObject({ ok: true })
  expect(store.getSession()).toBeNull()
  await handlers.gameAccountLogin({ email: 'player@example.com', password: 'Password2' })
  await handlers.gameAccountResetPassword({ email: 'PLAYER@example.com', code: '123456', newPassword: 'Password3' })
  expect(store.getSession()).toBeNull()
})

it('rejects malformed renderer requests without leaking internal exception details', async () => {
  const { handlers, api } = setup()
  expect(await handlers.gameAccountLogin(null as never)).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  expect(api.login).not.toHaveBeenCalled()
  api.sendEmailCode.mockRejectedValue(new Error('/private/files/secret.txt'))
  const result = await handlers.gameAccountSendEmailCode({ email: 'player@example.com', purpose: 'register' })
  expect(JSON.stringify(result)).not.toContain('/private/')
})
