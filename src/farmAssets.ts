import type { CropId } from '../electron/farm/farmTypes'

export const FARM_ASSETS = {
  bg: '/farm/farm-bg.png',
  /** 未解锁：等距草地块 */
  plotIsoEmpty: '/farm/dikuai2.png?v=4',
  /** 已解锁空地 / 种植：等距土块 dikuai1 */
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

/** farm-bg.png 设计稿宽度；地块按此统一缩放，保证与背景等比 */
export const LAYOUT_REF_WIDTH = 2516

/** 当前默认布局 */
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

function mergePlotLayoutConfig(base: PlotLayoutConfig, patch: Partial<PlotLayoutConfig>): PlotLayoutConfig {
  return {
    ...base,
    ...patch,
    origin: { ...base.origin, ...(patch.origin ?? {}) },
    rowStep: { ...base.rowStep, ...(patch.rowStep ?? {}) },
    colStep: { ...base.colStep, ...(patch.colStep ?? {}) },
    offsetPx: { ...base.offsetPx, ...(patch.offsetPx ?? {}) },
  }
}

/** 读取已保存的布局微调（移除调布局 UI 后仍兼容 localStorage 草稿） */
export function loadPlotLayoutDraft(): PlotLayoutConfig {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULT_PLOT_LAYOUT_CONFIG)
    const parsed = JSON.parse(raw) as Partial<PlotLayoutConfig>
    if (parsed.cols !== undefined && parsed.cols !== DEFAULT_PLOT_LAYOUT_CONFIG.cols) {
      return structuredClone(DEFAULT_PLOT_LAYOUT_CONFIG)
    }
    if (parsed.rows !== undefined && parsed.rows !== DEFAULT_PLOT_LAYOUT_CONFIG.rows) {
      return structuredClone(DEFAULT_PLOT_LAYOUT_CONFIG)
    }
    return mergePlotLayoutConfig(DEFAULT_PLOT_LAYOUT_CONFIG, parsed)
  } catch {
    return structuredClone(DEFAULT_PLOT_LAYOUT_CONFIG)
  }
}

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

export const PLOT_LAYOUT = buildPlotLayout()

/** 布局 top（相对 stage 高度 %）→ 统一按容器宽度 cqw 渲染，避免逐行累积错位 */
export function layoutTopToCqw(topPercent: number): number {
  return topPercent / FARM_BG_ASPECT
}

export type PlotPositionPx = {
  left: number
  top: number
  width: number
}

export type StageMetrics = {
  clientWidth: number
  clientHeight: number
}

/** 按 farm-stage 实际宽高换算（背景 background-size:100% 100% 与 left/top/height 百分比一致） */
export function plotPositionPx(
  index: number,
  stage: number | StageMetrics,
  config: PlotLayoutConfig = DEFAULT_PLOT_LAYOUT_CONFIG,
): PlotPositionPx | null {
  const layout = buildPlotLayout(config)[index]
  if (!layout) return null

  const stageWidth = typeof stage === 'number' ? stage : stage.clientWidth
  const refHeight = LAYOUT_REF_WIDTH / FARM_BG_ASPECT
  const stageHeight = typeof stage === 'number' ? refHeight * (stage / LAYOUT_REF_WIDTH) : stage.clientHeight
  if (stageWidth <= 0 || stageHeight <= 0) return null

  const scaleX = stageWidth / LAYOUT_REF_WIDTH
  const scaleY = stageHeight / refHeight
  const { offsetPx } = config
  return {
    left: (layout.left / 100) * stageWidth + offsetPx.left * scaleX,
    top: (layout.top / 100) * stageHeight + offsetPx.top * scaleY,
    width: (layout.width / 100) * stageWidth,
  }
}


/** 将布局应用到 DOM（px 缩放，与背景图同一比例尺） */
export function applyPlotPositions(
  container: ParentNode,
  stage: HTMLElement,
  config: PlotLayoutConfig = DEFAULT_PLOT_LAYOUT_CONFIG,
): void {
  const stageWidth = stage.clientWidth
  if (stageWidth <= 0 || stage.clientHeight <= 0) return

  container.querySelectorAll<HTMLElement>('.farm-plot-tile').forEach((tile) => {
    const index = Number(tile.dataset.plot)
    if (!Number.isInteger(index)) return
    const pos = plotPositionPx(index, stage, config)
    if (!pos) return
    tile.style.left = `${pos.left}px`
    tile.style.top = `${pos.top}px`
    tile.style.width = `${pos.width}px`
    tile.style.height = `${pos.width}px`
    tile.style.setProperty('--plot-face-y', String(PLOT_HIT_FACE_Y))
    tile.style.zIndex = String(plotRenderDepth(index, config) + 2)
  })
}

