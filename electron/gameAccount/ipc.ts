import { app, ipcMain, safeStorage, type BrowserWindow } from 'electron'
import { hostname } from 'node:os'
import { applyServerWalletCoins, onGameSaved } from '../game/gameStore'
import { toGameViewState } from '../game/gameEngine'
import { createGameApi, GameApiError, type GameApi } from './api'
import { getGameApiBaseUrl } from './config'
import { createGameRealtime, getGameWebSocketUrl } from './realtime'
import { createSessionStore, type SessionStore } from './sessionStore'
import { createSyncCoordinator, type SyncCoordinator } from './syncCoordinator'
import { createAccountIpcHandler, getTrustedMainWindow } from './trustedRenderer'
import type { AccountResult, AnimalFlipAction, AuthResult, GameAccountBridge, GameAccountState, LoginRequest, RegisterRequest } from './types'

type HandlerOptions = { api: any; store: SessionStore; sync: SyncCoordinator; deviceName: string; userDataPath?: string; realtime?: { start: () => void; stop: () => void; refresh?: () => void; send?: (message: Record<string, unknown>) => boolean } }
type AccountHandlers = Omit<GameAccountBridge, 'onGameAccountStateChanged' | 'onAnimalFlipRoomEvent' | 'onGameAccountPresenceChanged' | 'onGameAccountFarmVisit' | 'onGameAccountFarmUpdated'>
function textField(input: unknown, field: string, optional = false): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new GameApiError('VALIDATION_ERROR', 'Invalid request')
  const value = (input as Record<string, unknown>)[field]
  if (optional && value === undefined) return ''
  if (typeof value !== 'string' || value.length > 1024) throw new GameApiError('VALIDATION_ERROR', 'Invalid account field')
  return value
}

function uidField(input: unknown): string {
  if (typeof input !== 'string' || input.length > 64) throw new GameApiError('VALIDATION_ERROR', 'Invalid UID')
  return input
}

function positiveId(input: unknown): number | string {
  if ((typeof input !== 'number' && typeof input !== 'string') || !Number.isSafeInteger(Number(input)) || Number(input) <= 0) throw new GameApiError('VALIDATION_ERROR', 'Invalid room or friend id')
  return input
}
function requestIdField(input: unknown, optional = false): string | undefined {
  if (input === undefined && optional) return undefined
  if (typeof input !== 'string' || input.length < 1 || input.length > 160) throw new GameApiError('VALIDATION_ERROR', 'Invalid request id')
  return input
}

function remarkField(input: unknown): string {
  if (typeof input !== 'string' || [...input].length > 50) throw new GameApiError('VALIDATION_ERROR', 'Invalid friend remark')
  return input
}

