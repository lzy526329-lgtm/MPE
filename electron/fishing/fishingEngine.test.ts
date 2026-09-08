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
      weightKg: 0.2,
      sellPrice: 2,
      caughtAt: 1_000,
    })
  })

  it('uses the upper weight and price bounds for a maximum roll', () => {
    expect(createFishCatch('goldenKoi', 2_000, 'catch-2', () => 1)).toEqual({
      id: 'catch-2',
      fishId: 'goldenKoi',
      weightKg: 2,
      sellPrice: 45,
      caughtAt: 2_000,
    })
  })
})
