import type {
  BallHitMinigameConfig,
  HeartRallyMinigameConfig,
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

export type ResolvedHeartRallyConfig = {
  skill: ResolvedPetSkill
  durationMs: number
  heartSpeed: number
  arcLift: number
  gravity: number
  clickRadius: number
  hopPx: number
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

/** 弹爱心默认用 attack，不与打小球的 attack_2 共用 */
export const DEFAULT_HEART_ATTACK: ResolvedPetSkill = {
  id: 'heart_attack',
  animation: 'attack',
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

export const DEFAULT_HEART_RALLY: Omit<ResolvedHeartRallyConfig, 'skill'> = {
  durationMs: 45_000,
  heartSpeed: 1.75,
  arcLift: 3.4,
  gravity: 0.075,
  clickRadius: 40,
  hopPx: 28,
  bodyHitReach: 36,
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

function resolveSkillForMinigame(
  character: Pick<PetCharacter, 'skills' | 'minigames'> | null | undefined,
  skillIdRaw: string | undefined,
): ResolvedPetSkill {
  const skillId = skillIdRaw?.trim() || DEFAULT_BASIC_ATTACK.id
  const fromMeta = character?.skills?.[skillId]
  const fallbackSkill =
    character?.skills?.basic_attack
      ? mergeSkill('basic_attack', character.skills.basic_attack, DEFAULT_BASIC_ATTACK)
      : DEFAULT_BASIC_ATTACK
  return mergeSkill(skillId, fromMeta, { ...fallbackSkill, id: skillId })
}

/** 合并角色 meta 与默认值，供打小球使用 */
export function resolveBallHitConfig(
  character?: Pick<PetCharacter, 'skills' | 'minigames'> | null,
): ResolvedBallHitConfig {
  const ballHit = character?.minigames?.ballHit
  return {
    skill: resolveSkillForMinigame(character, ballHit?.skillId),
    ...mergeBallHitRules(ballHit),
  }
}

function mergeHeartRallyRules(partial: HeartRallyMinigameConfig | undefined) {
  return {
    durationMs: partial?.durationMs ?? DEFAULT_HEART_RALLY.durationMs,
    heartSpeed: partial?.heartSpeed ?? DEFAULT_HEART_RALLY.heartSpeed,
    arcLift: partial?.arcLift ?? DEFAULT_HEART_RALLY.arcLift,
    gravity: partial?.gravity ?? DEFAULT_HEART_RALLY.gravity,
    clickRadius: partial?.clickRadius ?? DEFAULT_HEART_RALLY.clickRadius,
    hopPx: partial?.hopPx ?? DEFAULT_HEART_RALLY.hopPx,
    bodyHitReach: partial?.bodyHitReach ?? DEFAULT_HEART_RALLY.bodyHitReach,
  }
}

/** 合并角色 meta 与默认值，供弹爱心使用 */
export function resolveHeartRallyConfig(
  character?: Pick<PetCharacter, 'skills' | 'minigames'> | null,
): ResolvedHeartRallyConfig {
  const heartRally = character?.minigames?.heartRally
  const skillId = heartRally?.skillId?.trim() || DEFAULT_HEART_ATTACK.id
  const fromMeta = character?.skills?.[skillId]
  const fallbackSkill =
    character?.skills?.heart_attack
      ? mergeSkill('heart_attack', character.skills.heart_attack, DEFAULT_HEART_ATTACK)
      : character?.skills?.basic_attack
        ? mergeSkill('basic_attack', { ...character.skills.basic_attack, animation: 'attack' }, DEFAULT_HEART_ATTACK)
        : DEFAULT_HEART_ATTACK
  return {
    skill: mergeSkill(skillId, fromMeta, { ...fallbackSkill, id: skillId }),
    ...mergeHeartRallyRules(heartRally),
  }
}
