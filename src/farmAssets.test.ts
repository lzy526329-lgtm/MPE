import { describe, expect, it } from 'vitest'
import {
  buildPlotLayout,
  cropSpriteStyle,
  DEFAULT_PLOT_LAYOUT_CONFIG,
  FARM_ASSETS,
  FARM_BG_ASPECT,
  getPlotHitMetrics,
  LAYOUT_REF_WIDTH,
  PLOT_LAYOUT,
  plotHitDistance,
  plotHitHalfSizes,
  PLOT_HIT_POLYGON_UNIT,
  plotPositionPx,
  plotSoilSrc,
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
    expect(plotSoilSrc('empty')).toBe(FARM_ASSETS.plotIsoSoil)
    expect(plotSoilSrc('locked')).toBe(FARM_ASSETS.plotIsoEmpty)
    expect(plotSoilSrc('growing')).toBe(FARM_ASSETS.plotIsoSoil)
    expect(plotSoilSrc('dry')).toBe(FARM_ASSETS.plotIsoSoil)
    expect(plotSoilSrc('ready')).toBe(FARM_ASSETS.plotIsoSoil)
    expect(plotSoilSrc('bug')).toBe(FARM_ASSETS.plotIsoSoil)
    expect(FARM_ASSETS.plotIsoEmpty).toContain('dikuai2')
    expect(FARM_ASSETS.plotIsoSoil).toContain('dikuai1')
  })

  it('scales plot positions from reference width', () => {
    const pos = plotPositionPx(0, LAYOUT_REF_WIDTH)
    expect(pos).not.toBeNull()
    expect(pos!.left).toBeCloseTo((49 / 100) * LAYOUT_REF_WIDTH + 13, 0)
    expect(pos!.width).toBeCloseTo((14 / 100) * LAYOUT_REF_WIDTH, 0)
    const depthPos = plotPositionPx(5, LAYOUT_REF_WIDTH)
    expect(depthPos!.top).toBeGreaterThan(pos!.top)
  })

  it('uses stage height for vertical percent', () => {
    const sw = 1100
    const sh = 780
    const pos = plotPositionPx(0, { clientWidth: sw, clientHeight: sh })
    expect(pos!.top).toBeCloseTo((30 / 100) * sh + (-48) * (sh / (1666)), 0)
    expect(pos!.left).toBeCloseTo((49 / 100) * sw + 13 * (sw / 2516), 0)
  })

  it('uses uniform hit polygon ratios on any tile width', () => {
    const { halfW, halfH } = plotHitHalfSizes(100)
    expect(halfW).toBeCloseTo(44.1, 1)
    expect(halfH).toBeCloseTo(28, 1)
    expect(PLOT_HIT_POLYGON_UNIT).toContain('0.488,0.221')
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
  it('uses relative wheat cutout paths for Electron file:// loading', () => {
    expect(cropSpriteStyle('wheat', 0)).toContain('./farm/%E5%B0%8F%E9%BA%A6/1-cutout.png')
    expect(cropSpriteStyle('wheat', 2)).toContain('./farm/%E5%B0%8F%E9%BA%A6/2-cutout.png')
    expect(cropSpriteStyle('wheat', 3)).toContain('./farm/%E5%B0%8F%E9%BA%A6/3-cutout.png')
  })

  it('uses relative soil paths instead of root-absolute /farm URLs', () => {
    expect(FARM_ASSETS.plotIsoSoil).toMatch(/^\.\/farm\/dikuai1\.png\?v=4$/)
    expect(FARM_ASSETS.plotIsoEmpty).toMatch(/^\.\/farm\/dikuai2\.png\?v=4$/)
  })
})

describe('farm toolbar assets', () => {
  it.each([0, 1, 2, 3] as const)('uses relative tool image paths for icon %s', (index) => {
    const style = toolbarIconStyle(index)
    expect(style).toContain(`background-image:url('${FARM_ASSETS.toolbar[index]}')`)
    expect(FARM_ASSETS.toolbar[index]).toMatch(/^\.\/farm\//)
  })
})
