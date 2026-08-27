import { describe, expect, it } from 'vitest'
import {
  FARM_ASSETS,
  FARM_BG_ASPECT,
  PLOT_LAYOUT,
  plotSoilSrc,
  plotTileStyle,
} from './farmAssets'

describe('farm plot layout', () => {
  it('defines 6 absolute plot placements covering the meadow', () => {
    expect(PLOT_LAYOUT).toHaveLength(6)
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
    expect(plotTileStyle(0)).toContain('%')
    expect(plotTileStyle(5)).toContain(`width:${PLOT_LAYOUT[5].width}%`)
  })
})
