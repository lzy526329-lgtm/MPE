import { describe, expect, it } from 'vitest'
import {
  buildPlotLayout,
  cropSpriteStyle,
  FARM_ASSETS,
  FARM_BG_ASPECT,
  getPlotHitMetrics,
  PLOT_LAYOUT,
  plotHitDistance,
  plotSoilSrc,
  plotTileStyle,
  toolbarIconStyle,
  type PlotLayoutConfig,
} from './farmAssets'

describe('farm plot layout', () => {
  it('defines 24 absolute plot placements covering the meadow', () => {
    expect(PLOT_LAYOUT).toHaveLength(24)
    for (const plot of PLOT_LAYOUT) {
      expect(plot.left).toBeGreaterThanOrEqual(0)
      expect(plot.top).toBeGreaterThanOrEqual(0)
      expect(plot.width).toBeGreaterThan(0)
      expect(plot.left + plot.width).toBeLessThanOrEqual(100)
      expect(plot.top).toBeLessThan(100)
    }
  })

  it('keeps background aspect ratio from farm-bg.png', () => {
    expect(FARM_BG_ASPECT).toBeCloseTo(2516 / 1666, 5)
  })

  it('uses isometric dikuai soils instead of top-down plot sprites', () => {
    expect(plotSoilSrc('empty')).toBe(FARM_ASSETS.plotIsoEmpty)
    expect(plotSoilSrc('growing')).toBe(FARM_ASSETS.plotIsoSoil)
    expect(plotSoilSrc('dry')).toBe(FARM_ASSETS.plotIsoSoil)
    expect(plotSoilSrc('ready')).toBe(FARM_ASSETS.plotIsoSoil)
    expect(plotSoilSrc('bug')).toBe(FARM_ASSETS.plotIsoSoil)
    expect(plotSoilSrc('withered')).toBe(FARM_ASSETS.plotIsoSoil)
    expect(FARM_ASSETS.plotIsoEmpty).toContain('dikuai2')
    expect(FARM_ASSETS.plotIsoSoil).toContain('dikuai1')
  })

  it('renders absolute percent styles for each plot index', () => {
    expect(plotTileStyle(0)).toContain('left:')
    expect(plotTileStyle(0)).toContain('cqw')
    expect(plotTileStyle(23)).toContain(`width:${PLOT_LAYOUT[23].width}cqw`)
    expect(plotTileStyle(0)).toContain('z-index:2')
    expect(plotTileStyle(5)).toContain('z-index:7')
  })

  it('picks the closest overlapping plot when hit regions intersect', () => {
    const config: PlotLayoutConfig = {
      width: 14,
      cols: 4,
      rows: 6,
      origin: { left: 49, top: 30 },
      rowStep: { left: -7, top: 6.125 },
      colStep: { left: 7, top: 6.125 },
      offsetPx: { left: 13, top: -48 },
    }
    const layouts = buildPlotLayout(config)
    const stageW = 1000
    const stageH = 662
    const layout0 = layouts[0]!
    const layout1 = layouts[1]!
    const { cx: cx0, cy: cy0 } = getPlotHitMetrics(0, layout0, config, stageW, stageH)
    const dist0 = plotHitDistance(cx0, cy0, 0, layout0, config, stageW, stageH)
    const dist1 = plotHitDistance(cx0, cy0, 1, layout1, config, stageW, stageH)
    expect(dist0).toBe(0)
    expect(dist0).toBeLessThan(dist1)
  })
})

describe('farm crop assets', () => {
  it('uses wheat cutout stages instead of the old crop sheet', () => {
    expect(cropSpriteStyle('wheat', 0)).toContain('/farm/小麦/1-cutout.png')
    expect(cropSpriteStyle('wheat', 2)).toContain('/farm/小麦/2-cutout.png')
    expect(cropSpriteStyle('wheat', 3)).toContain('/farm/小麦/3-cutout.png')
  })
})

describe('farm toolbar assets', () => {
  it.each([
    [0, '/farm/水壶-cutout.png'],
    [1, '/farm/镰刀-cutout.png'],
    [2, '/farm/种子袋-cutout.png'],
    [3, '/farm/杀虫剂-cutout.png'],
  ] as const)('uses the standalone tool image for icon %s', (index, assetPath) => {
    expect(toolbarIconStyle(index)).toContain(`background-image:url('${assetPath}')`)
  })
})
