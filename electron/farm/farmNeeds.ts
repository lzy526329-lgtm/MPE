import { CROPS } from './farmCatalog'
import type { CropId, FarmState, PlotState, Weather } from './farmTypes'

export type FarmNeedKind = 'harvest' | 'bug' | 'water'

function waterIntervalMs(cropId: CropId, weather: Weather): number {
  const base = CROPS[cropId].waterIntervalMs
  return weather === 'rain' ? base * 2 : base
}

function plotNeed(plot: PlotState, weather: Weather, now: number): FarmNeedKind | null {
  if (plot.status === 'locked' || plot.status === 'empty') return null
  if (plot.status === 'ready') return 'harvest'
  if (plot.hasBug) return 'bug'
  if (weather === 'rain') return null
  if (now > plot.lastWateredAt + waterIntervalMs(plot.cropId, weather)) return 'water'
  return null
}

/** 当前农场需要处理的事项，按 收获 > 除虫 > 浇水 去重排序。 */
export function detectFarmNeeds(state: FarmState, now: number): FarmNeedKind[] {
  const found = new Set<FarmNeedKind>()
  for (const plot of state.plots) {
    const need = plotNeed(plot, state.weather, now)
    if (need) found.add(need)
  }
  return (['harvest', 'bug', 'water'] as const).filter((kind) => found.has(kind))
}
