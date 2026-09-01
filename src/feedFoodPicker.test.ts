import { describe, expect, it } from 'vitest'
import type { GameViewState } from '../electron/game/gameTypes'
import { ownedFoodOffers, renderFeedFoodPicker } from './feedFoodPicker'

const state: GameViewState = {
  wallet: { coins: 100 },
  inventory: {
    food: { cookie: 2, chocolate: 0, creamBread: 0, strawberryMilk: 0 },
    seeds: { wheat: 0, banana: 0, apple: 0, corn: 0, durian: 0 },
    produce: {},
  },
  seedOffers: [],
  produceOffers: [],
  foodOffers: [
    { foodId: 'cookie', name: '饼干', price: 3, satiety: 12 },
    { foodId: 'chocolate', name: '巧克力', price: 5, satiety: 18 },
  ],
}

describe('feed food picker', () => {
  it('lists only owned foods', () => {
    expect(ownedFoodOffers(state).map((offer) => offer.foodId)).toEqual(['cookie'])
  })

  it('renders selectable owned foods', () => {
    const html = renderFeedFoodPicker(state)

    expect(html).toContain('选择食物')
    expect(html).toContain('饼干')
    expect(html).toContain('data-feed-food-id="cookie"')
    expect(html).not.toContain('巧克力')
  })

  it('renders empty state when no food is owned', () => {
    const empty: GameViewState = {
      ...state,
      inventory: { ...state.inventory, food: { cookie: 0, chocolate: 0, creamBread: 0, strawberryMilk: 0 } },
    }

    const html = renderFeedFoodPicker(empty)

    expect(html).toContain('暂无食物')
    expect(html).not.toContain('data-feed-food-id=')
  })

  it('marks the active food as feeding', () => {
    const html = renderFeedFoodPicker(state, { busyFoodId: 'cookie' })

    expect(html).toContain('喂食中…')
    expect(html).toContain('data-feed-food-id="cookie" disabled')
  })
})
