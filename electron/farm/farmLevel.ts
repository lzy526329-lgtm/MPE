import type { CropId } from './cropCatalog'
import type { FoodId } from '../game/foodCatalog'
import type { GameState, InventoryState } from '../game/gameTypes'
import {
  FARM_LEVEL_CAP,
  formatLevelUpRewardText,
  rollLevelUpRewards,
  xpToNextLevel,
  type LevelUpRewards,
} from './farmLevelCatalog'

export type FarmXpProgress = {
  level: number
  current: number
  required: number
  isMaxLevel: boolean
}

export type FarmLevelUpEvent = {
  level: number
  rewards: LevelUpRewards
  rewardText: string
}

export type GrantFarmXpResult = {
  game: GameState
  xpGained: number
  previousLevel: number
  newLevel: number
  levelUps: FarmLevelUpEvent[]
  levelUpMessage?: string
}

function normalizeTotalXp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER)
}

export function farmLevelFromTotalXp(totalXp: unknown): number {
  let xp = normalizeTotalXp(totalXp)
  let level = 0
  while (level < FARM_LEVEL_CAP) {
    const need = xpToNextLevel(level)
    if (xp < need) break
    xp -= need
    level += 1
  }
  return level
}

export function farmXpProgress(totalXp: unknown): FarmXpProgress {
  const normalized = normalizeTotalXp(totalXp)
  let remaining = normalized
  let level = 0

  while (level < FARM_LEVEL_CAP) {
    const need = xpToNextLevel(level)
    if (remaining < need) {
      return { level, current: remaining, required: need, isMaxLevel: false }
    }
    remaining -= need
    level += 1
  }

  return { level: FARM_LEVEL_CAP, current: 0, required: 0, isMaxLevel: true }
}

export function xpRemainingToLevel(totalXp: unknown, targetLevel: number): number {
  const progress = farmXpProgress(totalXp)
  if (progress.level >= targetLevel) return 0

  let needed = 0
  for (let level = progress.level; level < targetLevel; level += 1) {
    needed += xpToNextLevel(level)
  }
  return Math.max(0, needed - progress.current)
}

/** 达到指定等级所需的累计 totalXp（例如 Lv.1 → 500） */
export function totalXpForLevel(level: number): number {
  let total = 0
  for (let current = 0; current < level; current += 1) {
    total += xpToNextLevel(current)
  }
  return total
}

function cloneInventory(inventory: InventoryState): InventoryState {
  return {
    food: { ...inventory.food },
    seeds: { ...inventory.seeds },
    produce: { ...inventory.produce },
  }
}

function applyRewards(inventory: InventoryState, rewards: LevelUpRewards): InventoryState {
  const next = cloneInventory(inventory)

  for (const [cropId, count] of Object.entries(rewards.seeds)) {
    if (!count || count <= 0) continue
    next.seeds[cropId as CropId] = (next.seeds[cropId as CropId] ?? 0) + count
  }
  for (const [foodId, count] of Object.entries(rewards.food)) {
    if (!count || count <= 0) continue
    next.food[foodId as FoodId] = (next.food[foodId as FoodId] ?? 0) + count
  }

  return next
}

function formatLevelUpMessage(levelUps: FarmLevelUpEvent[]): string | undefined {
  if (levelUps.length === 0) return undefined
  const levels = levelUps.map((item) => `Lv.${item.level}`).join('、')
  const rewardParts = levelUps.map((item) => item.rewardText).filter(Boolean)
  const uniqueRewards = [...new Set(rewardParts)]
  const rewardSummary = uniqueRewards.length === 1 ? uniqueRewards[0] : rewardParts.join('；')
  return `🎉 农场升到 ${levels}！获得 ${rewardSummary}`
}

export function grantFarmExperience(
  state: GameState,
  xp: number,
  rng: () => number = Math.random,
): GrantFarmXpResult {
  if (xp <= 0) {
    const progress = farmXpProgress(state.farm.totalXp ?? 0)
    return {
      game: state,
      xpGained: 0,
      previousLevel: progress.level,
      newLevel: progress.level,
      levelUps: [],
    }
  }

  const previousLevel = farmLevelFromTotalXp(state.farm.totalXp ?? 0)
  const totalXp = normalizeTotalXp(state.farm.totalXp) + Math.floor(xp)
  const newLevel = farmLevelFromTotalXp(totalXp)
  const levelUps: FarmLevelUpEvent[] = []

  let inventory = cloneInventory(state.inventory)
  for (let level = previousLevel + 1; level <= newLevel; level += 1) {
    const rewards = rollLevelUpRewards(level, rng)
    inventory = applyRewards(inventory, rewards)
    levelUps.push({
      level,
      rewards,
      rewardText: formatLevelUpRewardText(rewards),
    })
  }

  return {
    game: {
      ...state,
      farm: { ...state.farm, totalXp },
      inventory,
    },
    xpGained: Math.floor(xp),
    previousLevel,
    newLevel,
    levelUps,
    levelUpMessage: formatLevelUpMessage(levelUps),
  }
}
