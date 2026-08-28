import { app, ipcMain, type BrowserWindow } from 'electron'

import { notifyPetStatusChanged, getPetPlayerLevel } from '../pet'
import {
  createDefaultGameState,
  runFarmAction,
  toCompatFarmState,
  toGameViewState,
  unlockPlotWithPayment,
} from '../game/gameEngine'
import { readGameState, withGame, type GameStoreFileOps } from '../game/gameStore'
import type { FarmGameMutationResult, GameViewState } from '../game/gameTypes'
import {
  claimDailySeeds,
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
import type { CropId, FarmPageContext, FarmState } from './farmTypes'

export const FARM_PERSISTENCE_ERROR = '保存失败，请重试'

export type PlotRequest = { plotIndex: number }
export type PlantRequest = { plotIndex: number; cropId: CropId }

export type FarmHandlers = {
  getState: () => Promise<FarmActionResult>
  plant: (request: PlantRequest) => Promise<FarmActionResult>
  water: (request: PlotRequest) => Promise<FarmActionResult>
  debug: (request: PlotRequest) => Promise<FarmActionResult>
  harvest: (request: PlotRequest) => Promise<FarmActionResult>
  unlockPlot: (request: PlotRequest) => Promise<FarmActionResult>
  claimDailySeeds: () => Promise<FarmActionResult>
  waterAll: () => Promise<FarmActionResult>
  harvestAll: () => Promise<FarmActionResult>
}

export type FarmHandlerName = keyof FarmHandlers

export type FarmHandlerOptions = {
  userDataPath: () => string
  now: () => number
  getPlayerLevel: () => number
  publish: (state: GameViewState) => void
  publishPetStatus: () => void
  fileOps?: Partial<GameStoreFileOps>
}

type FarmMutation = FarmGameMutationResult & { coinsChanged: boolean }

function buildFarmContext(game: { wallet: { coins: number } }, playerLevel: number): FarmPageContext {
  return {
    playerLevel,
    walletCoins: game.wallet.coins,
  }
}

function attachContext(
  result: FarmActionResult,
  context: FarmPageContext,
): FarmActionResult {
  return { ...result, context }
}

export function createFarmHandlers(options: FarmHandlerOptions): FarmHandlers {
  const fileOps = options.fileOps ?? {}

  const fallbackFarm = (userDataPath: string, now: number): FarmState => {
    try {
      return toCompatFarmState(readGameState(userDataPath, now, fileOps).state)
    } catch {
      return toCompatFarmState(createDefaultGameState(now))
    }
  }

  const fallbackContext = (userDataPath: string, now: number): FarmPageContext => {
    try {
      const game = readGameState(userDataPath, now, fileOps).state
      return buildFarmContext(game, options.getPlayerLevel())
    } catch {
      return { playerLevel: options.getPlayerLevel(), walletCoins: 0 }
    }
  }

  const run = async (
    action: (farm: FarmState, now: number) => FarmActionResult,
  ): Promise<FarmActionResult> => {
    const now = options.now()
    const userDataPath = options.userDataPath()
    const playerLevel = options.getPlayerLevel()

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
      return attachContext(
        { ok: false, error: FARM_PERSISTENCE_ERROR, state: fallbackFarm(userDataPath, now) },
        fallbackContext(userDataPath, now),
      )
    }

    const context = buildFarmContext(mutation.game, playerLevel)
    if (!mutation.ok) return attachContext(mutation.farm, context)
    options.publish(toGameViewState(mutation.game))
    if (mutation.coinsChanged) options.publishPetStatus()
    return attachContext(mutation.farm, context)
  }

  const runUnlock = async (plotIndex: number): Promise<FarmActionResult> => {
    const now = options.now()
    const userDataPath = options.userDataPath()
    const playerLevel = options.getPlayerLevel()

    let mutation: FarmMutation
    try {
      mutation = await withGame<FarmMutation>(
        userDataPath,
        now,
        (game) => {
          const coinsBefore = game.wallet.coins
          const result = unlockPlotWithPayment(game, plotIndex, playerLevel, now)
          return { ...result, coinsChanged: result.game.wallet.coins !== coinsBefore }
        },
        fileOps,
      )
    } catch (error) {
      console.error('[farm] failed to unlock plot', error)
      return attachContext(
        { ok: false, error: FARM_PERSISTENCE_ERROR, state: fallbackFarm(userDataPath, now) },
        fallbackContext(userDataPath, now),
      )
    }

    const context = buildFarmContext(mutation.game, playerLevel)
    if (!mutation.ok) return attachContext(mutation.farm, context)
    options.publish(toGameViewState(mutation.game))
    if (mutation.coinsChanged) options.publishPetStatus()
    return attachContext(mutation.farm, context)
  }

  return {
    getState: () => run((farm, now) => ({ ok: true, state: rollOpenEvents(farm, now) })),
    plant: (request) => run((farm, now) => plant(farm, request.plotIndex, request.cropId, now)),
    water: (request) => run((farm, now) => water(farm, request.plotIndex, now)),
    debug: (request) => run((farm) => squashBug(farm, request.plotIndex)),
    harvest: (request) => run((farm, now) => harvest(farm, request.plotIndex, now)),
    unlockPlot: (request) => runUnlock(request.plotIndex),
    claimDailySeeds: () => run((farm, now) => claimDailySeeds(farm, now)),
    waterAll: () => run((farm, now) => waterAll(farm, now)),
    harvestAll: () => run((farm, now) => harvestAll(farm, now)),
  }
}

export function registerFarmIpc(getMain: () => BrowserWindow | null): void {
  const handlers = createFarmHandlers({
    userDataPath: () => app.getPath('userData'),
    now: Date.now,
    getPlayerLevel: getPetPlayerLevel,
    publish: (state) => getMain()?.webContents.send('game:state-changed', state),
    publishPetStatus: notifyPetStatusChanged,
  })

  ipcMain.handle('farm:get-state', () => handlers.getState())
  ipcMain.handle('farm:plant', (_event, request: PlantRequest) => handlers.plant(request))
  ipcMain.handle('farm:water', (_event, request: PlotRequest) => handlers.water(request))
  ipcMain.handle('farm:debug', (_event, request: PlotRequest) => handlers.debug(request))
  ipcMain.handle('farm:harvest', (_event, request: PlotRequest) => handlers.harvest(request))
  ipcMain.handle('farm:unlock-plot', (_event, request: PlotRequest) => handlers.unlockPlot(request))
  ipcMain.handle('farm:claim-daily-seeds', () => handlers.claimDailySeeds())
  ipcMain.handle('farm:water-all', () => handlers.waterAll())
  ipcMain.handle('farm:harvest-all', () => handlers.harvestAll())
}
