import { app, ipcMain } from 'electron'

import {
  claimDailySeeds,
  clearWithered,
  harvest,
  harvestAll,
  plant,
  rollOpenEvents,
  squashBug,
  water,
  waterAll,
} from './farmEngine'
import { withFarm } from './farmStore'
import type { CropId } from './farmTypes'

export function registerFarmIpc() {
  const root = () => app.getPath('userData')

  ipcMain.handle('farm:get-state', () => {
    const now = Date.now()
    return withFarm(root(), now, (s) => ({
      ok: true as const,
      state: rollOpenEvents(s, now),
    }))
  })

  ipcMain.handle('farm:plant', (_event, request: { plotIndex: number; cropId: CropId }) => {
    const now = Date.now()
    return withFarm(root(), now, (s) => plant(s, request.plotIndex, request.cropId, now))
  })

  ipcMain.handle('farm:water', (_event, request: { plotIndex: number }) => {
    const now = Date.now()
    return withFarm(root(), now, (s) => water(s, request.plotIndex, now))
  })

  ipcMain.handle('farm:debug', (_event, request: { plotIndex: number }) => {
    const now = Date.now()
    return withFarm(root(), now, (s) => squashBug(s, request.plotIndex))
  })

  ipcMain.handle('farm:harvest', (_event, request: { plotIndex: number }) => {
    const now = Date.now()
    return withFarm(root(), now, (s) => harvest(s, request.plotIndex, now))
  })

  ipcMain.handle('farm:clear-withered', (_event, request: { plotIndex: number }) => {
    const now = Date.now()
    return withFarm(root(), now, (s) => clearWithered(s, request.plotIndex))
  })

  ipcMain.handle('farm:claim-daily-seeds', () => {
    const now = Date.now()
    return withFarm(root(), now, (s) => claimDailySeeds(s, now))
  })

  ipcMain.handle('farm:water-all', () => {
    const now = Date.now()
    return withFarm(root(), now, (s) => waterAll(s, now))
  })

  ipcMain.handle('farm:harvest-all', () => {
    const now = Date.now()
    return withFarm(root(), now, (s) => harvestAll(s, now))
  })
}
