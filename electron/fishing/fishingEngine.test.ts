import { describe, expect, it } from 'vitest'

import { chooseFish, createFishCatch } from './fishingEngine'

describe('fishingEngine', () => {
  it.each([
    ['basic', 0, 'crucian'],
    ['basic', 0.749999, 'paleChub'],
    ['basic', 0.75, 'grassCarp'],
    ['basic', 0.95, 'tuna'],
    ['premium', 0.95, 'goldenKoi'],
  ] as const)('maps %s bait roll %s to %s', (baitId, roll, fishId) => {
    expect(chooseFish(baitId, () => roll)).toBe(fishId)
  })

  it('creates a bounded catch and deterministic price', () => {
    expect(createFishCatch('crucian', 1_000, 'catch-1', () => 0)).toEqual({
      id: 'catch-1',
      fishId: 'crucian',
      quality: 'white',
      weightKg: 0.2,
      sellPrice: 2,
      caughtAt: 1_000,
    })
  })

  it('uses the upper weight and price bounds for a maximum roll', () => {
    expect(createFishCatch('goldenKoi', 2_000, 'catch-2', () => 1)).toEqual({
      id: 'catch-2',
      fishId: 'goldenKoi',
      quality: 'red',
      weightKg: 2,
      sellPrice: 135,
      caughtAt: 2_000,
    })
  })

  it.each([
    [0, 'white', 29],
    [0.799999, 'white', 29],
    [0.8, 'gold', 58],
    [0.949999, 'gold', 58],
    [0.95, 'red', 87],
    [1, 'red', 87],
  ] as const)('assigns quality independently of weight for roll %s', (roll, quality, sellPrice) => {
    const rolls = [0.5, roll]
    expect(createFishCatch('tuna', 1_000, 'quality-catch', () => rolls.shift()!)).toMatchObject({
      quality,
      sellPrice,
      weightKg: 152.5,
    })
  })
})
