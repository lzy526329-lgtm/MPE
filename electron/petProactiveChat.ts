import type { PetElement } from './petProfile'

export type ProactiveKind = 'hungry' | 'dirty' | 'weak' | 'working_long' | 'lonely' | 'sing'

export type ProactiveLatches = Partial<Record<Exclude<ProactiveKind, 'sing'>, boolean>>

/** 全局两次主动搭话最小间隔 */
export const PROACTIVE_COOLDOWN_MS = 30 * 60 * 1000
/** 心情好唱歌：约一小时一句 */
export const PROACTIVE_SING_COOLDOWN_MS = 60 * 60 * 1000
/** 多久没互动算「寂寞」 */
export const PROACTIVE_LONELY_MS = 30 * 60 * 1000
/** 主动搭话检查节流 */
export const PROACTIVE_CHECK_INTERVAL_MS = 30 * 1000

/** 空闲低于该秒数视为「正在用电脑」 */
export const WORK_ACTIVE_IDLE_SEC = 90
/** 空闲达到该秒数视为「休息/离开」，重置连续工作段 */
export const WORK_BREAK_IDLE_SEC = 5 * 60
/** 连续活跃多久触发「忙太久了」提醒 */
export const WORK_LONG_MS = 30 * 60 * 1000

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
  working_long: [
    '你好像忙了好久了…起来走一走好不好？',
    '连续工作很久啦，眼睛和肩膀都要歇歇～',
    '嘿，忙了半小时了吧？陪我喝口水再继续！',
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
    working_long: '够啦够啦！站起来蹦两下再卷！',
  },
  earth: {
    hungry: '有点饿了，有空的话喂我一下吧。',
    lonely: '你忙的话也没关系…我在这等你。',
    working_long: '忙很久了，休息五分钟会更稳。',
  },
  air: {
    dirty: '诶诶身上不太清爽，聊聊顺便帮我洗洗？',
    lonely: '我想你啦，随便说点什么都行～',
    working_long: '工作久了脑袋会糊，起来晃晃再回来？',
  },
  water: {
    weak: '有点难受…你在的话我会安心一点。',
    lonely: '好想你啊…你会回来看我的吧？',
    working_long: '心疼你忙这么久…先歇一会儿好不好？',
  },
}

export type WorkSessionState = {
  /** 当前连续活跃段起点；null 表示不在工作段内 */
  startedAt: number | null
}

export type ProactiveInput = {
  satiety: number
  hygiene: number
  health: number
  mood: number
  lastInteractAt: number
  lastProactiveAt?: number
  latches: ProactiveLatches
  /** 当前连续活跃时长（毫秒），由系统空闲时间推算 */
  continuousWorkMs?: number
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

/**
 * 根据系统空闲秒数推进「连续工作」会话。
 * - 空闲很短：开始/延续工作段
 * - 空闲中等：保持当前段（短暂停顿不算休息）
 * - 空闲够久：结束工作段
 */
export function advanceWorkSession(
  state: WorkSessionState,
  idleSeconds: number,
  now = Date.now(),
): { state: WorkSessionState; continuousWorkMs: number; broke: boolean } {
  const idle = Math.max(0, Math.floor(idleSeconds))

  if (idle >= WORK_BREAK_IDLE_SEC) {
    return {
      state: { startedAt: null },
      continuousWorkMs: 0,
      broke: state.startedAt !== null,
    }
  }

  let startedAt = state.startedAt
  if (idle <= WORK_ACTIVE_IDLE_SEC && startedAt === null) {
    startedAt = now
  }

  return {
    state: { startedAt },
    continuousWorkMs: startedAt != null ? Math.max(0, now - startedAt) : 0,
    broke: false,
  }
}

function pickLine(kind: ProactiveKind, element?: PetElement) {
  const special = element ? ELEMENT_SUFFIX[element]?.[kind] : undefined
  if (special && Math.random() < 0.45) return special
  const pool = LINES[kind]
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0]
}

function clearRecoveredLatches(
  latches: ProactiveLatches,
  stats: Pick<ProactiveInput, 'satiety' | 'hygiene' | 'health' | 'continuousWorkMs'>,
): ProactiveLatches {
  const next = { ...latches }
  if (stats.satiety >= THRESHOLD.hungryRecover) delete next.hungry
  if (stats.hygiene >= THRESHOLD.dirtyRecover) delete next.dirty
  if (stats.health >= THRESHOLD.weakRecover) delete next.weak
  // 休息/离开后清掉「忙太久」latch，下次连续工作可再提醒
  if ((stats.continuousWorkMs ?? 0) <= 0) delete next.working_long
  return next
}

/**
 * 纯规则决策：不调用 LLM。
 * 优先级：饿 > 脏 > 虚弱 > 忙太久 > 寂寞 > 心情好唱歌。
 */
export function decideProactiveChat(input: ProactiveInput): ProactiveDecision | null {
  const now = input.now ?? Date.now()
  const continuousWorkMs = input.continuousWorkMs ?? 0
  const latches = clearRecoveredLatches(input.latches, { ...input, continuousWorkMs })
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
  if (continuousWorkMs >= WORK_LONG_MS && !latches.working_long) {
    candidates.push('working_long')
  }
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
