import { app, ipcMain, type BrowserWindow } from 'electron'

import { notifyPetStatusChanged } from '../pet'
import {
  createDefaultGameState,
  runFarmAction,
  toCompatFarmState,
  toGameViewState,
} from '../game/gameEngine'
import { readGameState, withGame, type GameStoreFileOps } from '../game/gameStore'
import type { FarmGameMutationResult, GameViewState } from '../game/gameTypes'
import {
  claimDailySeeds,
  clearWithered,
  harvest,
  harvestAll,
  plant,
  rollOpenEvents,
  settle,
  squashBug,
  water,
  waterAll,
  type FarmActionResult,
} from './farmEngine'
import type { CropId, FarmState } from './farmTypes'

export const FARM_PERSISTENCE_ERROR = '保存失败，请重试'

export type PlotRequest = { plotIndex: number }
export type PlantRequest = { plotIndex: number; cropId: CropId }

export type FarmHandlers = {
  getState: () => Promise<FarmActionResult>
  plant: (request: PlantRequest) => Promise<FarmActionResult>
  water: (request: PlotRequest) => Promise<FarmActionResult>
  debug: (request: PlotRequest) => Promise<FarmActionResult>
  harvest: (request: PlotRequest) => Promise<FarmActionResult>
  clearWithered: (request: PlotRequest) => Promise<FarmActionResult>
  claimDailySeeds: () => Promise<FarmActionResult>
  waterAll: () => Promise<FarmActionResult>
  harvestAll: () => Promise<FarmActionResult>
}

export type FarmHandlerName = keyof FarmHandlers

export type FarmHandlerOptions = {
  userDataPath: () => string
  now: () => number
  publish: (state: GameViewState) => void
  publishPetStatus: () => void
  fileOps?: Partial<GameStoreFileOps>
}

type FarmMutation = FarmGameMutationResult & { coinsChanged: boolean }

export function createFarmHandlers(options: FarmHandlerOptions): FarmHandlers {
  const fileOps = options.fileOps ?? {}

  /**
   * A failed write leaves the previous `game.json` intact, so the state still on
   * disk is what the renderer should keep showing. A default farm is the last
   * resort when even that read is impossible.
   */
  const fallbackFarm = (userDataPath: string, now: number): FarmState => {
    try {
      return toCompatFarmState(readGameState(userDataPath, now, fileOps).state)
    } catch {
      return toCompatFarmState(createDefaultGameState(now))
    }
  }

  /**
   * Every farm channel runs the same pipeline: settle offline progress, apply one
   * pure farm action, commit the whole `GameState` once, then broadcast so the
   * shop, backpack and farm pages stay in sync.
   */
  const run = async (
    action: (farm: FarmState, now: number) => FarmActionResult,
  ): Promise<FarmActionResult> => {
    const now = options.now()
    const userDataPath = options.userDataPath()

    let mutation: FarmMutation
    try {
      mutation = await withGame<FarmMutation>(
        userDataPath,
        now,
        (game) => {
          const coinsBefore = game.wallet.coins
          const result = runFarmAction(game, (farm) => action(settle(farm, now), now))
          return { ...result, coinsChanged: result.game.wallet.coins !== coinsBefore }
        },
        fileOps,
      )
    } catch (error) {
      console.error('[farm] failed to persist a farm action', error)
      return { ok: false, error: FARM_PERSISTENCE_ERROR, state: fallbackFarm(userDataPath, now) }
    }

    if (!mutation.ok) return mutation.farm
    options.publish(toGameViewState(mutation.game))
    // The pet status only surfaces coins, so it is refreshed only when a farm
    // action actually moved the wallet.
    if (mutation.coinsChanged) options.publishPetStatus()
    return mutation.farm
  }

  return {
    getState: () => run((farm, now) => ({ ok: true, state: rollOpenEvents(farm, now) })),
    plant: (request) => run((farm, now) => plant(farm, request.plotIndex, request.cropId, now)),
    water: (request) => run((farm, now) => water(farm, request.plotIndex, now)),
    debug: (request) => run((farm) => squashBug(farm, request.plotIndex)),
    harvest: (request) => run((farm, now) => harvest(farm, request.plotIndex, now)),
    clearWithered: (request) => run((farm) => clearWithered(farm, request.plotIndex)),
    claimDailySeeds: () => run((farm, now) => claimDailySeeds(farm, now)),
    waterAll: () => run((farm, now) => waterAll(farm, now)),
    harvestAll: () => run((farm, now) => harvestAll(farm, now)),
  }
}

export function registerFarmIpc(getMain: () => BrowserWindow | null): void {
  const handlers = createFarmHandlers({
    userDataPath: () => app.getPath('userData'),
    now: Date.now,
    publish: (state) => getMain()?.webContents.send('game:state-changed', state),
    publishPetStatus: notifyPetStatusChanged,
  })

  ipcMain.handle('farm:get-state', () => handlers.getState())
  ipcMain.handle('farm:plant', (_event, request: PlantRequest) => handlers.plant(request))
  ipcMain.handle('farm:water', (_event, request: PlotRequest) => handlers.water(request))
  ipcMain.handle('farm:debug', (_event, request: PlotRequest) => handlers.debug(request))
  ipcMain.handle('farm:harvest', (_event, request: PlotRequest) => handlers.harvest(request))
  ipcMain.handle('farm:clear-withered', (_event, request: PlotRequest) =>
    handlers.clearWithered(request),
  )
  ipcMain.handle('farm:claim-daily-seeds', () => handlers.claimDailySeeds())
  ipcMain.handle('farm:water-all', () => handlers.waterAll())
  ipcMain.handle('farm:harvest-all', () => handlers.harvestAll())
}
