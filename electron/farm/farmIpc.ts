import { app, ipcMain, type BrowserWindow } from 'electron'

import { notifyPetStatusChanged } from '../pet'
import {
  createDefaultGameState,
  runFarmAction,
  toCompatFarmState,
  toGameViewState,
  unlockPlotWithPayment,
} from '../game/gameEngine'
import { readGameState, withGame, type GameStoreFileOps } from '../game/gameStore'
import type { FarmGameMutationResult, GameState, GameViewState } from '../game/gameTypes'
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
import { farmXpProgress, grantFarmExperience } from './farmLevel'
import {
  DAILY_SEED_XP,
  PLANT_XP,
  harvestXpForCrop,
} from './farmLevelCatalog'
import type { CropId, FarmPageContext, FarmState, PlacedDecor } from './farmTypes'
import {
  placeDecor,
  removePlacedDecor,
  savePlacedDecors,
} from './decorEngine'
import type { DecorId } from '../game/gameTypes'

export const FARM_PERSISTENCE_ERROR = '保存失败，请重试'

export type PlotRequest = { plotIndex: number }
export type PlantRequest = { plotIndex: number; cropId: CropId }

export type PlaceDecorRequest = { decorId: DecorId }
export type RemoveDecorRequest = { instanceId: string }
export type SavePlacedDecorsRequest = { placedDecors: PlacedDecor[] }

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
  placeDecor: (request: PlaceDecorRequest) => Promise<FarmActionResult>
  removeDecor: (request: RemoveDecorRequest) => Promise<FarmActionResult>
  savePlacedDecors: (request: SavePlacedDecorsRequest) => Promise<FarmActionResult>
}

export type FarmHandlerName = keyof FarmHandlers

export type FarmHandlerOptions = {
  userDataPath: () => string
  now: () => number
  publish: (state: GameViewState) => void
  publishPetStatus: () => void
  fileOps?: Partial<GameStoreFileOps>
}

type FarmMutation = FarmGameMutationResult & {
  coinsChanged: boolean
  levelUpMessage?: string
}

function buildFarmContext(game: GameState, levelUpMessage?: string): FarmPageContext {
  const totalXp = game.farm.totalXp ?? 0
  const progress = farmXpProgress(totalXp)
  return {
    walletCoins: game.wallet.coins,
    farmLevel: progress.level,
    farmTotalXp: totalXp,
    farmXpProgress: {
      current: progress.current,
      required: progress.required,
      isMaxLevel: progress.isMaxLevel,
    },
    ownedDecors: { ...game.inventory.decors },
    ...(levelUpMessage ? { levelUpMessage } : {}),
  }
}

