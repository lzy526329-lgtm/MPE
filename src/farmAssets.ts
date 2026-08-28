import type { CropId } from '../electron/farm/farmTypes'

export const FARM_ASSETS = {
  bg: '/farm/farm-bg.png',
  /** 未开垦：等距草地块（透明底；?v= 用于强制刷新旧缓存） */
  plotIsoEmpty: '/farm/dikuai2.png?v=4',
  /** 开垦/种植：等距土块 */
  plotIsoSoil: '/farm/dikuai1.png?v=4',
  wheatStages: [
    '/farm/小麦/1-cutout.png',
    '/farm/小麦/1-cutout.png',
    '/farm/小麦/2-cutout.png',
    '/farm/小麦/3-cutout.png',
  ],
  toolbar: [
    '/farm/水壶-cutout.png',
    '/farm/镰刀-cutout.png',
    '/farm/种子袋-cutout.png',
    '/farm/杀虫剂-cutout.png',
  ],
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

export type PlotLayoutConfig = {
  width: number
  cols: number
  rows: number
  origin: { left: number; top: number }
  rowStep: { left: number; top: number }
  colStep: { left: number; top: number }
  offsetPx: { left: number; top: number }
}

/** 当前写入代码的默认布局；页面「调布局」工具会基于此微调 */
export const DEFAULT_PLOT_LAYOUT_CONFIG: PlotLayoutConfig = {
  width: 14,
  cols: 4,
  rows: 6,
  origin: { left: 49, top: 30 },
  rowStep: { left: -7, top: 6.125 },
  colStep: { left: 7, top: 6.125 },
  offsetPx: { left: 13, top: -48 },
}

const LAYOUT_STORAGE_KEY = 'farm-plot-layout-draft'

export function buildPlotLayout(config: PlotLayoutConfig = DEFAULT_PLOT_LAYOUT_CONFIG): PlotLayout[] {
  return Array.from({ length: config.cols * config.rows }, (_, index) => {
    const col = Math.floor(index / config.rows)
    const row = index % config.rows
    return {
      left: config.origin.left + col * config.colStep.left + row * config.rowStep.left,
      top: config.origin.top + col * config.colStep.top + row * config.rowStep.top,
      width: config.width,
    }
  })
}

/** 布局 top（相对 stage 高度 %）→ 统一按容器宽度 cqw 渲染，避免逐行累积错位 */
export function layoutTopToCqw(topPercent: number): number {
  return topPercent / FARM_BG_ASPECT
}

export const PLOT_LAYOUT = buildPlotLayout()

/** 等距深度：越大越靠近镜头，应叠在上层 */
export function plotRenderDepth(index: number, config: PlotLayoutConfig = DEFAULT_PLOT_LAYOUT_CONFIG): number {
  const col = Math.floor(index / config.rows)
  const row = index % config.rows
  return col + row
}

export type PlotHitMetrics = {
  cx: number
  cy: number
  halfW: number
  halfH: number
}

/** 菱形命中中心，相对地块锚框高度的比例（对齐土块顶面） */
export function plotHitCyFactor(index: number, config: PlotLayoutConfig = DEFAULT_PLOT_LAYOUT_CONFIG): number {
  const row = index % config.rows
  const rowT = config.rows <= 1 ? 0 : row / (config.rows - 1)
  return 0.48 + rowT * 0.05
}

export function plotHitHalfSizes(size: number): { halfW: number; halfH: number } {
  return { halfW: size * 0.42, halfH: size * 0.24 }
}

/** 地块在 farm-stage 内的像素盒（与 CSS left/top 一致，供调试 overlay 使用） */
export function getTileBoxInStage(tile: HTMLElement): { left: number; top: number; width: number; height: number } {
  return {
    left: tile.offsetLeft,
    top: tile.offsetTop,
    width: tile.offsetWidth,
    height: tile.offsetHeight,
  }
}

/** 基于 DOM 渲染后的地块按钮计算命中区（与屏幕像素一致） */
export function getPlotHitMetricsFromTile(
  tile: HTMLElement,
  index: number,
  config: PlotLayoutConfig = DEFAULT_PLOT_LAYOUT_CONFIG,
): PlotHitMetrics {
  const { left, top, width } = getTileBoxInStage(tile)
  const size = width
  const { halfW, halfH } = plotHitHalfSizes(size)
  return {
    cx: left + size / 2,
    cy: top + size * plotHitCyFactor(index, config),
    halfW,
    halfH,
  }
}

export function plotHitDistanceFromClientPoint(
  clientX: number,
  clientY: number,
  tile: HTMLElement,
  index: number,
  config: PlotLayoutConfig = DEFAULT_PLOT_LAYOUT_CONFIG,
): number {
  const rect = tile.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return Infinity
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height * plotHitCyFactor(index, config)
  const { halfW, halfH } = plotHitHalfSizes(rect.width)
  const dx = (clientX - cx) / halfW
  const dy = (clientY - cy) / halfH
  return dx * dx + dy * dy
}

export function plotHitPolygonPointsFromMetrics(metrics: PlotHitMetrics): string {
  const { cx, cy, halfW, halfH } = metrics
  return [
    `${cx},${cy - halfH}`,
    `${cx + halfW},${cy}`,
    `${cx},${cy + halfH}`,
    `${cx - halfW},${cy}`,
  ].join(' ')
}

/** @deprecated 仅测试保留；运行时应使用 DOM 版 getPlotHitMetricsFromTile */
export function getPlotHitMetrics(
  index: number,
  layout: PlotLayout,
  config: PlotLayoutConfig,
  stageW: number,
  stageH: number,
): PlotHitMetrics {
  const { offsetPx } = config
  const left = (layout.left / 100) * stageW + offsetPx.left
  const top = (layoutTopToCqw(layout.top) / 100) * stageW + offsetPx.top
  const size = (layout.width / 100) * stageW
  const { halfW, halfH } = plotHitHalfSizes(size)
  return {
    cx: left + size * 0.5,
    cy: top + size * plotHitCyFactor(index, config),
    halfW,
    halfH,
  }
}

export function plotHitDistance(
  px: number,
  py: number,
  index: number,
  layout: PlotLayout,
  config: PlotLayoutConfig,
  stageW: number,
  stageH: number,
): number {
  const { cx, cy, halfW, halfH } = getPlotHitMetrics(index, layout, config, stageW, stageH)
  const dx = (px - cx) / halfW
  const dy = (py - cy) / halfH
  return dx * dx + dy * dy
}

export function plotHitPolygonPoints(
  index: number,
  layout: PlotLayout,
  config: PlotLayoutConfig,
  stageW: number,
  stageH: number,
): string {
  return plotHitPolygonPointsFromMetrics(getPlotHitMetrics(index, layout, config, stageW, stageH))
}

/** 从屏幕坐标反查地块；基于 DOM 位置，多块重叠时取离点击点最近的那块 */
export function findPlotIndexAtClientPoint(
  stage: HTMLElement,
  clientX: number,
  clientY: number,
  config: PlotLayoutConfig = DEFAULT_PLOT_LAYOUT_CONFIG,
): number | null {
  const tiles = stage.querySelectorAll<HTMLElement>('.farm-plot-tile')
  let bestIndex: number | null = null
  let bestDistance = Infinity

  for (const tile of tiles) {
    const index = Number(tile.dataset.plot)
    if (!Number.isInteger(index)) continue
    const distance = plotHitDistanceFromClientPoint(clientX, clientY, tile, index, config)
    if (distance <= 1 && distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }

  return bestIndex
}

export function plotTileStyle(index: number, config: PlotLayoutConfig = DEFAULT_PLOT_LAYOUT_CONFIG): string {
  const layout = buildPlotLayout(config)[index]
  if (!layout) return ''
  const { offsetPx } = config
  const depth = plotRenderDepth(index, config)
  const faceY = plotHitCyFactor(index, config)
  const topCqw = layoutTopToCqw(layout.top)
  return `left:calc(${layout.left}cqw + ${offsetPx.left}px);top:calc(${topCqw}cqw + ${offsetPx.top}px);width:${layout.width}cqw;--plot-face-y:${faceY};z-index:${depth + 2};`
}

export function loadPlotLayoutDraft(): PlotLayoutConfig {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULT_PLOT_LAYOUT_CONFIG)
    return { ...DEFAULT_PLOT_LAYOUT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return structuredClone(DEFAULT_PLOT_LAYOUT_CONFIG)
  }
}

export function savePlotLayoutDraft(config: PlotLayoutConfig) {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(config))
}

