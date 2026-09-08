import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { getFishCatalogEntry, getFishIds } from './fishCatalog'

describe('fish catalog', () => {
  it('contains all 23 configured species', () => {
    const ids = getFishIds()
    const names = ids.map((id) => getFishCatalogEntry(id).name)

    expect(ids).toHaveLength(23)
    expect(new Set(ids).size).toBe(23)
    expect(names).toEqual(expect.arrayContaining([
      '鲫鱼',
      '鳜鱼',
      '泥鳅',
      '小丑鱼',
      '金枪鱼',
      '翻车鱼',
      '海马',
    ]))
  })

  it('points every species to an existing image', () => {
    for (const id of getFishIds()) {
      const image = getFishCatalogEntry(id).image
      const assetPath = image.startsWith('/') ? `public${image}` : `public/fishing/${image}`
      expect(() => readFileSync(assetPath)).not.toThrow()
    }
  })
})
