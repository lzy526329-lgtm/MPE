import { randomUUID } from 'node:crypto'

import { app, ipcMain, type BrowserWindow } from 'electron'

import {
  addCaughtFish,
  consumeBaitForCast,
  emptyGameViewState,
  toGameViewState,
} from '../game/gameEngine'
import { readGameState, withGame, type GameStoreFileOps } from '../game/gameStore'
import type { GameErrorCode, GameViewState } from '../game/gameTypes'
import { isBaitId } from './baitCatalog'
import {
  createFishingSessionManager,
  type FishingSessionManager,
  type FishingFightSnapshot,
  type FishingSessionPublic,
} from './fishingSession'
import type { BaitId, FishCatch } from './fishingTypes'

export type FishingCastResult =
  | { ok: true; state: GameViewState; session: FishingSessionPublic }
  | { ok: false; code: GameErrorCode; message: string; state: GameViewState }

export type FishingReelResult =
  | {
      ok: true
      status: 'continue'
      state: GameViewState
      fight: FishingFightSnapshot
    }
  | {
      ok: true
      status: 'caught'
      catch: FishCatch
      state: GameViewState
      fight: FishingFightSnapshot
    }
  | {
      ok: false
      status: 'invalid' | 'too-early' | 'too-late' | 'line-broken' | 'error'
      message: string
      state: GameViewState
    }

export type FishingHandlers = {
  getState: () => Promise<GameViewState>
  cast: (ownerId: number, baitId: BaitId) => Promise<FishingCastResult>
  reel: (ownerId: number, token: string) => Promise<FishingReelResult>
  cancel: (ownerId: number, token: string) => Promise<boolean>
}

export function createFishingHandlers(options: {
  userDataPath: string
  now: () => number
  sessions: FishingSessionManager
  publish: (state: GameViewState) => void
  fileOps?: Partial<GameStoreFileOps>
}): FishingHandlers {
  const fileOps = options.fileOps ?? {}
  const renderableState = (): GameViewState => {
    try {
      return toGameViewState(readGameState(options.userDataPath, options.now(), fileOps).state)
    } catch {
      return emptyGameViewState()
    }
  }

  return {
    getState: async () => renderableState(),
    cast: async (ownerId, baitId) => {
      if (!isBaitId(baitId)) {
        return { ok: false, code: 'UNKNOWN_ITEM', message: '未知鱼饵', state: renderableState() }
      }
      try {
        const mutation = await withGame(
          options.userDataPath,
          options.now(),
          (game) => consumeBaitForCast(game, baitId),
          fileOps,
        )
        if (!mutation.ok) {
          return {
            ok: false,
            code: mutation.code,
            message: mutation.message,
            state: mutation.state,
          }
        }
        const session = options.sessions.start(ownerId, baitId)
        options.publish(mutation.state)
        return { ok: true, state: mutation.state, session }
      } catch (error) {
        console.error('[fishing] failed to start a cast', error)
        return {
          ok: false,
          code: 'PERSISTENCE_FAILED',
          message: '保存失败',
          state: renderableState(),
        }
      }
    },
    reel: async (ownerId, token) => {
      const outcome = options.sessions.reel(ownerId, token)
      if (outcome.status === 'continue') {
        return {
          ok: true,
          status: 'continue',
          fight: {
            deadline: outcome.deadline,
            progress: outcome.progress,
            tension: outcome.tension,
            tensionAt: outcome.tensionAt,
            fishPull: outcome.fishPull,
            lineDangerUntil: outcome.lineDangerUntil,
            lineRecoveryUntil: outcome.lineRecoveryUntil,
            lineRecoveryStatus: outcome.lineRecoveryStatus,
          },
          state: renderableState(),
        }
      }
      if (outcome.status !== 'caught') {
        const messages = {
          invalid: '本轮钓鱼已失效',
          'too-early': '收杆太早，鱼儿受惊了',
          'too-late': '鱼儿已经脱钩',
          'line-broken': '鱼线绷断了，鱼儿逃走了',
        }
        return {
          ok: false,
          status: outcome.status,
          message: messages[outcome.status],
          state: renderableState(),
        }
      }
      try {
        const mutation = await withGame(
          options.userDataPath,
          options.now(),
          (game) => addCaughtFish(game, outcome.catch),
          fileOps,
        )
        if (!mutation.ok) {
          return { ok: false, status: 'error', message: mutation.message, state: mutation.state }
        }
        options.publish(mutation.state)
        return {
          ok: true,
          status: 'caught',
          catch: outcome.catch,
          fight: {
            deadline: outcome.deadline,
            progress: outcome.progress,
            tension: outcome.tension,
            tensionAt: outcome.tensionAt,
            fishPull: outcome.fishPull,
            lineDangerUntil: outcome.lineDangerUntil,
            lineRecoveryUntil: outcome.lineRecoveryUntil,
            lineRecoveryStatus: outcome.lineRecoveryStatus,
          },
          state: mutation.state,
        }
      } catch (error) {
        console.error('[fishing] failed to persist a catch', error)
        return { ok: false, status: 'error', message: '保存失败', state: renderableState() }
      }
    },
    cancel: async (ownerId, token) => options.sessions.cancel(ownerId, token),
  }
}

export function registerFishingIpc(getMain: () => BrowserWindow | null): void {
  const now = Date.now
  const handlers = createFishingHandlers({
    userDataPath: app.getPath('userData'),
    now,
    sessions: createFishingSessionManager({ now, randomUUID }),
    publish: (state) => getMain()?.webContents.send('game:state-changed', state),
  })

  ipcMain.handle('fishing:get-state', () => handlers.getState())
  ipcMain.handle('fishing:cast', (event, baitId: BaitId) =>
    handlers.cast(event.sender.id, baitId))
  ipcMain.handle('fishing:reel', (event, token: string) =>
    handlers.reel(event.sender.id, token))
  ipcMain.handle('fishing:cancel', (event, token: string) =>
    handlers.cancel(event.sender.id, token))
}
