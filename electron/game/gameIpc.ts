import { app, ipcMain, type BrowserWindow } from 'electron'

import { notifyPetStatusChanged } from '../pet'
import type { CropId } from '../farm/farmTypes'
import {
  buySeed,
  emptyGameViewState,
  sellProduce,
  toGameActionResult,
  toGameViewState,
} from './gameEngine'
import { loadGame, readGameState, withGame, type GameStoreFileOps } from './gameStore'
import type { GameActionResult, GameViewState } from './gameTypes'

export type GameHandlers = {
  getState: () => Promise<GameViewState>
  buySeed: (cropId: CropId) => Promise<GameActionResult>
  sellProduce: (produceId: string) => Promise<GameActionResult>
}

export type GameHandlerOptions = {
  userDataPath: string
  now: () => number
  publish: (state: GameViewState) => void
  publishPetStatus: () => void
  fileOps?: Partial<GameStoreFileOps>
}

export function createGameHandlers(options: GameHandlerOptions): GameHandlers {
  const fileOps = options.fileOps ?? {}
  let lastKnownState: GameViewState | null = null

  const remember = (state: GameViewState): GameViewState => {
    lastKnownState = state
    return state
  }

  /**
   * A write failure keeps the previous `game.json`, so the state still on disk is
   * the correct thing to show. If even that read fails we fall back to the last
   * state this handler served, and finally to an empty but renderable view.
   */
  const renderableState = (): GameViewState => {
    try {
      return toGameViewState(readGameState(options.userDataPath, options.now(), fileOps).state)
    } catch {
      return lastKnownState ?? emptyGameViewState()
    }
  }

  return {
    getState: async () => {
      const outcome = readGameState(options.userDataPath, options.now(), fileOps)
      if (outcome.dirty || outcome.corrupt) {
        return remember(toGameViewState(loadGame(options.userDataPath, options.now(), fileOps)))
      }
      return remember(toGameViewState(outcome.state))
    },
    buySeed: async (cropId) => {
      let result: GameActionResult
      try {
        result = toGameActionResult(
          await withGame(
            options.userDataPath,
            options.now(),
            (game) => buySeed(game, cropId),
            fileOps,
          ),
        )
      } catch (error) {
        console.error('[game] failed to persist a seed purchase', error)
        return {
          ok: false,
          code: 'PERSISTENCE_FAILED',
          message: '保存失败',
          state: renderableState(),
        }
      }

      remember(result.state)
      if (result.ok) {
        options.publish(result.state)
        options.publishPetStatus()
      }
      return result
    },
    sellProduce: async (produceId) => {
      let result: GameActionResult
      try {
        result = toGameActionResult(
          await withGame(
            options.userDataPath,
            options.now(),
            (game) => sellProduce(game, produceId),
            fileOps,
          ),
        )
      } catch (error) {
        console.error('[game] failed to persist a produce sale', error)
        return {
          ok: false,
          code: 'PERSISTENCE_FAILED',
          message: '保存失败',
          state: renderableState(),
        }
      }

      remember(result.state)
      if (result.ok) {
        options.publish(result.state)
        options.publishPetStatus()
      }
      return result
    },
  }
}

export function registerGameIpc(getMain: () => BrowserWindow | null): void {
  const handlers = createGameHandlers({
    userDataPath: app.getPath('userData'),
    now: Date.now,
    publish: (state) => getMain()?.webContents.send('game:state-changed', state),
    publishPetStatus: notifyPetStatusChanged,
  })

  ipcMain.handle('game:get-state', () => handlers.getState())
  ipcMain.handle('game:buy-seed', (_event, cropId: CropId) => handlers.buySeed(cropId))
  ipcMain.handle('game:sell-produce', (_event, produceId: string) => handlers.sellProduce(produceId))
}