export function createGameAccountHandlers({ api, store, sync, deviceName, userDataPath, realtime }: HandlerOptions): AccountHandlers {
  let authGeneration = 0
  async function run<T>(work: () => Promise<T>, token?: string): Promise<AccountResult<T>> {
    try { return { ok: true, data: await work() } } catch (cause) {
      const failure = cause instanceof GameApiError ? cause : new GameApiError('SERVICE_UNAVAILABLE', 'Account service is unavailable')
      const detail = failure.data as { retryAfterMs?: unknown } | undefined
      const error = { code: failure.code, message: failure.message, ...(typeof detail?.retryAfterMs === 'number' ? { retryAfterMs: detail.retryAfterMs } : {}) }
      if (token && store.getSession()?.token === token && ['ACCOUNT_BANNED', 'SESSION_EXPIRED', 'AUTH_INVALID'].includes(failure.code)) {
        realtime?.stop()
        sync.invalidateSession(error)
      }
      return { ok: false, error }
    }
  }
  function protectedCall<T>(work: (token: string) => Promise<T>): Promise<AccountResult<T>> {
    const token = store.getSession()?.token
    return run(async () => {
      if (!token) throw new GameApiError('AUTH_INVALID', 'Please log in')
      return work(token)
    }, token)
  }
  async function applyRoomWallet(result: any): Promise<any> {
    const session = store.getSession()
    const member = result?.room?.members?.find((item: any) => String(item.userId) === String(session?.userId))
    if (userDataPath && Number.isSafeInteger(member?.balance) && member.balance >= 0) {
      await applyServerWalletCoins(userDataPath, member.balance)
    }
    return result
  }
  function clear() {
    authGeneration++
    try { realtime?.stop(); store.clearSession() } finally { sync.sessionChanged() }
  }
  function authenticate(input: LoginRequest | RegisterRequest, register: boolean) {
    const epoch = ++authGeneration
    return run(async () => {
      const request = { email: textField(input, 'email'), password: textField(input, 'password'), deviceId: store.getDeviceId(), deviceName }
      const result: AuthResult = register
        ? await api.register({ ...request, code: textField(input, 'code'), nickname: textField(input, 'nickname', true) })
        : await api.login(request)
      if (epoch !== authGeneration) {
        void api.logout(result.token).catch(() => {})
        return sync.getState()
      }
      if (result.user.status === 2) throw new GameApiError('ACCOUNT_BANNED', 'Account is banned', 403)
      const previous = store.getSession()
      store.setSession({ userId: result.user.id, uid: result.user.uid, email: result.user.email, nickname: result.user.nickname, token: result.token, deviceId: store.getDeviceId(), lastRevision: 0, status: result.user.status })
      store.setSyncMetadata({ checksum: null, pending: true })
      sync.sessionChanged()
      realtime?.start()
      if (previous && previous.token !== result.token) void api.logout(previous.token).catch(() => {})
      void sync.syncNow()
      return sync.getState()
    })
  }
  return {
    gameAccountGetState: async () => sync.getState(),
    gameAccountSendEmailCode: input => run(async () => {
      const purpose = textField(input, 'purpose')
      if (purpose !== 'register' && purpose !== 'reset_password') throw new GameApiError('VALIDATION_ERROR', 'Invalid email code purpose')
      return api.sendEmailCode({ email: textField(input, 'email'), purpose })
    }),
    gameAccountLogin: input => authenticate(input, false),
    gameAccountRegister: input => authenticate(input, true),
    gameAccountLogout: () => run(async () => {
      const token = store.getSession()?.token
      clear()
      if (token) await api.logout(token)
      return sync.getState()
    }),
    gameAccountMe: () => protectedCall(async token => {
      const result = await api.me(token)
      const session = store.getSession()
      if (session?.token === token) store.setSession({ ...session, uid: result.user.uid, email: result.user.email, nickname: result.user.nickname, status: result.user.status })
      return sync.getState()
    }),
    gameAccountChangePassword: input => protectedCall(async token => {
      await api.changePassword(token, { oldPassword: textField(input, 'oldPassword'), newPassword: textField(input, 'newPassword') })
      if (store.getSession()?.token === token) clear()
      return sync.getState()
    }),
    gameAccountResetPassword: input => run(async () => {
      const email = textField(input, 'email')
      await api.resetPassword({ email, code: textField(input, 'code'), newPassword: textField(input, 'newPassword') })
      if (store.getSession()?.email.toLowerCase() === email.trim().toLowerCase()) clear()
      return sync.getState()
    }),
    gameAccountSyncNow: () => run(async () => { await sync.syncNow(); return sync.getState() }),
    gameAccountResolveConflict: choice => run(async () => { await sync.resolveConflict(choice); return sync.getState() }),
    gameAccountListFriends: () => protectedCall(async token => {
      const result = await api.listFriends(token)
      realtime?.refresh?.()
      return result
    }),
    gameAccountSearchFriend: input => protectedCall(token => api.searchFriend(token, uidField(input))),
    gameAccountSendFriendRequest: input => protectedCall(async token => {
      const result = await api.sendFriendRequest(token, uidField(input))
      realtime?.refresh?.()
      return result
    }),
    gameAccountRespondFriendRequest: (input, actionArgument) => protectedCall(token => {
      const requestInput: unknown = actionArgument === undefined ? input : { requestId: input, action: actionArgument }
      if (!requestInput || typeof requestInput !== 'object' || Array.isArray(requestInput)) throw new GameApiError('VALIDATION_ERROR', 'Invalid request')
      const value = (requestInput as Record<string, unknown>).requestId
      const action = (requestInput as Record<string, unknown>).action
      if ((typeof value !== 'number' && typeof value !== 'string') || !Number.isSafeInteger(Number(value)) || Number(value) <= 0 || (action !== 'accept' && action !== 'reject')) {
        throw new GameApiError('VALIDATION_ERROR', 'Invalid friend request')
      }
      return api.respondFriendRequest(token, value, action).then((result: unknown) => { realtime?.refresh?.(); return result })
    }),
    gameAccountRemoveFriend: input => protectedCall(token => {
      if ((typeof input !== 'number' && typeof input !== 'string') || !Number.isSafeInteger(Number(input)) || Number(input) <= 0) {
        throw new GameApiError('VALIDATION_ERROR', 'Invalid friend id')
      }
      return api.removeFriend(token, input).then((result: unknown) => { realtime?.refresh?.(); return result })
    }),
    gameAccountCreateAnimalFlipRoom: (input, requestArgument) => protectedCall(token => api.createAnimalFlipRoom(token, positiveId(input), requestIdField(requestArgument, true)).then(applyRoomWallet)),
    gameAccountJoinAnimalFlipRoom: (input, requestArgument) => protectedCall(token => {
      if (typeof input !== 'string' || !/^\d{6}$/.test(input)) throw new GameApiError('VALIDATION_ERROR', 'Invalid room code')
      return api.joinAnimalFlipRoom(token, input, requestIdField(requestArgument, true)).then(applyRoomWallet)
    }),
    gameAccountGetAnimalFlipRoom: input => protectedCall(token => api.getAnimalFlipRoom(token, positiveId(input))),
    gameAccountSetAnimalFlipReady: (input, readyArgument, requestArgument) => protectedCall(token => api.setAnimalFlipReady(token, positiveId(input), Boolean(readyArgument), requestIdField(requestArgument, true)).then(applyRoomWallet)),
    gameAccountLeaveAnimalFlipRoom: (input, requestArgument) => protectedCall(token => api.leaveAnimalFlipRoom(token, positiveId(input), requestIdField(requestArgument, true)).then(applyRoomWallet)),
    gameAccountRecoverAnimalFlipRoom: (input, requestArgument) => protectedCall(token => api.recoverAnimalFlipRoom(token, positiveId(input), requestIdField(requestArgument, true)).then(applyRoomWallet)),
    gameAccountSubmitAnimalFlipAction: (input, actionArgument, seqArgument, requestArgument) => protectedCall(token => {
      const roomId = positiveId(input); const seq = Number(seqArgument); const requestId = requestIdField(requestArgument) as string
      if (!Number.isSafeInteger(seq) || seq < 0 || !actionArgument || typeof actionArgument !== 'object') throw new GameApiError('VALIDATION_ERROR', 'Invalid animal flip action')
      return api.submitAnimalFlipAction(token, roomId, actionArgument as AnimalFlipAction, seq, requestId).then(applyRoomWallet)
    }),
    gameAccountSubscribeAnimalFlipRoom: input => protectedCall(async () => {
      const roomId = positiveId(input)
      realtime?.send?.({ type: 'animal_flip.subscribe', roomId })
      return {}
    }),
    gameAccountUpdateFriendRemark: (input, remarkArgument) => protectedCall(token => {
      const requestInput: unknown = remarkArgument === undefined ? input : { userId: input, remark: remarkArgument }
      if (!requestInput || typeof requestInput !== 'object' || Array.isArray(requestInput)) throw new GameApiError('VALIDATION_ERROR', 'Invalid request')
      const value = (requestInput as Record<string, unknown>).userId
      if ((typeof value !== 'number' && typeof value !== 'string') || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
        throw new GameApiError('VALIDATION_ERROR', 'Invalid friend id')
      }
      return api.updateFriendRemark(token, value, remarkField((requestInput as Record<string, unknown>).remark)).then((result: unknown) => { realtime?.refresh?.(); return result })
    }),
    gameAccountGetFriendFarm: (input, recordVisit = true) => protectedCall(token => recordVisit === false
      ? api.getFriendFarm(token, positiveId(input), false)
      : api.getFriendFarm(token, positiveId(input))),
    gameAccountSubscribeFarm: input => protectedCall(async () => { realtime?.send?.({ type: 'farm.subscribe', ownerId: positiveId(input) }); return {} }),
    gameAccountUnsubscribeFarm: input => protectedCall(async () => { realtime?.send?.({ type: 'farm.unsubscribe', ownerId: positiveId(input) }); return {} }),
    gameAccountStealFriendFarm: (input, plotArgument) => protectedCall(async token => {
      const requestInput: unknown = plotArgument === undefined ? input : { userId: input, plotIndex: plotArgument }
      if (!requestInput || typeof requestInput !== 'object' || Array.isArray(requestInput)) throw new GameApiError('VALIDATION_ERROR', 'Invalid request')
      const value = (requestInput as Record<string, unknown>).userId
      const plotIndex = (requestInput as Record<string, unknown>).plotIndex
      if ((typeof value !== 'number' && typeof value !== 'string') || !Number.isSafeInteger(Number(value)) || Number(value) <= 0 || !Number.isSafeInteger(plotIndex) || Number(plotIndex) < 0) throw new GameApiError('VALIDATION_ERROR', 'Invalid farm plot')
      const result = await api.stealFriendFarm(token, value, plotIndex)
      // 偷取接口同时更新了访问者的云存档，立即应用云端结果，确保背包马上显示收益。
      try { await sync.syncNow() } catch { /* 云端收益已提交，下一次同步继续应用。 */ }
      return result
    }),
    gameAccountListFarmVisits: () => protectedCall(token => api.listFarmVisits(token)),
  }
}