function attachContext(result: FarmActionResult, context: FarmPageContext): FarmActionResult {
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
      return buildFarmContext(game)
    } catch {
      return buildFarmContext(createDefaultGameState(now))
    }
  }

  const run = async (
    action: (farm: FarmState, now: number) => FarmActionResult,
    resolveXp: (farmBefore: FarmState) => number = () => 0,
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
          const farmBefore = toCompatFarmState(game)
          const result = runFarmAction(game, (farm) => action(settle(farm, now), now))
          if (!result.ok) {
            return { ...result, coinsChanged: false, levelUpMessage: undefined }
          }

          const xp = resolveXp(farmBefore)
          if (xp <= 0) {
            return {
              ...result,
              coinsChanged: result.game.wallet.coins !== coinsBefore,
              levelUpMessage: undefined,
            }
          }

          const grant = grantFarmExperience(result.game, xp)
          return {
            ok: true,
            game: grant.game,
            farm: result.farm,
            coinsChanged: grant.game.wallet.coins !== coinsBefore,
            levelUpMessage: grant.levelUpMessage,
          }
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

    const context = buildFarmContext(mutation.game, mutation.levelUpMessage)
    if (!mutation.ok) return attachContext(mutation.farm, context)
    options.publish(toGameViewState(mutation.game))
    if (mutation.coinsChanged) options.publishPetStatus()
    return attachContext(mutation.farm, context)
  }

  const runUnlock = async (plotIndex: number): Promise<FarmActionResult> => {
    const now = options.now()
    const userDataPath = options.userDataPath()

    let mutation: FarmMutation
    try {
      mutation = await withGame<FarmMutation>(
        userDataPath,
        now,
        (game) => {
          const coinsBefore = game.wallet.coins
          const result = unlockPlotWithPayment(game, plotIndex, now)
          return {
            ...result,
            coinsChanged: result.ok && result.game.wallet.coins !== coinsBefore,
            levelUpMessage: result.levelUpMessage,
          }
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

    const context = buildFarmContext(mutation.game, mutation.levelUpMessage)
    if (!mutation.ok) return attachContext(mutation.farm, context)
    options.publish(toGameViewState(mutation.game))
    if (mutation.coinsChanged) options.publishPetStatus()
    return attachContext(mutation.farm, context)
  }

  const runDecor = async (
    action: (game: GameState) => { ok: boolean; message?: string; game: GameState },
  ): Promise<FarmActionResult> => {
    const now = options.now()
    const userDataPath = options.userDataPath()

    try {
      const mutation = await withGame(
        userDataPath,
        now,
        (game) => {
          const result = action(game)
          if (!result.ok) {
            return { ok: false, game: result.game, error: result.message ?? '操作失败' }
          }
          return { ok: true, game: result.game }
        },
        fileOps,
      )

      const context = buildFarmContext(mutation.game)
      if (!mutation.ok) {
        return attachContext(
          {
            ok: false,
            error: 'error' in mutation ? String(mutation.error) : '操作失败',
            state: toCompatFarmState(mutation.game),
          },
          context,
        )
      }

      options.publish(toGameViewState(mutation.game))
      return attachContext({ ok: true, state: toCompatFarmState(mutation.game) }, context)
    } catch (error) {
      console.error('[farm] failed to persist decor action', error)
      return attachContext(
        { ok: false, error: FARM_PERSISTENCE_ERROR, state: fallbackFarm(userDataPath, now) },
        fallbackContext(userDataPath, now),
      )
    }
  }

  return {
    getState: () => run((farm, now) => ({ ok: true, state: rollOpenEvents(farm, now) })),
    plant: (request) =>
      run(
        (farm, now) => plant(farm, request.plotIndex, request.cropId, now),
        () => PLANT_XP,
      ),
    water: (request) => run((farm, now) => water(farm, request.plotIndex, now)),
    debug: (request) => run((farm) => squashBug(farm, request.plotIndex)),
    harvest: (request) =>
      run(
        (farm, now) => harvest(farm, request.plotIndex, now),
        (farmBefore) => {
          const plot = farmBefore.plots[request.plotIndex]
          if (plot.status !== 'ready') return 0
          return harvestXpForCrop(plot.cropId)
        },
      ),
    unlockPlot: (request) => runUnlock(request.plotIndex),
    claimDailySeeds: () =>
      run(
        (farm, now) => claimDailySeeds(farm, now),
        () => DAILY_SEED_XP,
      ),
    waterAll: () => run((farm, now) => waterAll(farm, now)),
    harvestAll: () =>
      run(
        (farm, now) => harvestAll(farm, now),
        (farmBefore) =>
          farmBefore.plots.reduce((sum, plot) => {
            if (plot.status !== 'ready') return sum
            return sum + harvestXpForCrop(plot.cropId)
          }, 0),
      ),
    placeDecor: (request) =>
      runDecor((game) => {
        const view = toGameViewState(game)
        const result = placeDecor(game, request.decorId, view)
        return result.ok
          ? { ok: true, game: result.game }
          : { ok: false, message: result.message, game: result.game }
      }),
    removeDecor: (request) =>
      runDecor((game) => {
        const view = toGameViewState(game)
        const result = removePlacedDecor(game, request.instanceId, view)
        return result.ok
          ? { ok: true, game: result.game }
          : { ok: false, message: result.message, game: result.game }
      }),
    savePlacedDecors: (request) =>
      runDecor((game) => {
        const view = toGameViewState(game)
        const result = savePlacedDecors(game, request.placedDecors, view)
        return result.ok
          ? { ok: true, game: result.game }
          : { ok: false, message: result.message, game: result.game }
      }),
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
  ipcMain.handle('farm:unlock-plot', (_event, request: PlotRequest) => handlers.unlockPlot(request))
  ipcMain.handle('farm:claim-daily-seeds', () => handlers.claimDailySeeds())
  ipcMain.handle('farm:water-all', () => handlers.waterAll())
  ipcMain.handle('farm:harvest-all', () => handlers.harvestAll())
  ipcMain.handle('farm:place-decor', (_event, request: PlaceDecorRequest) => handlers.placeDecor(request))
  ipcMain.handle('farm:remove-decor', (_event, request: RemoveDecorRequest) => handlers.removeDecor(request))
  ipcMain.handle('farm:save-placed-decors', (_event, request: SavePlacedDecorsRequest) =>
    handlers.savePlacedDecors(request),
  )
}
