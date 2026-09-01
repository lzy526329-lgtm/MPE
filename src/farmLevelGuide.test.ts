import { describe, expect, it } from 'vitest'

import { totalXpForLevel } from '../electron/farm/farmLevel'
import {
  buildFarmLevelRewardPreviews,
  previewLevelUpRewards,
  wheatSeedsForLevel,
} from '../electron/farm/farmLevelCatalog'
import { renderFarmLevelGuide } from './farmLevelGuide'

describe('farmLevelGuide', () => {
  it('builds reward previews for every level up to the cap', () => {
    const previews = buildFarmLevelRewardPreviews()
    expect(previews).toHaveLength(18)
    expect(previewLevelUpRewards(1).wheatSeeds).toBe(3)
    expect(previewLevelUpRewards(5).wheatSeeds).toBe(5)
  })

  it('renders a level list with current progress and reward lines', () => {
    const html = renderFarmLevelGuide({
      walletCoins: 100,
      farmLevel: 1,
      farmTotalXp: 520,
      farmXpProgress: { current: 20, required: 650, isMaxLevel: false },
    })

    expect(html).toContain('农场等级奖励')
    expect(html).toContain('当前 Lv.1')
    expect(html).toContain('Lv.2')
    expect(html).toContain('下一级')
    expect(html).toContain('已达成')
    expect(html).toContain(`累计 ${totalXpForLevel(2)} 经验升级`)
    expect(html).toContain('小麦种子')
    expect(html).toContain('随机宠物食物')
  })
})

describe('wheatSeedsForLevel', () => {
  it('increases wheat seeds as level rises', () => {
    expect(wheatSeedsForLevel(1)).toBe(3)
    expect(wheatSeedsForLevel(2)).toBe(4)
    expect(wheatSeedsForLevel(10)).toBe(8)
  })
})