export function clearPlotLayoutDraft() {
  localStorage.removeItem(LAYOUT_STORAGE_KEY)
}

export function formatPlotLayoutConfigForCode(config: PlotLayoutConfig): string {
  const round = (n: number) => Math.round(n * 1000) / 1000
  return [
    `PLOT_WIDTH = ${round(config.width)}`,
    `PLOT_ORIGIN = { left: ${round(config.origin.left)}, top: ${round(config.origin.top)} }`,
    `PLOT_ROW_STEP = { left: ${round(config.rowStep.left)}, top: ${round(config.rowStep.top)} }`,
    `PLOT_COL_STEP = { left: ${round(config.colStep.left)}, top: ${round(config.colStep.top)} }`,
    `PLOT_OFFSET_PX = { left: ${Math.round(config.offsetPx.left)}, top: ${Math.round(config.offsetPx.top)} }`,
  ].join('\n')
}

export type PlotSoilDisplay = 'empty' | 'growing' | 'dry' | 'bug' | 'ready' | 'withered'

export function plotSoilSrc(display: PlotSoilDisplay): string {
  if (display === 'empty') return FARM_ASSETS.plotIsoEmpty
  return FARM_ASSETS.plotIsoSoil
}

/** 0=幼苗 … 3=可收割 */
export function cropGrowthStage(progressRatio: number, ready: boolean): number {
  if (ready) return 3
  if (progressRatio >= 0.72) return 2
  if (progressRatio >= 0.36) return 1
  return 0
}

export function cropSpriteStyle(_cropId: CropId, stage: number): string {
  const index = Math.max(0, Math.min(3, stage))
  const src = FARM_ASSETS.wheatStages[index]
  return `background-image:url('${src}');background-size:contain;background-position:center bottom;background-repeat:no-repeat;`
}

export function toolbarIconStyle(index: 0 | 1 | 2 | 3): string {
  return `background-image:url('${FARM_ASSETS.toolbar[index]}');`
}
