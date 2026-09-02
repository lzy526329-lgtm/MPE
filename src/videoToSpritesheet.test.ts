import { describe, expect, it } from 'vitest'
import {
  computeFrameTimes,
  computeSpriteSheetDimensions,
  fitFrameSize,
  fitSheetToCanvasLimits,
  validateSpriteSheetSize,
} from './videoToSpritesheet'

describe('videoToSpritesheet', () => {
  it('samples frame times by fps', () => {
    expect(computeFrameTimes(1, 10, 100)).toEqual([
      0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
    ])
  })

  it('caps frame count', () => {
    expect(computeFrameTimes(10, 12, 3)).toEqual([0, 0.0833, 0.1667])
  })

  it('computes horizontal sheet size', () => {
    expect(computeSpriteSheetDimensions(64, 64, 8, 'horizontal')).toEqual({
      width: 512,
      height: 64,
      cols: 8,
      rows: 1,
    })
  })

  it('computes grid sheet size', () => {
    expect(computeSpriteSheetDimensions(32, 32, 8, 'grid')).toEqual({
      width: 96,
      height: 96,
      cols: 3,
      rows: 3,
    })
  })

  it('scales frames down to max bounds', () => {
    expect(fitFrameSize(1920, 1080, 640, 640)).toEqual({ width: 640, height: 360 })
  })

  it('shrinks frames when horizontal sheet exceeds canvas side limit', () => {
    const result = fitSheetToCanvasLimits(1920, 1080, 120, 'horizontal')
    expect(result.scale).toBeLessThan(1)
    const sheet = computeSpriteSheetDimensions(result.frameWidth, result.frameHeight, 120, 'horizontal')
    expect(sheet.width).toBeLessThanOrEqual(8192)
    expect(sheet.height).toBeLessThanOrEqual(8192)
  })

  it('rejects oversized sheet dimensions', () => {
    expect(validateSpriteSheetSize(9000, 1000)).toMatch(/单边/)
    expect(validateSpriteSheetSize(4000, 5000)).toMatch(/总像素/)
    expect(validateSpriteSheetSize(1000, 1000)).toBeNull()
  })
})
