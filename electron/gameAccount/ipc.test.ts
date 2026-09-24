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
    listFriends: vi.fn().mockResolvedValue({ friends: [], incomingRequests: [], outgoingRequests: [] }),
    searchFriend: vi.fn().mockResolvedValue({ user: { id: 7, uid: '123456789', nickname: 'Friend' }, relation: 'none' }),
    sendFriendRequest: vi.fn().mockResolvedValue({ request: { id: 1, requesterId: 42, recipientId: 7, status: 'pending' }, user: { id: 7, uid: '123456789', nickname: 'Friend' } }),
    respondFriendRequest: vi.fn().mockResolvedValue({ status: 'accepted', request: { id: 1, requesterId: 42, recipientId: 7, status: 'accepted' } }),
    removeFriend: vi.fn().mockResolvedValue({}),
    updateFriendRemark: vi.fn().mockResolvedValue({ remark: '小王' }),
    getFriendFarm: vi.fn().mockResolvedValue({ owner: { id: 7, uid: '123456789', nickname: 'Friend' }, farm: { version: 1, plotCount: 24, weather: 'clear', totalXp: 0, plots: [] }, log: { id: 1, action: 'viewed', quantity: 0 } }),
    stealFriendFarm: vi.fn().mockResolvedValue({ cropId: 'wheat', quantity: 1, remainingYield: 1, log: { id: 2, action: 'stolen', quantity: 1 } }),
    listFarmVisits: vi.fn().mockResolvedValue({ logs: [] }),
  }
  const sync = createSyncCoordinator({ userDataPath: dir, api, sessionStore: store })
  cleanup.push(() => sync.dispose())
  const realtime = { start: vi.fn(), stop: vi.fn(), send: vi.fn(() => true) }
  const handlers = createGameAccountHandlers({ api, store, sync, realtime, deviceName: 'Test desktop' })
  return { api, handlers, store, dir, auth, realtime, sync }
}
afterEach(() => cleanup.splice(0).reverse().forEach(fn => fn()))

it('returns only safe account data to the renderer and forces the main-process device identity', async () => {
  const { handlers, api, store, realtime } = setup()
  const result = await handlers.gameAccountLogin({ email: 'player@example.com', password: 'Password1', deviceId: 'attacker', token: 'injected' } as never)
  expect(result).toMatchObject({ ok: true, data: { account: { userId: 42, email: 'player@example.com' } } })
  expect(JSON.stringify(result)).not.toContain('private-token')
  expect(api.login.mock.calls[0][0]).toEqual({ email: 'player@example.com', password: 'Password1', deviceId: store.getDeviceId(), deviceName: 'Test desktop' })
  expect(realtime.start).toHaveBeenCalledTimes(1)
})

it('stops realtime presence when logging out', async () => {
  const { handlers, realtime } = setup()
  await handlers.gameAccountLogin({ email: 'player@example.com', password: 'Password1' })
  await handlers.gameAccountLogout()
  expect(realtime.stop).toHaveBeenCalledTimes(1)
})

it('routes friend operations through the authenticated main-process session', async () => {
  const { handlers, api, realtime } = setup()
  await handlers.gameAccountLogin({ email: 'player@example.com', password: 'Password1' })
  await handlers.gameAccountSearchFriend('123456789')
  await handlers.gameAccountSendFriendRequest('123456789')
  await handlers.gameAccountRespondFriendRequest(1, 'accept')
  await handlers.gameAccountListFriends()
  await handlers.gameAccountRemoveFriend(7)
  await handlers.gameAccountUpdateFriendRemark(7, '小王')
  await handlers.gameAccountSubscribeFarm(7)
  await handlers.gameAccountUnsubscribeFarm(7)
  expect(api.searchFriend).toHaveBeenCalledWith('private-token', '123456789')
  expect(api.sendFriendRequest).toHaveBeenCalledWith('private-token', '123456789')
  expect(api.respondFriendRequest).toHaveBeenCalledWith('private-token', 1, 'accept')
  expect(api.listFriends).toHaveBeenCalledWith('private-token')
  expect(api.removeFriend).toHaveBeenCalledWith('private-token', 7)
  expect(api.updateFriendRemark).toHaveBeenCalledWith('private-token', 7, '小王')
  expect(realtime.send).toHaveBeenCalledWith({ type: 'farm.subscribe', ownerId: 7 })
  expect(realtime.send).toHaveBeenCalledWith({ type: 'farm.unsubscribe', ownerId: 7 })
})

it('routes farm visits through the authenticated main-process session', async () => {
  const { handlers, api } = setup()
  await handlers.gameAccountLogin({ email: 'player@example.com', password: 'Password1' })
  await handlers.gameAccountGetFriendFarm(7)
  await handlers.gameAccountStealFriendFarm(7, 2)
  await handlers.gameAccountListFarmVisits()
  expect(api.getFriendFarm).toHaveBeenCalledWith('private-token', 7)
  expect(api.stealFriendFarm).toHaveBeenCalledWith('private-token', 7, 2)
  expect(api.listFarmVisits).toHaveBeenCalledWith('private-token')
})

it('syncs the visitor cloud save after stealing a friend crop', async () => {
  const { handlers, api, sync } = setup()
  await handlers.gameAccountLogin({ email: 'player@example.com', password: 'Password1' })
  const syncNow = vi.spyOn(sync, 'syncNow').mockResolvedValue()
  await handlers.gameAccountStealFriendFarm(7, 2)
  expect(api.stealFriendFarm).toHaveBeenCalledWith('private-token', 7, 2)
  expect(syncNow).toHaveBeenCalledTimes(1)
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
