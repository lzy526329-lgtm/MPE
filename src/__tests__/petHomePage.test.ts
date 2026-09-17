import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { renderHouseRoom } from '../petHomePage'

describe('personal house artwork', () => {
  it('uses the transparent illustration with three independent hit surfaces', () => {
    const html = renderHouseRoom()
    expect(html).toContain('./house/room.png')
    for (const surface of ['floor', 'left-wall', 'right-wall']) {
      expect(html).toContain(`data-surface="${surface}"`)
    }
    expect(html.match(/clip-path:polygon/g)).toHaveLength(3)
    expect(html).not.toContain('house-activity')
    expect(html).not.toContain('house-left-wall')
    expect(html).toContain('house-placements')
  })

  it('includes the new illustrated furniture groups', () => {
    expect(readFileSync(new URL('../petHomePage.ts', import.meta.url), 'utf8')).toContain('bedsideTable')
    expect(readFileSync(new URL('../../electron/game/furnitureCatalog.json', import.meta.url), 'utf8')).toContain('家具/床-cutout.png')
  })

  it('ships a transparent square bitmap with intact wall and floor pixels', async () => {
    const file = readFileSync(new URL('../../public/house/room.png', import.meta.url))
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true })
    expect(info.width).toBe(1536)
    expect(info.height).toBe(1536)
    expect(info.channels).toBe(4)
    const pixel = (x: number, y: number) => Array.from(data.subarray((Math.floor(y * info.height) * info.width + Math.floor(x * info.width)) * 4, (Math.floor(y * info.height) * info.width + Math.floor(x * info.width)) * 4 + 4))
    expect(pixel(.02, .02)[3]).toBe(0)
    expect(pixel(.95, .9)[3]).toBe(0)
    for (const [x, y] of [[.25, .38], [.75, .38], [.5, .72]]) {
      const [r, g, b, alpha] = pixel(x, y)
      expect(alpha).toBe(255)
      expect(r).toBeGreaterThan(160)
      expect(g).toBeGreaterThan(b)
    }
  })
})
