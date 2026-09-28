export type PetAnimationAction =
  | 'idle'
  | 'walk'
  | 'sleep'
  | 'touch'
  | 'skill_touch'
  | 'victory'
  | 'attack'
  | 'hurt'
  | 'die'

export const ANIMATION_ACTIONS: ReadonlyArray<{ id: PetAnimationAction; label: string }> = [
  { id: 'idle', label: '待机' },
  { id: 'walk', label: '跑' },
  { id: 'sleep', label: '睡觉' },
  { id: 'touch', label: '点击互动' },
  { id: 'skill_touch', label: '技能互动' },
  { id: 'victory', label: '胜利反馈' },
  { id: 'attack', label: '攻击' },
  { id: 'hurt', label: '受击' },
  { id: 'die', label: '倒下' },
]

const ACTION_IDS = new Set<PetAnimationAction>(ANIMATION_ACTIONS.map((item) => item.id))

export type PetAnimationBindings = Record<string, PetAnimationAction>

const DEFAULT_ACTION_CANDIDATES: ReadonlyArray<readonly [PetAnimationAction, readonly string[]]> = [
  ['walk', ['walk', 'run']],
  ['sleep', ['shuijiao', 'sleep', 'rest']],
  ['victory', ['victory', 'skill_01']],
  ['attack', ['attack_2', 'attack']],
  ['skill_touch', ['skill_touch']],
  ['touch', ['touch', 'click']],
  ['hurt', ['hurt', 'hit']],
  ['die', ['die', 'down']],
  ['idle', ['idle', 'stand', 'normal']],
]

export function defaultAnimationBindings(available: string[]): PetAnimationBindings {
  const bindings: PetAnimationBindings = {}
  for (const [action, candidates] of DEFAULT_ACTION_CANDIDATES) {
    const name = candidates.find((candidate) => available.includes(candidate))
    if (name && !bindings[name]) bindings[name] = action
  }
  return bindings
}

export function mergeAnimationBindings(
  defaults: PetAnimationBindings,
  explicit: PetAnimationBindings | undefined,
): PetAnimationBindings {
  const merged = sanitizeAnimationBindings(defaults)
  for (const [name, action] of Object.entries(sanitizeAnimationBindings(explicit))) {
    for (const [boundName, boundAction] of Object.entries(merged)) {
      if (boundName !== name && boundAction === action) delete merged[boundName]
    }
    merged[name] = action
  }
  return merged
}

export function sanitizeAnimationBindings(raw: unknown): PetAnimationBindings {
  if (!raw || typeof raw !== 'object') return {}
  const bindings: PetAnimationBindings = {}
  for (const [animationName, action] of Object.entries(raw as Record<string, unknown>)) {
    const name = animationName.trim()
    if (!name || typeof action !== 'string' || !ACTION_IDS.has(action as PetAnimationAction)) continue
    bindings[name] = action as PetAnimationAction
  }
  return bindings
}

export function setAnimationBinding(
  current: PetAnimationBindings,
  animationName: string,
  action: string,
): PetAnimationBindings {
  const next = sanitizeAnimationBindings(current)
  const name = animationName.trim()
  if (!name || !ACTION_IDS.has(action as PetAnimationAction)) {
    delete next[name]
    return next
  }
  for (const [boundName, boundAction] of Object.entries(next)) {
    if (boundName !== name && boundAction === action) delete next[boundName]
  }
  next[name] = action as PetAnimationAction
  return next
}
