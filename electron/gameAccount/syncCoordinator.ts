import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { loadGame, parseGamePayload, readGameState, withGame } from '../game/gameStore'
import type { GameState } from '../game/gameTypes'
import { GameApiError, type GameApi } from './api'
import { createSessionStore, type SessionStore } from './sessionStore'
import type { AccountError, GameAccountSession, GameAccountState, SaveResult, SaveSummary, SaveUpload } from './types'

type Options = {
  userDataPath: string
  api: Pick<GameApi, 'getSave' | 'putSave' | 'resolveSave'>
  now?: () => number
  debounceMs?: number
  sessionStore?: SessionStore
  publish?: (state: GameAccountState) => void
  onCloudApplied?: (state: GameState) => void
}
const digest = (payload: string) => createHash('sha256').update(payload, 'utf8').digest('hex')

export function createSyncCoordinator(options: Options) {
  const now = options.now || Date.now
  const debounceMs = options.debounceMs ?? 2_000
  const store = options.sessionStore || createSessionStore(options.userDataPath, {
    isEncryptionAvailable: () => false, encryptString: () => { throw new Error('Encryption unavailable') }, decryptString: () => '',
  })
  let status: GameAccountState['status'] = store.getSession() ? 'offline-pending' : 'local-only'
  let error: AccountError | null = null
  let conflict: GameAccountState['conflict'] = null
  let dirty = store.getSyncMetadata().pending
  let initialized = false
  let generation = 0
  let disposed = false
  let applyingCloud = false
  let inFlight: Promise<void> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let retryAttempt = 0
  let retrying = false

  function getState(): GameAccountState {
    const session = store.getSession()
    const account = session ? { userId: session.userId, email: session.email, nickname: session.nickname, deviceId: session.deviceId, lastRevision: session.lastRevision, status: session.status } : null
    return { account, status: account ? status : 'local-only', conflict: conflict ? { ...conflict, local: { ...conflict.local }, cloud: { ...conflict.cloud } } : null, error: error ? { ...error } : null }
  }
  function publish() { options.publish?.(getState()) }
  function clearTimer() { if (timer) clearTimeout(timer); timer = undefined }
  function valid(session: GameAccountSession, epoch: number) {
    return !disposed && generation === epoch && store.getSession()?.token === session.token
  }
  function localSnapshot() {
    const game = readGameState(options.userDataPath, now()).state
    const payload = JSON.stringify(game)
    const file = path.join(options.userDataPath, 'game.json')
    const modified = fs.existsSync(file) ? fs.statSync(file).mtimeMs : now()
    const summary: SaveSummary = { coins: game.wallet.coins, farmTotalXp: game.farm.totalXp, totalCaught: game.fishing.totalCaught, clientUpdatedAt: new Date(modified).toISOString(), sourceDeviceId: store.getDeviceId() }
    return { game, payload, checksum: digest(payload), summary }
  }
  function upload(baseRevision: number): SaveUpload {
    const local = localSnapshot()
    return { baseRevision, schemaVersion: 2, payload: local.payload, checksum: local.checksum, deviceId: store.getDeviceId(), clientUpdatedAt: local.summary.clientUpdatedAt! }
  }
  function validateCloud(result: SaveResult) {
    if (!result || !['empty', 'synced', 'conflict'].includes(result.status)) throw new GameApiError('INVALID_SAVE', 'Invalid cloud save')
    if (!result.save) {
      if (result.status !== 'empty') throw new GameApiError('INVALID_SAVE', 'Missing cloud save')
      return
    }
    const save = result.save
    if (save.schemaVersion !== 2 || !Number.isSafeInteger(save.revision) || save.revision < 1 || typeof save.payload !== 'string' || digest(save.payload) !== save.checksum || !result.summary) throw new GameApiError('INVALID_SAVE', 'Invalid cloud save')
    parseGamePayload(save.payload, now())
  }
  function showConflict(result: SaveResult) {
    validateCloud(result)
    if (!result.save || !result.summary) throw new GameApiError('INVALID_SAVE', 'Missing cloud conflict')
    conflict = { local: localSnapshot().summary, cloud: { ...result.summary }, cloudRevision: result.save.revision }
    status = 'conflict'
    dirty = true
    clearTimer()
    store.setSyncMetadata({ ...store.getSyncMetadata(), pending: true })
    publish()
  }
  function schedule(delay: number) {
    clearTimer()
    if (disposed || !store.getSession() || conflict) return
    timer = setTimeout(() => { timer = undefined; void syncNow() }, delay)
    timer.unref?.()
  }
  function acknowledge(session: GameAccountSession, revision: number, checksum: string) {
    clearTimer()
    store.setSession({ ...session, lastRevision: revision })
    dirty = localSnapshot().checksum !== checksum
    store.setSyncMetadata({ checksum, pending: dirty })
    initialized = true
    retryAttempt = 0
    retrying = false
    conflict = null
    error = null
    status = dirty ? 'offline-pending' : 'synced'
    publish()
    if (dirty) schedule(debounceMs)
  }
  function handleError(cause: unknown, session: GameAccountSession, epoch: number) {
    if (!valid(session, epoch)) return
    const failure = cause instanceof GameApiError ? cause : new GameApiError('NETWORK_ERROR', 'Sync is pending')
    if (failure.code === 'SAVE_CONFLICT') {
      try { showConflict(failure.data as SaveResult); return } catch { /* Invalid cloud data must never replace the local save. */ }
    }
    error = { code: failure.code, message: failure.message }
    if (['ACCOUNT_BANNED', 'SESSION_EXPIRED', 'AUTH_INVALID'].includes(failure.code)) {
      invalidateSession({ code: failure.code, message: failure.message })
      return
    }
    dirty = true
    status = 'offline-pending'
    try { store.setSyncMetadata({ ...store.getSyncMetadata(), pending: true }) } catch { /* Local gameplay remains independent of account metadata writes. */ }
    retrying = true
    schedule([5_000, 15_000, 60_000][Math.min(retryAttempt++, 2)])
    publish()
  }
  async function performSync(session: GameAccountSession, epoch: number) {
    try {
      loadGame(options.userDataPath, now())
      status = 'syncing'
      error = null
      publish()
      if (!initialized) {
        const remote = await options.api.getSave(session.token)
        if (!valid(session, epoch)) return
        validateCloud(remote)
        const local = localSnapshot()
        if (remote.save?.checksum === local.checksum) {
          acknowledge(session, remote.save.revision, local.checksum)
          return
        }
        if (remote.save && (session.lastRevision === 0 || remote.save.revision !== session.lastRevision)) {
          showConflict(remote)
          return
        }
        initialized = true
      }
      const current = store.getSession()!
      const request = upload(current.lastRevision)
      if (!dirty && current.lastRevision > 0 && request.checksum === store.getSyncMetadata().checksum) {
        status = 'synced'; publish(); return
      }
      const result = await options.api.putSave(session.token, request)
      if (!valid(session, epoch)) return
      validateCloud(result)
      if (result.status === 'conflict') { showConflict(result); return }
      if (!result.save) throw new GameApiError('INVALID_SAVE', 'Upload returned no save')
      acknowledge(session, result.save.revision, request.checksum)
    } catch (cause) { handleError(cause, session, epoch) }
  }
  function syncNow(): Promise<void> {
    clearTimer()
    const session = store.getSession()
    if (disposed || !session || conflict) return Promise.resolve()
    if (inFlight) return inFlight
    const epoch = generation
    inFlight = performSync(session, epoch).finally(() => {
      inFlight = null
      if (epoch !== generation && store.getSession() && !disposed) schedule(0)
    })
    return inFlight
  }
  function markDirty() {
    if (applyingCloud || disposed || !store.getSession()) return
    dirty = true
    store.setSyncMetadata({ ...store.getSyncMetadata(), pending: true })
    if (conflict) { conflict.local = localSnapshot().summary; publish(); return }
    if (!inFlight) status = 'offline-pending'
    if (!retrying) schedule(debounceMs)
    publish()
  }
  function sessionChanged(emit = true) {
    generation++
    clearTimer()
    conflict = null
    error = null
    initialized = false
    dirty = Boolean(store.getSession())
    retryAttempt = 0
    retrying = false
    status = store.getSession() ? 'offline-pending' : 'local-only'
    if (emit) publish()
  }
  function invalidateSession(reason: AccountError) {
    try { store.clearSession() } finally {
      sessionChanged(false)
      error = reason
      publish()
    }
  }
  async function resolveConflict(choice: 'local' | 'cloud'): Promise<void> {
    if (choice !== 'local' && choice !== 'cloud') throw new GameApiError('VALIDATION_ERROR', 'Invalid save choice')
    if (inFlight) { await inFlight; return }
    const session = store.getSession()
    if (!session || !conflict || disposed) return
    const epoch = generation
    const baseRevision = conflict.cloudRevision
    const request = choice === 'local' ? { ...upload(baseRevision), choice } as const : { choice, baseRevision } as const
    const run = async () => {
      try {
        status = 'syncing'; publish()
        const result = await options.api.resolveSave(session.token, request)
        if (!valid(session, epoch)) return
        validateCloud(result)
        if (result.status === 'conflict') { showConflict(result); return }
        if (!result.save) throw new GameApiError('INVALID_SAVE', 'Resolution returned no save')
        let checksum = choice === 'local' ? (request as SaveUpload).checksum : result.save.checksum
        if (choice === 'cloud') {
          const game = parseGamePayload(result.save.payload, now())
          checksum = digest(JSON.stringify(game))
          // Use the same mutation queue as gameplay so a delayed local write cannot undo the chosen cloud save.
          await withGame(options.userDataPath, now(), () => {
            if (!valid(session, epoch)) return { ok: false, game }
            const file = path.join(options.userDataPath, 'game.json')
            if (fs.existsSync(file)) fs.writeFileSync(`${file}.backup-${randomUUID()}`, fs.readFileSync(file), { flag: 'wx', mode: 0o600 })
            applyingCloud = true
            return { ok: true, game }
          }).finally(() => { applyingCloud = false })
          if (!valid(session, epoch)) return
          options.onCloudApplied?.(game)
        }
        acknowledge(session, result.save.revision, checksum)
      } catch (cause) {
        // A failed explicit choice keeps the observed conflict available for another attempt.
        handleError(cause, session, epoch)
        if (conflict && valid(session, epoch)) { status = 'conflict'; publish() }
      }
    }
    inFlight = run().finally(() => {
      inFlight = null
      if (epoch !== generation && store.getSession() && !disposed) schedule(0)
    })
    await inFlight
  }
  return { markDirty, syncNow, getState, resolveConflict, sessionChanged, invalidateSession, dispose() { disposed = true; generation++; clearTimer() } }
}
export type SyncCoordinator = ReturnType<typeof createSyncCoordinator>
