import { describe, expect, it } from 'vitest'
import {
  buildCrops,
  buildProduceOffers,
  buildSeedOffers,
  formatCropGrowLabel,
  getCropCatalogEntry,
  getCropIds,
  getCropShopImgPath,
  getCropSpritePaths,
} from './cropCatalog'

describe('cropCatalog.json', () => {
  it('registers every crop folder dropped under public/farm', () => {
    expect(getCropIds().sort()).toEqual(['apple', 'banana', 'corn', 'durian', 'wheat'])
  })

  it('defines wheat with the confirmed economy and growth values', () => {
    expect(getCropCatalogEntry('wheat')).toMatchObject({
      name: '小麦',
      seedName: '小麦种子',
      seedPrice: 5,
      produceName: '小麦',
      producePrice: 4,
      growMinutes: 20,
      waterIntervalMinutes: 5,
      yieldMin: 2,
      yieldMax: 3,
      starterSeeds: 5,
      dailySeeds: 3,
      shopImg: '小麦/shopImg-cutout.png',
      sprites: ['小麦/1-cutout.png', '小麦/2-cutout.png', '小麦/3-cutout.png'],
    })
  })

  it('derives runtime crop, shop and produce offers from the catalog', () => {
    expect(buildCrops().wheat).toMatchObject({
      id: 'wheat',
      name: '小麦',
      growMs: 20 * 60_000,
      waterIntervalMs: 5 * 60_000,
      yieldMin: 2,
      yieldMax: 3,
    })
    expect(buildSeedOffers()).toEqual(
      expect.arrayContaining([
        { cropId: 'wheat', name: '小麦种子', price: 5 },
        { cropId: 'banana', name: '香蕉种子', price: 5 },
        { cropId: 'apple', name: '苹果种子', price: 8 },
        { cropId: 'corn', name: '玉米种子', price: 12 },
        { cropId: 'durian', name: '榴莲种子', price: 20 },
      ]),
    )
    expect(buildProduceOffers()).toEqual(
      expect.arrayContaining([
        { produceId: 'wheat', name: '小麦', price: 4 },
        { produceId: 'banana', name: '香蕉', price: 4 },
        { produceId: 'apple', name: '苹果', price: 6 },
        { produceId: 'corn', name: '玉米', price: 10 },
        { produceId: 'durian', name: '榴莲', price: 16 },
      ]),
    )
  })

  it('exposes sprite paths, shop image and grow labels for UI', () => {
    expect(getCropSpritePaths('wheat')).toEqual([
      '小麦/1-cutout.png',
      '小麦/2-cutout.png',
      '小麦/3-cutout.png',
    ])
    expect(getCropShopImgPath('wheat')).toBe('小麦/shopImg-cutout.png')
    expect(getCropShopImgPath('durian')).toBe('榴莲/shopImg-cutout.png')
    expect(formatCropGrowLabel('wheat')).toBe('成熟约 20 分钟')
    expect(formatCropGrowLabel('durian')).toBe('成熟约 1 小时')
  })
})
