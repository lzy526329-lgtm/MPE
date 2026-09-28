import {
  ANIMATION_ACTIONS,
  defaultAnimationBindings,
  mergeAnimationBindings,
  type PetAnimationAction,
  type PetAnimationBindings,
} from '../electron/petAnimationBindings'

export { ANIMATION_ACTIONS }
export { defaultAnimationBindings }
export { mergeAnimationBindings }
export type { PetAnimationAction, PetAnimationBindings }

export function pickAnimationName(available: string[], candidates: string[]) {
  return candidates.find((name) => available.includes(name)) ?? null
}

export function resolveAnimationForAction(
  available: string[],
  bindings: PetAnimationBindings | undefined,
  action: PetAnimationAction,
  fallbackCandidates: string[],
) {
  const bound = Object.entries(bindings ?? {}).find(([name, value]) => value === action && available.includes(name))?.[0]
  return bound ?? pickAnimationName(available, fallbackCandidates)
}

export function preferredSleepAnimation(available: string[]) {
  return pickAnimationName(available, ['shuijiao', 'sleep', 'rest'])
}
