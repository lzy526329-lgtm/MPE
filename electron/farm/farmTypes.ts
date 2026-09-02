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

/** 已放置的农场装饰（相对 farm-stage 百分比坐标） */
export type PlacedDecor = {
  instanceId: string
  decorId: string
  left: number
  top: number
  width: number
  zIndex: number
  flipX?: boolean
}

export type FarmPageContext = {
  walletCoins: number
  farmLevel: number
  farmTotalXp: number
  farmXpProgress: {
    current: number
    required: number
    isMaxLevel: boolean
  }
  /** 未放置的装饰库存 */
  ownedDecors?: Record<string, number>
  levelUpMessage?: string
}

export type FarmState = {
  version: 1
  plotCount: 24
  plots: PlotState[]
  inventory: Record<string, number>
  seeds: Record<string, number>
  weather: Weather
  lastSettledAt: number
  totalXp: number
  lastDailySeedClaimAt?: string
  lastWeatherRollAt?: number
  placedDecors: PlacedDecor[]
}
