import { describe, expect, it } from 'vitest'
import { INITIAL_COINS, SEED_OFFERS, normalizeItemCount, seedCounts } from './gameCatalog'

describe('game catalog', () => {
  it('defines the confirmed starter coins and wheat seed price', () => {
    expect(INITIAL_COINS).toBe(100)
    expect(SEED_OFFERS.map(({ cropId, price }) => [cropId, price])).toEqual([['wheat', 5]])
  })

  it('normalizes missing seed counts to zero wheat', () => {
    expect(seedCounts()).toEqual({ wheat: 0 })
    expect(seedCounts({ wheat: 2 })).toEqual({ wheat: 2 })
  })

  it('merges legacy crop seeds into wheat', () => {
    expect(seedCounts({ lettuce: 2, tomato: 1 })).toEqual({ wheat: 3 })
  })

  it('keeps counts as non-negative integers by flooring finite fractions', () => {
    expect(seedCounts({ wheat: 2.9 })).toEqual({ wheat: 2 })
    expect(seedCounts({ lettuce: 2.9, tomato: -4, pumpkin: 0.4 })).toEqual({ wheat: 2 })
  })

  it.each([
    [3, 3],
    [3.9, 3],
    [0, 0],
    [-1, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    ['5', 0],
    [null, 0],
    [undefined, 0],
  ])('normalizes the item count %s to %s', (value, expected) => {
    expect(normalizeItemCount(value)).toBe(expected)
  })

  it('clamps counts above the safe integer range', () => {
    expect(normalizeItemCount(Number.MAX_SAFE_INTEGER + 10)).toBe(Number.MAX_SAFE_INTEGER)
  })
})