export function syncFarmPlotLayout(container: ParentNode, config?: PlotLayoutConfig): void {
  const stage = container.querySelector<HTMLElement>('.farm-stage')
  if (!stage) return
  applyPlotPositions(container, stage, config ?? loadPlotLayoutDraft())
}

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

/** 土块顶面中心，来自 dikuai1.png 透明区质心 */
export const PLOT_HIT_FACE_Y = 0.501

/** 相对地块锚框（0–1）的菱形，与 dikuai1.png 透明区顶点一致 */
export const PLOT_HIT_POLYGON_UNIT = '0.488,0.221 0.939,0.501 0.499,0.781 0.058,0.501'

/** 土块可见菱形半宽/半高（占地块边长比例，由 dikuai1.png 量取） */
export const PLOT_HIT_HALF_W = 0.441
export const PLOT_HIT_HALF_H = 0.28

export function plotHitHalfSizes(size: number): { halfW: number; halfH: number } {
  return { halfW: size * PLOT_HIT_HALF_W, halfH: size * PLOT_HIT_HALF_H }
}

/** 基于布局公式计算命中区 */
export function getPlotHitMetricsFromLayout(
  index: number,
  stage: HTMLElement,
  config: PlotLayoutConfig = DEFAULT_PLOT_LAYOUT_CONFIG,
): PlotHitMetrics | null {
  const pos = plotPositionPx(index, stage, config)
  if (!pos) return null
  const { halfW, halfH } = plotHitHalfSizes(pos.width)
  return {
    cx: pos.left + pos.width * 0.5,
    cy: pos.top + pos.width * PLOT_HIT_FACE_Y,
    halfW,
    halfH,
  }
}

/** 基于地块布局盒（offsetWidth，不受 stage SVG / 裁剪影响） */
export function getPlotHitMetricsFromTile(tile: HTMLElement): PlotHitMetrics | null {
  const width = tile.offsetWidth
  const height = tile.offsetHeight
  if (width <= 0 || height <= 0) return null
  const { halfW, halfH } = plotHitHalfSizes(width)
  return {
    cx: tile.offsetLeft + width / 2,
    cy: tile.offsetTop + height * PLOT_HIT_FACE_Y,
    halfW,
    halfH,
  }
}

export function plotHitDistanceInStageFromTile(
  stageX: number,
  stageY: number,
  tile: HTMLElement,
): number {
  const metrics = getPlotHitMetricsFromTile(tile)
  if (!metrics) return Infinity
  const dx = (stageX - metrics.cx) / metrics.halfW
  const dy = (stageY - metrics.cy) / metrics.halfH
  return dx * dx + dy * dy
}

/** @deprecated 旧版按行微调中心；点击范围与命中检测已改用固定 PLOT_HIT_FACE_Y */
export function plotHitCyFactor(_index: number, _config: PlotLayoutConfig = DEFAULT_PLOT_LAYOUT_CONFIG): number {
  return PLOT_HIT_FACE_Y
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
  _layout: PlotLayout,
  config: PlotLayoutConfig,
  stageW: number,
  _stageH: number,
): PlotHitMetrics {
  const pos = plotPositionPx(index, { clientWidth: stageW, clientHeight: _stageH }, config)
  if (!pos) {
    return { cx: 0, cy: 0, halfW: 0, halfH: 0 }
  }
  const { halfW, halfH } = plotHitHalfSizes(pos.width)
  return {
    cx: pos.left + pos.width * 0.5,
    cy: pos.top + pos.width * PLOT_HIT_FACE_Y,
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

/** 从屏幕坐标反查地块；基于土块 img 实际渲染位置，重叠时取最近 */
export function findPlotIndexAtClientPoint(
  stage: HTMLElement,
  clientX: number,
  clientY: number,
  _config: PlotLayoutConfig = DEFAULT_PLOT_LAYOUT_CONFIG,
): number | null {
  const stageRect = stage.getBoundingClientRect()
  const stageX = clientX - stageRect.left + stage.scrollLeft
  const stageY = clientY - stageRect.top + stage.scrollTop
  let bestIndex: number | null = null
  let bestDistance = Infinity

  for (const tile of Array.from(stage.querySelectorAll<HTMLElement>('.farm-plot-tile'))) {
    const index = Number(tile.dataset.plot)
    if (!Number.isInteger(index)) continue
    const distance = plotHitDistanceInStageFromTile(stageX, stageY, tile)
    if (distance <= 1 && distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }

  return bestIndex
}

export type PlotSoilDisplay = 'empty' | 'growing' | 'dry' | 'bug' | 'ready' | 'locked'

export function plotSoilSrc(display: PlotSoilDisplay): string | null {
  if (display === 'empty') return FARM_ASSETS.plotIsoSoil
  if (display === 'locked') return FARM_ASSETS.plotIsoEmpty
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
