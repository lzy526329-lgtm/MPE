import { describe, expect, it } from 'vitest'
import {
  buildFoodOffers,
  getFoodCatalogEntry,
  getFoodIds,
  getFoodImagePath,
} from './foodCatalog'

describe('foodCatalog.json', () => {
  it('registers foods from public/foods assets', () => {
    expect(getFoodIds().sort()).toEqual(['chocolate', 'cookie', 'creamBread', 'strawberryMilk'])
  })

  it('defines satiety and price for strawberry milk', () => {
    expect(getFoodCatalogEntry('strawberryMilk')).toEqual({
      name: '草莓牛奶',
      price: 12,
      satiety: 35,
      image: '草莓牛奶.png',
    })
  })

  it('derives shop offers with satiety for UI labels', () => {
    expect(buildFoodOffers()).toEqual(
      expect.arrayContaining([
        { foodId: 'cookie', name: '饼干', price: 3, satiety: 12 },
        { foodId: 'strawberryMilk', name: '草莓牛奶', price: 12, satiety: 35 },
      ]),
    )
    expect(getFoodImagePath('cookie')).toBe('饼干.png')
  })
})
