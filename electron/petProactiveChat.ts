import type { PetElement } from './petProfile'

export type ProactiveKind = 'hungry' | 'dirty' | 'weak' | 'lonely' | 'sing'

export type ProactiveLatches = Partial<Record<Exclude<ProactiveKind, 'sing'>, boolean>>

/** 全局两次主动搭话最小间隔 */
export const PROACTIVE_COOLDOWN_MS = 30 * 60 * 1000
/** 心情好唱歌：约一小时一句 */
export const PROACTIVE_SING_COOLDOWN_MS = 60 * 60 * 1000
/** 多久没互动算「寂寞」 */
export const PROACTIVE_LONELY_MS = 30 * 60 * 1000
/** 主动搭话检查节流 */
export const PROACTIVE_CHECK_INTERVAL_MS = 30 * 1000

const THRESHOLD = {
  hungry: 25,
  dirty: 30,
  weak: 40,
  /** 与「心情很好」文案对齐 */
  happy: 85,
  /** 恢复后清 latch，避免同一状态反复刷 */
  hungryRecover: 40,
  dirtyRecover: 45,
  weakRecover: 55,
} as const

const LINES: Record<ProactiveKind, string[]> = {
  hungry: [
    '肚子好饿呀…喂我一口好不好？',
    '有点饿了，想吃东西～',
    '咕咕叫了，快投喂我嘛！',
  ],
  dirty: [
    '我有点脏了，帮我洗洗吧…',
    '身上不太舒服，想洗澡。',
    '感觉黏糊糊的，陪我清洁一下好不好？',
  ],
  weak: [
    '感觉不太舒服…能陪陪我吗？',
    '有点没精神，让我休息一下吧。',
    '身体软软的，好想被照顾…',
  ],
  lonely: [
    '你去哪了？好想你陪我说说话…',
    '一个人好无聊呀，来找我玩嘛～',
    '好久没理我了，是不是把我忘了？',
  ],
  sing: [
    '今生戴花～ 世世漂亮 你簪一朵春天衣食无忧伤～',
    '雨纷纷～ 旧故里草木深～ 我听闻你始终一个人～',
    '天青色等烟雨～ 而我在等你～ 炊烟袅袅升起～ 隔江千万里～',
    '你撑把小纸伞～ 叹姻缘太婉转 ～',
  ],
}

/** 性格微调：只换措辞倾向，仍走本地模板 */
const ELEMENT_SUFFIX: Partial<Record<PetElement, Partial<Record<ProactiveKind, string>>>> = {
  fire: {
    hungry: '快点快点，我快饿扁啦！',
    lonely: '还不来？我可要闹啦～',
  },
  earth: {
    hungry: '有点饿了，有空的话喂我一下吧。',
    lonely: '你忙的话也没关系…我在这等你。',
  },
  air: {
    dirty: '诶诶身上不太清爽，聊聊顺便帮我洗洗？',
    lonely: '我想你啦，随便说点什么都行～',
  },
  water: {
    weak: '有点难受…你在的话我会安心一点。',
    lonely: '好想你啊…你会回来看我的吧？',
  },
}

export type ProactiveInput = {
  satiety: number
  hygiene: number
  health: number
  mood: number
  lastInteractAt: number
  lastProactiveAt?: number
  latches: ProactiveLatches
  element?: PetElement
  now?: number
}

export type ProactiveDecision = {
  kind: ProactiveKind
  text: string
  latches: ProactiveLatches
  /** 唱歌等场景可附带动画名 */
  animation?: string
}

function pickLine(kind: ProactiveKind, element?: PetElement) {
  const special = element ? ELEMENT_SUFFIX[element]?.[kind] : undefined
  if (special && Math.random() < 0.45) return special
  const pool = LINES[kind]
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0]
}

function clearRecoveredLatches(
  latches: ProactiveLatches,
  stats: Pick<ProactiveInput, 'satiety' | 'hygiene' | 'health'>,
): ProactiveLatches {
  const next = { ...latches }
  if (stats.satiety >= THRESHOLD.hungryRecover) delete next.hungry
  if (stats.hygiene >= THRESHOLD.dirtyRecover) delete next.dirty
  if (stats.health >= THRESHOLD.weakRecover) delete next.weak
  return next
}

/**
 * 纯规则决策：不调用 LLM。
 * 优先级：饿 > 脏 > 虚弱 > 寂寞 > 心情好唱歌。
 */
export function decideProactiveChat(input: ProactiveInput): ProactiveDecision | null {
  const now = input.now ?? Date.now()
  const latches = clearRecoveredLatches(input.latches, input)
  const lastProactiveAt = input.lastProactiveAt

  if (
    typeof lastProactiveAt === 'number' &&
    now - lastProactiveAt < PROACTIVE_COOLDOWN_MS
  ) {
    return null
  }

  const candidates: ProactiveKind[] = []
  if (input.satiety < THRESHOLD.hungry && !latches.hungry) candidates.push('hungry')
  if (input.hygiene < THRESHOLD.dirty && !latches.dirty) candidates.push('dirty')
  if (input.health < THRESHOLD.weak && !latches.weak) candidates.push('weak')
  if (now - input.lastInteractAt >= PROACTIVE_LONELY_MS && !latches.lonely) {
    candidates.push('lonely')
  }
  // 唱歌不 latch：靠约 1 小时冷却，心情好时可周期性唱
  if (
    input.mood >= THRESHOLD.happy &&
    (typeof lastProactiveAt !== 'number' || now - lastProactiveAt >= PROACTIVE_SING_COOLDOWN_MS)
  ) {
    candidates.push('sing')
  }

  const kind = candidates[0]
  if (!kind) return null

  const nextLatches =
    kind === 'sing' ? latches : { ...latches, [kind]: true as const }

  return {
    kind,
    text: pickLine(kind, input.element),
    latches: nextLatches,
    animation: kind === 'sing' ? 'skill_touch' : undefined,
  }
}

export function proactiveReminderId(kind: ProactiveKind) {
  return `proactive:${kind}`
}

export function isProactiveReminderId(id: string | undefined | null) {
  return Boolean(id && id.startsWith('proactive:'))
}
