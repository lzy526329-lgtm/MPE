import { app, ipcMain, type BrowserWindow } from 'electron'
import { loadGame, readGameState, withGame, type GameStoreFileOps } from '../game/gameStore'
import { emptyGameViewState, toGameActionResult, toGameViewState } from '../game/gameEngine'
import type { GameActionResult, GameMutationResult, GameState, GameViewState } from '../game/gameTypes'
import type { HouseDecorPlacement, HouseSurface } from '../farm/farmTypes'
import type { FurnitureId } from '../game/furnitureCatalog'
import { placeHouseDecor, removeHouseDecor, saveHouseDecors } from './houseEngine'
export type HouseActionResult = GameActionResult & { placement?: HouseDecorPlacement }
export type HouseHandlers = { getState: () => Promise<GameViewState>; place: (id: string, surface: HouseSurface) => Promise<HouseActionResult>; remove: (id: string) => Promise<HouseActionResult>; save: (items: HouseDecorPlacement[]) => Promise<HouseActionResult> }
export function createHouseHandlers(options: { userDataPath: string; now: () => number; publish: (s: GameViewState) => void; fileOps?: Partial<GameStoreFileOps> }): HouseHandlers {
  const run = async (fn: (s: GameState, v: GameViewState) => GameMutationResult): Promise<HouseActionResult> => {
    try {
      const result = await withGame(options.userDataPath, options.now(), (s) => fn(s, toGameViewState(s)), options.fileOps)
      const out = toGameActionResult({ ...result, state: toGameViewState(result.game) })
      if (out.ok) options.publish(out.state)
      return out
    } catch {
      let state: GameViewState
      try { state = toGameViewState(readGameState(options.userDataPath, options.now(), options.fileOps).state) }
      catch { state = emptyGameViewState() }
      return { ok: false, code: 'PERSISTENCE_FAILED', message: '保存失败', state }
    }
  }
  return { getState: async () => toGameViewState(loadGame(options.userDataPath, options.now(), options.fileOps)), place: (id, surface) => run((s, v) => placeHouseDecor(s, id, surface, v)), remove: (id) => run((s, v) => removeHouseDecor(s, id, v)), save: (items) => run((s, v) => saveHouseDecors(s, items, v)) }
}
export function registerHouseIpc(getMain: () => BrowserWindow | null): void {
  const handlers = createHouseHandlers({ userDataPath: app.getPath('userData'), now: Date.now, publish: (s) => getMain()?.webContents.send('game:state-changed', s) })
  ipcMain.handle('house:get-state', () => handlers.getState())
  ipcMain.handle('house:place-decor', (_e, r: { decorId: FurnitureId; surface: HouseSurface }) => handlers.place(r.decorId, r.surface))
  ipcMain.handle('house:remove-decor', (_e, r: { instanceId: string }) => handlers.remove(r.instanceId))
  ipcMain.handle('house:save-decors', (_e, r: { placements: HouseDecorPlacement[] }) => handlers.save(r.placements))
}
