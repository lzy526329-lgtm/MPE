/** 从 level 升到 level+1 所需亲密度经验 */
export function xpToNextPetLevel(level: number): number {
  return 80 + level * 40
}

export const PET_GROWTH_FEED = 8
export const PET_GROWTH_CLEAN = 6
export const PET_GROWTH_REST = 5
export const PET_GROWTH_MINIGAME = 15
export const PET_GROWTH_CHAT = 3
export const PET_GROWTH_CHAT_DAILY_CAP = 30
