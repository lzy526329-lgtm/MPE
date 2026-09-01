import { describe, expect, it } from 'vitest'

import { createDefaultGameState } from '../game/gameEngine'
import {
  farmLevelFromTotalXp,
  farmXpProgress,
  grantFarmExperience,
  xpRemainingToLevel,
} from './farmLevel'
import { harvestXpForCrop, rollLevelUpRewards, xpToNextLevel } from './farmLevelCatalog'

describe('farmLevelCatalog', () => {
  it('uses a super-slow xp curve', () => {
    expect(xpToNextLevel(0)).toBe(500)
    expect(xpToNextLevel(1)).toBe(650)
    expect(xpToNextLevel(2)).toBe(800)
  })

  it('scales harvest xp by crop grow time', () => {
    expect(harvestXpForCrop('banana')).toBe(2)
    expect(harvestXpForCrop('wheat')).toBe(3)
    expect(harvestXpForCrop('durian')).toBe(10)
  })

  it('rolls richer rewards at higher levels', () => {
    const low = rollLevelUpRewards(1, () => 0)
    const high = rollLevelUpRewards(9, () => 0.99)

    expect(low.seeds.wheat).toBe(3)
    expect(low.food.cookie).toBe(1)
    expect((high.seeds.wheat ?? 0)).toBeGreaterThan(3)
    expect(Object.keys(high.food).length).toBeGreaterThanOrEqual(1)
  })
})

describe('farmLevel', () => {
  it('derives level from total xp', () => {
    expect(farmLevelFromTotalXp(0)).toBe(0)
    expect(farmLevelFromTotalXp(499)).toBe(0)
    expect(farmLevelFromTotalXp(500)).toBe(1)
    expect(farmLevelFromTotalXp(1149)).toBe(1)
    expect(farmLevelFromTotalXp(1150)).toBe(2)
  })

  it('reports progress within the current level', () => {
    expect(farmXpProgress(120)).toEqual({
      level: 0,
      current: 120,
      required: 500,
      isMaxLevel: false,
    })
    expect(farmXpProgress(500)).toEqual({
      level: 1,
      current: 0,
      required: 650,
      isMaxLevel: false,
    })
  })

  it('grants inventory rewards for each level gained', () => {
    const game = createDefaultGameState(1_000)
    const result = grantFarmExperience(game, 500, () => 0)

    expect(result.newLevel).toBe(1)
    expect(result.game.farm.totalXp).toBe(500)
    expect(result.game.inventory.seeds.wheat).toBeGreaterThan(5)
    expect(result.game.inventory.food.cookie).toBeGreaterThanOrEqual(1)
    expect(result.levelUpMessage).toContain('Lv.1')
  })

  it('can level up multiple times in one grant', () => {
    const game = createDefaultGameState(1_000)
    const result = grantFarmExperience(game, 1150, () => 0)

    expect(result.newLevel).toBe(2)
    expect(result.levelUps).toHaveLength(2)
  })

  it('computes xp remaining to a target level', () => {
    expect(xpRemainingToLevel(120, 1)).toBe(380)
    expect(xpRemainingToLevel(500, 1)).toBe(0)
  })
})
