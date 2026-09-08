import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { getFishCatalogEntry, getFishIds, fishRarityLabel } from './fishCatalog'

describe('fish catalog', () => {
  it('contains all 22 configured species', () => {
    const ids = getFishIds()
    const names = ids.map((id) => getFishCatalogEntry(id).name)

    expect(ids).toHaveLength(22)
    expect(new Set(ids).size).toBe(22)
    expect(names).toEqual(expect.arrayContaining([
      '鲫鱼',
      '泥鳅',
      '小丑鱼',
      '金枪鱼',
      '翻车鱼',
      '海马',
    ]))
    expect(names).not.toContain('鳜鱼')
  })

  it('points every species to an existing image', () => {
    for (const id of getFishIds()) {
      const image = getFishCatalogEntry(id).image
      const assetPath = image.startsWith('/') ? `public${image}` : `public/fishing/${image}`
      expect(() => readFileSync(assetPath)).not.toThrow()
    }
  })

  it('keeps the fishing scene directory free of fish artwork', () => {
    expect(readdirSync('public/fishing').sort()).toEqual([
      'bait-basic.svg',
      'bait-premium.svg',
      'bobber.svg',
      'pond-bg.svg',
    ])
  })

  it('maps rarity keys to chinese labels', () => {
    expect(fishRarityLabel('common')).toBe('普通')
    expect(fishRarityLabel('uncommon')).toBe('少见')
    expect(fishRarityLabel('rare')).toBe('稀有')
    expect(fishRarityLabel('precious')).toBe('珍贵')
  })
})
