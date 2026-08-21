import type {
  BallHitMinigameConfig,
  PetCharacter,
  PetSkillConfig,
} from '../electron/petCharacters'

export type ResolvedPetSkill = {
  id: string
  animation: string
  range: number
  halfHeight: number
  minDist: number
  activeStartMs: number
  activeMs: number
  cooldownMs: number
}

export type ResolvedBallHitConfig = {
  skill: ResolvedPetSkill
  durationMs: number
  maxHp: number
  ballDamage: number
  spawnIntervalMs: number
  ballSpeed: number
  bodyHitReach: number
}

export const DEFAULT_BASIC_ATTACK: ResolvedPetSkill = {
  id: 'basic_attack',
  animation: 'attack_2',
  range: 78,
  halfHeight: 42,
  minDist: 18,
  activeStartMs: 220,
  activeMs: 200,
  cooldownMs: 420,
}

export const DEFAULT_BALL_HIT: Omit<ResolvedBallHitConfig, 'skill'> = {
  durationMs: 30_000,
  maxHp: 100,
  ballDamage: 50,
  spawnIntervalMs: 1400,
  ballSpeed: 1.55,
  bodyHitReach: 26,
}

function mergeSkill(
  id: string,
  partial: PetSkillConfig | undefined,
  fallback: ResolvedPetSkill,
): ResolvedPetSkill {
  return {
    id,
    animation: partial?.animation?.trim() || fallback.animation,
    range: partial?.range ?? fallback.range,
    halfHeight: partial?.halfHeight ?? fallback.halfHeight,
    minDist: partial?.minDist ?? fallback.minDist,
    activeStartMs: partial?.activeStartMs ?? fallback.activeStartMs,
    activeMs: partial?.activeMs ?? fallback.activeMs,
    cooldownMs: partial?.cooldownMs ?? fallback.cooldownMs,
  }
}

function mergeBallHitRules(partial: BallHitMinigameConfig | undefined) {
  return {
    durationMs: partial?.durationMs ?? DEFAULT_BALL_HIT.durationMs,
    maxHp: partial?.maxHp ?? DEFAULT_BALL_HIT.maxHp,
    ballDamage: partial?.ballDamage ?? DEFAULT_BALL_HIT.ballDamage,
    spawnIntervalMs: partial?.spawnIntervalMs ?? DEFAULT_BALL_HIT.spawnIntervalMs,
    ballSpeed: partial?.ballSpeed ?? DEFAULT_BALL_HIT.ballSpeed,
    bodyHitReach: partial?.bodyHitReach ?? DEFAULT_BALL_HIT.bodyHitReach,
  }
}

/** 合并角色 meta 与默认值，供打小球使用 */
export function resolveBallHitConfig(
  character?: Pick<PetCharacter, 'skills' | 'minigames'> | null,
): ResolvedBallHitConfig {
  const ballHit = character?.minigames?.ballHit
  const skillId = ballHit?.skillId?.trim() || DEFAULT_BASIC_ATTACK.id
  const fromMeta = character?.skills?.[skillId]
  const fallbackSkill =
    character?.skills?.basic_attack
      ? mergeSkill('basic_attack', character.skills.basic_attack, DEFAULT_BASIC_ATTACK)
      : DEFAULT_BASIC_ATTACK
  const skill = mergeSkill(skillId, fromMeta, { ...fallbackSkill, id: skillId })
  return {
    skill,
    ...mergeBallHitRules(ballHit),
  }
}
