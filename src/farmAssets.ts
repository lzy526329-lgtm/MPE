import type { CropId } from '../electron/farm/farmTypes'

export const FARM_ASSETS = {
  bg: '/farm/farm-bg.png',
  /** 未开垦：等距草地块（透明底；?v= 用于强制刷新旧缓存） */
  plotIsoEmpty: '/farm/dikuai2.png?v=4',
  /** 开垦/种植：等距土块 */
  plotIsoSoil: '/farm/dikuai1.png?v=4',
  cropsSheet: '/farm/crops-sheet.png',
  toolbar: '/farm/toolbar-icons.png',
} as const

/** farm-bg.png 像素比，保证百分比坐标与背景对齐 */
export const FARM_BG_ASPECT = 2516 / 1666

export type PlotLayout = {
  /** 相对 farm-stage 的 left % */
  left: number
  /** 相对 farm-stage 的 top % */
  top: number
  /** 相对 farm-stage 的 width % */
  width: number
}

/**
 * 6 块地在中央草地的大致位置（等距两排）。
 * 改数字即可微调；单位均为相对背景图的百分比。
 */
export const PLOT_LAYOUT: PlotLayout[] = [
  { left: 48, top: 28, width: 16 },
  { left: 38, top: 30, width: 16 },
  { left: 48, top: 48, width: 16 },
  { left: 29, top: 44, width: 16 },
  { left: 40, top: 47, width: 16 },
  { left: 51, top: 44, width: 16 },
]

export type PlotSoilDisplay = 'empty' | 'growing' | 'dry' | 'bug' | 'ready' | 'withered'

export function plotSoilSrc(display: PlotSoilDisplay): string {
  if (display === 'empty') return FARM_ASSETS.plotIsoEmpty
  return FARM_ASSETS.plotIsoSoil
}

export function plotTileStyle(index: number): string {
  const layout = PLOT_LAYOUT[index]
  if (!layout) return ''
  return `left:${layout.left}%;top:${layout.top}%;width:${layout.width}%;`
}

const CROP_ROW: Record<CropId, number> = {
  lettuce: 0,
  tomato: 1,
  pumpkin: 2,
}

/** 0=幼苗 … 3=可收割 */
export function cropGrowthStage(progressRatio: number, ready: boolean): number {
  if (ready) return 3
  if (progressRatio >= 0.72) return 2
  if (progressRatio >= 0.36) return 1
  return 0
}

export function cropSpriteStyle(cropId: CropId, stage: number): string {
  const row = CROP_ROW[cropId]
  const col = Math.max(0, Math.min(3, stage))
  const x = col === 0 ? 0 : col === 3 ? 100 : (col / 3) * 100
  const y = row === 0 ? 0 : row === 2 ? 100 : 50
  return `background-image:url('${FARM_ASSETS.cropsSheet}');background-size:400% 300%;background-position:${x}% ${y}%;`
}

export function toolbarIconStyle(index: 0 | 1 | 2 | 3): string {
  const x = index === 0 ? 0 : index === 3 ? 100 : (index / 3) * 100
  return `background-image:url('${FARM_ASSETS.toolbar}');background-size:400% 100%;background-position:${x}% 50%;`
}
