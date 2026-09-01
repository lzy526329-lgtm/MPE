import { titleForLevel, type PetProfileStored } from './petProfile'
import { xpToNextPetLevel, PET_GROWTH_CHAT, PET_GROWTH_CHAT_DAILY_CAP } from './petLevelCatalog'

export type PetGrowthProgress = {
  level: number
  current: number
  required: number
  totalGrowth: number
}

export type PetGrowthDaily = {
  date: string
  chatXp: number
}

export type GrantPetGrowthResult = {
  profile: PetProfileStored
  growthDaily?: PetGrowthDaily
  xpGained: number
  previousLevel: number
  newLevel: number
  leveledUp: boolean
}

function normalizeGrowth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER)
}

export function petLevelFromGrowth(growth: unknown): number {
  let remaining = normalizeGrowth(growth)
  let level = 0
  while (true) {
    const need = xpToNextPetLevel(level)
    if (remaining < need) break
    remaining -= need
    level += 1
  }
  return level
}

export function petGrowthProgress(growth: unknown): PetGrowthProgress {
  const totalGrowth = normalizeGrowth(growth)
  let remaining = totalGrowth
  let level = 0

  while (true) {
    const need = xpToNextPetLevel(level)
    if (remaining < need) {
      return { level, current: remaining, required: need, totalGrowth }
    }
    remaining -= need
    level += 1
  }
}

export function totalGrowthForLevel(level: number): number {
  let total = 0
  for (let current = 0; current < level; current += 1) {
    total += xpToNextPetLevel(current)
  }
  return total
}

export function grantPetGrowth(
  profile: PetProfileStored,
  amount: number,
  growthDaily?: PetGrowthDaily,
): GrantPetGrowthResult {
  const xpGained = Math.max(0, Math.floor(amount))
  const previousLevel = petLevelFromGrowth(profile.growth)

  if (xpGained <= 0) {
    const level = previousLevel
    return {
      profile: {
        ...profile,
        level,
        growth: normalizeGrowth(profile.growth),
        title: profile.title || titleForLevel(level),
      },
      growthDaily,
      xpGained: 0,
      previousLevel,
      newLevel: level,
      leveledUp: false,
    }
  }

  const newGrowth = normalizeGrowth(profile.growth) + xpGained
  const newLevel = petLevelFromGrowth(newGrowth)
  const leveledUp = newLevel > previousLevel

  return {
    profile: {
      ...profile,
      growth: newGrowth,
      level: newLevel,
      title: leveledUp ? titleForLevel(newLevel) : profile.title || titleForLevel(newLevel),
    },
    growthDaily,
    xpGained,
    previousLevel,
    newLevel,
    leveledUp,
  }
}

export function grantChatGrowth(
  profile: PetProfileStored,
  growthDaily: PetGrowthDaily | undefined,
  today: string,
): GrantPetGrowthResult {
  const daily = growthDaily?.date === today ? growthDaily : { date: today, chatXp: 0 }
  const remaining = PET_GROWTH_CHAT_DAILY_CAP - daily.chatXp
  if (remaining <= 0) {
    return grantPetGrowth(profile, 0, daily)
  }

  const amount = Math.min(PET_GROWTH_CHAT, remaining)
  return grantPetGrowth(profile, amount, {
    date: today,
    chatXp: daily.chatXp + amount,
  })
}
