export type CropId = 'lettuce' | 'tomato' | 'pumpkin'

export type CropDef = {
  id: CropId
  name: string
  growMs: number
  waterIntervalMs: number
  yieldItemId: string
  yieldMin: number
  yieldMax: number
}

export type PlotEmpty = { status: 'empty' }

export type PlotPlanted = {
  status: 'growing' | 'ready' | 'withered'
  cropId: CropId
  plantedAt: number
  lastWateredAt: number
  progressMs: number
  hasBug?: boolean
}

export type PlotState = PlotEmpty | PlotPlanted

export type Weather = 'clear' | 'rain'

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
