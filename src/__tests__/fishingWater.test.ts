import { createCanvas, loadImage } from '@napi-rs/canvas'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { drawFishingWater } from '../fishingWater'

describe('pond artwork', () => {
  it.each(['pond-bg.svg', 'bobber.svg'])('loads %s as an image', async (asset) => {
    const image = await loadImage(readFileSync(`public/fishing/${asset}`))
    expect(image.width).toBeGreaterThan(0)
    expect(image.height).toBeGreaterThan(0)
  })

  it.each([[960, 560], [342, 440]])('renders an opaque, animated pond at %i x %i', (width, height) => {
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    drawFishingWater(ctx as unknown as CanvasRenderingContext2D, width, height, 12)
    const first = ctx.getImageData(0, 0, width, height).data
    drawFishingWater(ctx as unknown as CanvasRenderingContext2D, width, height, 18)
    const next = ctx.getImageData(0, 0, width, height).data
    let changed = 0
    const colors = new Set<string>()
    for (let i = 0; i < first.length; i += 4 * 97) {
      expect(first[i + 3]).toBe(255)
      colors.add(`${first[i]},${first[i + 1]},${first[i + 2]}`)
      if (first[i] !== next[i] || first[i + 1] !== next[i + 1]) changed++
    }
    expect(colors.size).toBeGreaterThan(30)
    expect(changed).toBeGreaterThan(30)
  })
})
