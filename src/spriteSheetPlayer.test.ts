import { describe, expect, it } from 'vitest'
import {
  computeSpriteGrid,
  fitCanvasSize,
  frameIndexToCell,
  readSpriteSheetConfig,
  readSpriteSheetConfigFromGrid,
  suggestDefaultFrameSize,
} from './spriteSheetPlayer'

describe('spriteSheetPlayer', () => {
  it('computes grid frames from sheet and frame size', () => {
    expect(
      computeSpriteGrid({
        sheetWidth: 256,
        sheetHeight: 128,
        frameWidth: 64,
        frameHeight: 64,
        frameCount: 0,
      }),
    ).toEqual({ cols: 4, rows: 2, frameCount: 8 })
  })

  it('respects an explicit frame count cap', () => {
    expect(
      computeSpriteGrid({
        sheetWidth: 256,
        sheetHeight: 128,
        frameWidth: 64,
        frameHeight: 64,
        frameCount: 5,
      }),
    ).toEqual({ cols: 4, rows: 2, frameCount: 5 })
  })

  it('maps frame indexes row by row', () => {
    expect(frameIndexToCell(0, 4)).toEqual({ col: 0, row: 0 })
    expect(frameIndexToCell(3, 4)).toEqual({ col: 3, row: 0 })
    expect(frameIndexToCell(4, 4)).toEqual({ col: 0, row: 1 })
  })

  it('validates config input', () => {
    expect(
      readSpriteSheetConfig({
        sheetWidth: 128,
        sheetHeight: 64,
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 0,
      }),
    ).toEqual({
      sheetWidth: 128,
      sheetHeight: 64,
      frameWidth: 32,
      frameHeight: 32,
      frameCount: 0,
    })

    expect(
      readSpriteSheetConfigFromGrid({
        sheetWidth: 704,
        sheetHeight: 704,
        cols: 11,
        rows: 11,
        frameCount: 120,
      }),
    ).toEqual({
      sheetWidth: 704,
      sheetHeight: 704,
      frameWidth: 64,
      frameHeight: 64,
      frameCount: 120,
    })

    expect(
      readSpriteSheetConfigFromGrid({
        sheetWidth: 704,
        sheetHeight: 704,
        cols: 11,
        rows: 11,
        frameCount: 200,
      }),
    ).toBeNull()

    expect(
      readSpriteSheetConfig({
        sheetWidth: 100,
        sheetHeight: 64,
        frameWidth: 128,
        frameHeight: 32,
        frameCount: 0,
      }),
    ).toBeNull()
  })

  it('scales canvas to fit preview box', () => {
    expect(fitCanvasSize(200, 100, 160)).toEqual({ width: 160, height: 80 })
  })

  it('suggests square frames for horizontal sprite strips', () => {
    expect(suggestDefaultFrameSize(5888, 736)).toEqual({ frameWidth: 736, frameHeight: 736 })
    expect(computeSpriteGrid({
      sheetWidth: 5888,
      sheetHeight: 736,
      frameWidth: 736,
      frameHeight: 736,
      frameCount: 0,
    }).frameCount).toBe(8)
  })

  it('suggests grid frames for square sprite sheets', () => {
    expect(suggestDefaultFrameSize(704, 704)).toEqual({ frameWidth: 64, frameHeight: 64 })
    expect(
      computeSpriteGrid({
        sheetWidth: 704,
        sheetHeight: 704,
        frameWidth: 64,
        frameHeight: 64,
        frameCount: 0,
      }),
    ).toEqual({ cols: 11, rows: 11, frameCount: 121 })
  })
})
