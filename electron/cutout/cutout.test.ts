import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cutoutImage } from './index'

const farmDir = join(process.cwd(), 'public/farm')

describe('cutoutImage', () => {
  it('removes checkerboard background from AI-exported PNG', async () => {
    const { default: sharp } = await import('sharp')
    const checker = Buffer.from(
      '<svg width="128" height="128"><rect width="64" height="64" fill="#ccc"/><rect x="64" y="64" width="64" height="64" fill="#ccc"/><rect x="64" width="64" height="64" fill="#fff"/><rect y="64" width="64" height="64" fill="#fff"/></svg>',
    )
    const input = await sharp(await sharp(checker).png().toBuffer())
      .composite([
        {
          input: await sharp({
            create: { width: 40, height: 40, channels: 3, background: { r: 30, g: 170, b: 50 } },
          })
            .png()
            .toBuffer(),
          left: 44,
          top: 44,
        },
      ])
      .png()
      .toBuffer()

    const result = await cutoutImage({
      data: new Uint8Array(input),
      options: { mode: 'auto', tolerance: 25, choke: 0, despill: false },
    })

    expect(result.extension).toBe('png')
    expect(result.transparentRatio).toBeGreaterThan(0.5)

    const corner = await sharp(Buffer.from(result.data)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(corner.data[3]).toBe(0)

    const center = await sharp(Buffer.from(result.data))
      .extract({ left: 63, top: 63, width: 1, height: 1 })
      .raw()
      .toBuffer()
    expect(center[3]).toBeGreaterThan(200)
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

  it('preserves silver blade on sickle-like PNG with auto mode', async () => {
    const { default: sharp } = await import('sharp')
    const input = await sharp({
      create: { width: 512, height: 512, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 220, height: 80, channels: 3, background: { r: 170, g: 175, b: 185 } },
          })
            .png()
            .toBuffer(),
          left: 140,
          top: 210,
        },
        {
          input: await sharp({
            create: { width: 90, height: 140, channels: 3, background: { r: 120, g: 70, b: 40 } },
          })
            .png()
            .toBuffer(),
          left: 250,
          top: 180,
        },
      ])
      .png()
      .toBuffer()

    const result = await cutoutImage({
      data: new Uint8Array(input),
      options: { mode: 'auto', tolerance: 20, choke: 0, despill: false },
    })

    const { data, info } = await sharp(Buffer.from(result.data)).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    })

    let subjectPixels = 0
    for (let y = 170; y < 330; y++) {
      for (let x = 140; x < 360; x++) {
        const o = (y * info.width + x) * 4
        if (data[o + 3] > 200) subjectPixels++
      }
    }
    expect(subjectPixels).toBeGreaterThan(500)

    const cornerAlpha = data[3]
    expect(cornerAlpha).toBeLessThan(20)
  })
})
