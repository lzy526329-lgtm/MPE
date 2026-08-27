import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cutoutImage } from './index'

const farmDir = join(process.cwd(), 'public/farm')

describe('cutoutImage', () => {
  it('removes checkerboard background from AI-exported PNG', async () => {
    const input = readFileSync(join(farmDir, 'dikuai2.orig.png'))
    const result = await cutoutImage({ data: new Uint8Array(input) })

    expect(result.extension).toBe('png')
    expect(result.width).toBe(2048)
    expect(result.height).toBe(2048)
    expect(result.transparentRatio).toBeGreaterThan(0.55)
    expect(result.transparentRatio).toBeLessThan(0.85)

    // corner should be transparent in output PNG
    const { default: sharp } = await import('sharp')
    const corner = await sharp(Buffer.from(result.data)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(corner.data[3]).toBe(0)
  })

  it('respects white-only mode on solid white background', async () => {
    const { default: sharp } = await import('sharp')
    const input = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 24, height: 24, channels: 3, background: { r: 20, g: 180, b: 40 } },
          })
            .png()
            .toBuffer(),
          left: 20,
          top: 20,
        },
      ])
      .png()
      .toBuffer()

    const result = await cutoutImage({
      data: new Uint8Array(input),
      options: { mode: 'white', tolerance: 30 },
    })

    expect(result.transparentRatio).toBeGreaterThan(0.7)
    const center = await sharp(Buffer.from(result.data))
      .extract({ left: 30, top: 30, width: 1, height: 1 })
      .raw()
      .toBuffer()
    expect(center[3]).toBeGreaterThan(200)
  })
})