let disposeRegistration: (() => void) | undefined
export function registerGameAccountIpc(getMain: () => BrowserWindow | null, isTrustedUrl: (url: string) => boolean): () => void {
  if (disposeRegistration) return disposeRegistration
  const userDataPath = app.getPath('userData')
  const apiBaseUrl = getGameApiBaseUrl(app.isPackaged, { GAME_API_BASE_URL: process.env.GAME_API_BASE_URL })
  const api = createGameApi(apiBaseUrl)
  const store = createSessionStore(userDataPath, safeStorage)
  const authorization = { getMain, isTrustedUrl }
  const sync = createSyncCoordinator({
    userDataPath, api, sessionStore: store,
    publish: state => getTrustedMainWindow(authorization)?.webContents.send('game-account:state-changed', state),
    onCloudApplied: game => getTrustedMainWindow(authorization)?.webContents.send('game:state-changed', toGameViewState(game)),
  })
  const realtime = createGameRealtime({
    url: getGameWebSocketUrl(apiBaseUrl),
    getToken: () => store.getSession()?.token,
    onEvent: event => {
      if (event.type.startsWith('animal_flip.')) getTrustedMainWindow(authorization)?.webContents.send('game-account:animal-flip-event', event)
      else if (event.type === 'farm.visit') getTrustedMainWindow(authorization)?.webContents.send('game-account:farm-visit', event)
      else if (event.type === 'farm.updated') getTrustedMainWindow(authorization)?.webContents.send('game-account:farm-updated', event)
      else if (event.type === 'presence.snapshot' || event.type === 'presence.changed') getTrustedMainWindow(authorization)?.webContents.send('game-account:presence-changed', event)
    },
  })
  const handlers = createGameAccountHandlers({ api, store, sync, realtime, userDataPath, deviceName: hostname().slice(0, 100) })
  for (const [name, handler] of Object.entries(handlers)) {
    ipcMain.handle(`game-account:${name}`, createAccountIpcHandler(handler as (input: unknown) => Promise<unknown>, authorization))
  }
  const unsubscribe = onGameSaved(event => { if (event.userDataPath === userDataPath) sync.markDirty() })
  disposeRegistration = () => {
    unsubscribe()
    realtime.stop()
    sync.dispose()
    for (const name of Object.keys(handlers)) ipcMain.removeHandler(`game-account:${name}`)
    disposeRegistration = undefined
  }
  if (store.getSession()) {
    realtime.start()
    void sync.syncNow()
  }
  return disposeRegistration
}
