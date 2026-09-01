import type { CropId } from './cropCatalog'
import { getCropCatalogEntry } from './cropCatalog'
import type { FoodId } from '../game/foodCatalog'
import { getFoodCatalogEntry } from '../game/foodCatalog'

/** 与待解锁地块数一致：24 块地中 6 块初始解锁，其余 18 块逐级需要 Lv.1–18 */
export const FARM_LEVEL_CAP = 18

export const PLANT_XP = 1
export const UNLOCK_PLOT_XP = 10
export const DAILY_SEED_XP = 3

/** 从 level 升到 level+1 所需经验 */
export function xpToNextLevel(level: number): number {
  return 500 + level * 150
}

export function harvestXpForCrop(cropId: CropId): number {
  const minutes = getCropCatalogEntry(cropId).growMinutes
  return Math.max(2, Math.floor(minutes / 6))
}

const FOOD_POOL_BY_TIER: readonly (readonly FoodId[])[] = [
  ['cookie'],
  ['cookie', 'chocolate'],
  ['cookie', 'chocolate', 'creamBread'],
  ['cookie', 'chocolate', 'creamBread', 'strawberryMilk'],
]

const BONUS_CROP_IDS: readonly CropId[] = ['banana', 'apple', 'corn']

export type LevelUpRewards = {
  seeds: Partial<Record<CropId, number>>
  food: Partial<Record<FoodId, number>>
}

function foodTierForLevel(level: number): number {
  if (level <= 2) return 0
  if (level <= 5) return 1
  if (level <= 9) return 2
  if (level <= 14) return 3
  return 3
}

export function wheatSeedsForLevel(level: number): number {
  return 3 + Math.floor(level / 2)
}

export function foodPoolForLevel(level: number): readonly FoodId[] {
  return FOOD_POOL_BY_TIER[foodTierForLevel(level)]!
}

export function foodPoolNamesForLevel(level: number): string[] {
  return foodPoolForLevel(level).map((id) => getFoodCatalogEntry(id).name)
}

export function foodCountRangeLabel(level: number): string {
  if (level >= 15) return '×2–4'
  if (level >= 10) return '×2–3'
  if (level >= 5) return '×1–2'
  if (level >= 3) return '×1（65%）或 ×2（35%）'
  return '×1'
}

export function bonusRewardHintsForLevel(level: number): string[] {
  const hints: string[] = []
  if (level >= 5) hints.push('30% 概率额外随机宠物食物 ×1')
  if (level >= 7) hints.push('25% 概率额外香蕉/苹果/玉米种子 ×1–2')
  if (level >= 9) hints.push('20% 概率额外草莓牛奶 ×1')
  if (level >= 12) hints.push('15% 概率再 roll 一份当前奖池食物')
  if (level >= 15) hints.push('15% 概率额外玉米/榴莲种子 ×1–2')
  if (level >= 18) hints.push('25% 概率双份宠物食物奖励')
  return hints
}

export type FarmLevelRewardPreview = {
  level: number
  wheatSeeds: number
  foodPoolLabel: string
  foodCountLabel: string
  bonusHints: string[]
}

export function previewLevelUpRewards(level: number): FarmLevelRewardPreview {
  const pool = foodPoolNamesForLevel(level)
  return {
    level,
    wheatSeeds: wheatSeedsForLevel(level),
    foodPoolLabel: pool.join(' / '),
    foodCountLabel: foodCountRangeLabel(level),
    bonusHints: bonusRewardHintsForLevel(level),
  }
}

export function buildFarmLevelRewardPreviews(maxLevel = FARM_LEVEL_CAP): FarmLevelRewardPreview[] {
  return Array.from({ length: maxLevel }, (_, index) => previewLevelUpRewards(index + 1))
}

function pickRandom<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!
}

function addCount(record: Partial<Record<string, number>>, key: string, amount: number): void {
  record[key] = (record[key] ?? 0) + amount
}

/** 等级越高：更多小麦种子、更高档随机食物、小概率额外奖励 */
export function rollLevelUpRewards(newLevel: number, rng: () => number = Math.random): LevelUpRewards {
  const seeds: Partial<Record<CropId, number>> = {}
  const food: Partial<Record<FoodId, number>> = {}

  addCount(seeds, 'wheat', 3 + Math.floor(newLevel / 2))

  const pool = FOOD_POOL_BY_TIER[foodTierForLevel(newLevel)]!
  const primaryFood = pickRandom(pool, rng)
  let foodCount = 1
  if (newLevel >= 15) foodCount = 2 + Math.floor(rng() * 3)
  else if (newLevel >= 10) foodCount = 2 + Math.floor(rng() * 2)
  else if (newLevel >= 5) foodCount = 1 + Math.floor(rng() * 2)
  else if (newLevel >= 3 && rng() < 0.35) foodCount = 2

  addCount(food, primaryFood, foodCount)

  if (newLevel >= 5 && rng() < 0.3) {
    addCount(food, pickRandom(pool, rng), 1)
  }

  if (newLevel >= 7 && rng() < 0.25) {
    const bonusCrop = pickRandom(BONUS_CROP_IDS, rng)
    addCount(seeds, bonusCrop, 1 + Math.floor(rng() * 2))
  }

  if (newLevel >= 9 && rng() < 0.2) {
    addCount(food, 'strawberryMilk', 1)
  }

  if (newLevel >= 12 && rng() < 0.15) {
    addCount(food, pickRandom(pool, rng), 1)
  }

  if (newLevel >= 15 && rng() < 0.15) {
    addCount(seeds, pickRandom(['corn', 'durian'] as const, rng), 1 + Math.floor(rng() * 2))
  }

  if (newLevel >= 18 && rng() < 0.25) {
    addCount(food, pickRandom(pool, rng), foodCount)
  }

  return { seeds, food }
}

export function formatLevelUpRewardText(rewards: LevelUpRewards): string {
  const parts: string[] = []

  for (const [cropId, count] of Object.entries(rewards.seeds)) {
    if (!count || count <= 0) continue
    parts.push(`${getCropCatalogEntry(cropId as CropId).seedName}×${count}`)
  }
  for (const [foodId, count] of Object.entries(rewards.food)) {
    if (!count || count <= 0) continue
    parts.push(`${getFoodCatalogEntry(foodId as FoodId).name}×${count}`)
  }

  return parts.join('、')
}
