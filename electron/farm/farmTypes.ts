import type { CropId } from './cropCatalog'

export type { CropId, CropDef } from './cropCatalog'

export type PlotEmpty = { status: 'empty' }
export type PlotLocked = { status: 'locked' }

export type PlotPlanted = {
  status: 'growing' | 'ready'
  cropId: CropId
  plantedAt: number
  lastWateredAt: number
  progressMs: number
  hasBug?: boolean
}

export type PlotState = PlotEmpty | PlotLocked | PlotPlanted

export type Weather = 'clear' | 'rain'

export type FarmPageContext = {
  playerLevel: number
  walletCoins: number
}

export type FarmState = {
  version: 1
  plotCount: 24
  plots: PlotState[]
  inventory: Record<string, number>
  seeds: Record<string, number>
  weather: Weather
  lastSettledAt: number
  lastDailySeedClaimAt?: string
  lastWeatherRollAt?: number
}
