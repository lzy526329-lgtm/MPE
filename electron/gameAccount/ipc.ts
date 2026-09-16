import { app, ipcMain, safeStorage, type BrowserWindow } from 'electron'
import { hostname } from 'node:os'
import { onGameSaved } from '../game/gameStore'
import { toGameViewState } from '../game/gameEngine'
import { createGameApi, GameApiError, type GameApi } from './api'
import { getGameApiBaseUrl } from './config'
import { createSessionStore, type SessionStore } from './sessionStore'
import { createSyncCoordinator, type SyncCoordinator } from './syncCoordinator'
import { createAccountIpcHandler, getTrustedMainWindow } from './trustedRenderer'
import type { AccountResult, AuthResult, GameAccountBridge, GameAccountState, LoginRequest, RegisterRequest } from './types'

type HandlerOptions = { api: GameApi; store: SessionStore; sync: SyncCoordinator; deviceName: string }
type AccountHandlers = Omit<GameAccountBridge, 'onGameAccountStateChanged'>
function textField(input: unknown, field: string, optional = false): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new GameApiError('VALIDATION_ERROR', 'Invalid request')
  const value = (input as Record<string, unknown>)[field]
  if (optional && value === undefined) return ''
  if (typeof value !== 'string' || value.length > 1024) throw new GameApiError('VALIDATION_ERROR', 'Invalid account field')
  return value
}

export function createGameAccountHandlers({ api, store, sync, deviceName }: HandlerOptions): AccountHandlers {
  let authGeneration = 0
  async function run<T>(work: () => Promise<T>, token?: string): Promise<AccountResult<T>> {
    try { return { ok: true, data: await work() } } catch (cause) {
      const failure = cause instanceof GameApiError ? cause : new GameApiError('SERVICE_UNAVAILABLE', 'Account service is unavailable')
      const detail = failure.data as { retryAfterMs?: unknown } | undefined
      const error = { code: failure.code, message: failure.message, ...(typeof detail?.retryAfterMs === 'number' ? { retryAfterMs: detail.retryAfterMs } : {}) }
      if (token && store.getSession()?.token === token && ['ACCOUNT_BANNED', 'SESSION_EXPIRED', 'AUTH_INVALID'].includes(failure.code)) sync.invalidateSession(error)
      return { ok: false, error }
    }
  }
  function protectedCall(work: (token: string) => Promise<GameAccountState>) {
    const token = store.getSession()?.token
    return run(async () => {
      if (!token) throw new GameApiError('AUTH_INVALID', 'Please log in')
      return work(token)
    }, token)
  }
  function clear() {
    authGeneration++
    try { store.clearSession() } finally { sync.sessionChanged() }
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
  }
}

let disposeRegistration: (() => void) | undefined
export function registerGameAccountIpc(getMain: () => BrowserWindow | null, isTrustedUrl: (url: string) => boolean): () => void {
  if (disposeRegistration) return disposeRegistration
  const userDataPath = app.getPath('userData')
  const api = createGameApi(getGameApiBaseUrl(app.isPackaged, { GAME_API_BASE_URL: process.env.GAME_API_BASE_URL }))
  const store = createSessionStore(userDataPath, safeStorage)
  const authorization = { getMain, isTrustedUrl }
  const sync = createSyncCoordinator({
    userDataPath, api, sessionStore: store,
    publish: state => getTrustedMainWindow(authorization)?.webContents.send('game-account:state-changed', state),
    onCloudApplied: game => getTrustedMainWindow(authorization)?.webContents.send('game:state-changed', toGameViewState(game)),
  })
  const handlers = createGameAccountHandlers({ api, store, sync, deviceName: hostname().slice(0, 100) })
  for (const [name, handler] of Object.entries(handlers)) {
    ipcMain.handle(`game-account:${name}`, createAccountIpcHandler(handler as (input: unknown) => Promise<unknown>, authorization))
  }
  const unsubscribe = onGameSaved(event => { if (event.userDataPath === userDataPath) sync.markDirty() })
  disposeRegistration = () => {
    unsubscribe()
    sync.dispose()
    for (const name of Object.keys(handlers)) ipcMain.removeHandler(`game-account:${name}`)
    disposeRegistration = undefined
  }
  if (store.getSession()) void sync.syncNow()
  return disposeRegistration
}
