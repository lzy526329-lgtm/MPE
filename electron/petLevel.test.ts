import { describe, expect, it } from 'vitest'
import { createDefaultProfile } from './petProfile'
import {
  grantChatGrowth,
  grantPetGrowth,
  petGrowthProgress,
  petLevelFromGrowth,
  totalGrowthForLevel,
} from './petLevel'
import { xpToNextPetLevel, PET_GROWTH_CHAT_DAILY_CAP } from './petLevelCatalog'

describe('petLevel curve', () => {
  it('uses the intimacy growth formula', () => {
    expect(xpToNextPetLevel(0)).toBe(80)
    expect(xpToNextPetLevel(1)).toBe(120)
    expect(xpToNextPetLevel(5)).toBe(280)
  })

  it('derives level from total growth', () => {
    expect(petLevelFromGrowth(0)).toBe(0)
    expect(petLevelFromGrowth(79)).toBe(0)
    expect(petLevelFromGrowth(80)).toBe(1)
    expect(petLevelFromGrowth(199)).toBe(1)
    expect(petLevelFromGrowth(200)).toBe(2)
  })

  it('reports progress within the current level', () => {
    expect(petGrowthProgress(0)).toEqual({
      level: 0,
      current: 0,
      required: 80,
      totalGrowth: 0,
    })
    expect(petGrowthProgress(120)).toEqual({
      level: 1,
      current: 40,
      required: 120,
      totalGrowth: 120,
    })
  })

  it('supports very high levels without a cap', () => {
    const growth = totalGrowthForLevel(50)
    expect(petLevelFromGrowth(growth)).toBe(50)
    expect(petGrowthProgress(growth).level).toBe(50)
  })
})

describe('grantPetGrowth', () => {
  it('updates title when leveling up', () => {
    const profile = createDefaultProfile()
    const result = grantPetGrowth(profile, 80)

    expect(result.leveledUp).toBe(true)
    expect(result.newLevel).toBe(1)
    expect(result.profile.title).toBe('小伙伴')
    expect(result.profile.growth).toBe(80)
  })

  it('keeps title when growth is gained without leveling', () => {
    const profile = { ...createDefaultProfile(), growth: 10, level: 0, title: '初来乍到' }
    const result = grantPetGrowth(profile, 5)

    expect(result.leveledUp).toBe(false)
    expect(result.profile.title).toBe('初来乍到')
    expect(result.profile.growth).toBe(15)
  })

  it('can level up multiple times in one grant', () => {
    const profile = createDefaultProfile()
    const result = grantPetGrowth(profile, 200)

    expect(result.previousLevel).toBe(0)
    expect(result.newLevel).toBe(2)
    expect(result.profile.title).toBe('熟悉的朋友')
  })
})

describe('grantChatGrowth', () => {
  it('respects the daily chat cap', () => {
    const profile = createDefaultProfile()
    const today = '2026-09-01'

    let daily = { date: today, chatXp: 0 }
    let result = grantChatGrowth(profile, daily, today)
    expect(result.xpGained).toBe(3)
    daily = result.growthDaily!

    for (let i = 0; i < 9; i += 1) {
      result = grantChatGrowth(result.profile, daily, today)
      daily = result.growthDaily!
    }

    expect(daily.chatXp).toBe(30)
    expect(result.xpGained).toBe(3)

    result = grantChatGrowth(result.profile, daily, today)
    expect(result.xpGained).toBe(0)
    expect(result.profile.growth).toBe(PET_GROWTH_CHAT_DAILY_CAP)
  })

  it('resets the daily counter on a new day', () => {
    const profile = { ...createDefaultProfile(), growth: 30 }
    const result = grantChatGrowth(profile, { date: '2026-08-31', chatXp: 30 }, '2026-09-01')

    expect(result.xpGained).toBe(3)
    expect(result.growthDaily).toEqual({ date: '2026-09-01', chatXp: 3 })
  })
})
