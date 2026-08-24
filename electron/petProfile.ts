export type PetElement = 'fire' | 'earth' | 'air' | 'water'
export type PetZodiac =
  | 'aries'
  | 'leo'
  | 'sagittarius'
  | 'taurus'
  | 'virgo'
  | 'capricorn'
  | 'gemini'
  | 'libra'
  | 'aquarius'
  | 'cancer'
  | 'scorpio'
  | 'pisces'
export type PetGender = 'male' | 'female'

export type PetPersonality = {
  element: PetElement
  zodiac: PetZodiac
  traits: string[]
}

export type PetProfileStored = {
  id: string
  name: string
  gender: PetGender
  title: string
  level: number
  growth: number
  birthday: string
  createdAt: string
  personality: PetPersonality
  coins: number
}

export type PetStatsStored = {
  satiety: number
  hygiene: number
  health: number
  /** 玩耍等事件带来的心情加成，随时间衰减 */
  moodBonus?: number
}

export const ELEMENT_ZODIACS: Record<PetElement, PetZodiac[]> = {
  fire: ['aries', 'leo', 'sagittarius'],
  earth: ['taurus', 'virgo', 'capricorn'],
  air: ['gemini', 'libra', 'aquarius'],
  water: ['cancer', 'scorpio', 'pisces'],
}

export const ELEMENT_TRAITS: Record<PetElement, string[]> = {
  fire: ['热情', '行动力', '自信', '冲动'],
  earth: ['稳重', '务实', '理性', '现实'],
  air: ['思维', '沟通', '社交', '理性'],
  water: ['情感', '敏感', '直觉', '共情'],
}

export const ELEMENT_LABELS: Record<PetElement, string> = {
  fire: '火象',
  earth: '土象',
  air: '风象',
  water: '水象',
}

export const ELEMENT_EMOJI: Record<PetElement, string> = {
  fire: '🔥',
  earth: '🌍',
  air: '🌬️',
  water: '💧',
}

export const ZODIAC_LABELS: Record<PetZodiac, string> = {
  aries: '白羊座',
  leo: '狮子座',
  sagittarius: '射手座',
  taurus: '金牛座',
  virgo: '处女座',
  capricorn: '摩羯座',
  gemini: '双子座',
  libra: '天秤座',
  aquarius: '水瓶座',
  cancer: '巨蟹座',
  scorpio: '天蝎座',
  pisces: '双鱼座',
}

export const GENDER_LABELS: Record<PetGender, string> = {
  male: '男',
  female: '女',
}

const PET_NAMES = [
  '小Q',
  '团子',
  '豆豆',
  '糯米',
  '布丁',
  '棉花',
  '星星',
  '月亮',
  '可乐',
  '芒果',
  '泡芙',
  '奶糖',
  '小橘',
  '阿灰',
  '雪球',
  '芝麻',
  '柚子',
  '麦麦',
  '点点',
  '小七',
]

const ELEMENTS: PetElement[] = ['fire', 'earth', 'air', 'water']

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

function shuffle<T>(items: T[]) {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function formatLocalDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatLocalDateTime(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
}

function generatePetId(now = Date.now()) {
  return `pet_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function randomPersonality(): PetPersonality {
  const element = pickRandom(ELEMENTS)
  const zodiac = pickRandom(ELEMENT_ZODIACS[element])
  const traitCount = 2 + Math.floor(Math.random() * 3)
  const traits = shuffle(ELEMENT_TRAITS[element]).slice(0, traitCount)
  return { element, zodiac, traits }
}

export function createDefaultProfile(now = new Date()): PetProfileStored {
  return {
    id: generatePetId(now.getTime()),
    name: pickRandom(PET_NAMES),
    gender: Math.random() < 0.5 ? 'male' : 'female',
    title: '初来乍到',
    level: 0,
    growth: 0,
    birthday: formatLocalDate(now),
    createdAt: formatLocalDateTime(now),
    personality: randomPersonality(),
    coins: 0,
  }
}

export function createDefaultStats(): PetStatsStored {
  return { satiety: 100, hygiene: 100, health: 100, moodBonus: 0 }
}

export function titleForLevel(level: number) {
  if (level <= 0) return '初来乍到'
  if (level === 1) return '小伙伴'
  if (level <= 2) return '熟悉的朋友'
  if (level <= 4) return '可靠的伙伴'
  if (level <= 9) return '亲密搭档'
  return '灵魂搭档'
}

export type VitalDecayRates = {
  satiety: number
  hygiene: number
  healthPenalty: number
  moodBonus: number
}

export function getPersonalityDecayRates(personality: PetPersonality): VitalDecayRates {
  const base = { satiety: 5, hygiene: 2, healthPenalty: 1, moodBonus: 8 }
  switch (personality.element) {
    case 'fire':
      return { ...base, satiety: base.satiety * 1.1 }
    case 'earth':
      return {
        ...base,
        satiety: base.satiety * 0.85,
        hygiene: base.hygiene * 0.85,
        healthPenalty: base.healthPenalty * 0.85,
      }
    case 'air':
      return { ...base, hygiene: base.hygiene * 1.1 }
    case 'water':
      return { ...base, healthPenalty: base.healthPenalty * 1.25 }
    default:
      return base
  }
}

export function formatPersonalitySummary(personality: PetPersonality) {
  const elementLabel = ELEMENT_LABELS[personality.element]
  const zodiacLabel = ZODIAC_LABELS[personality.zodiac]
  return `${ELEMENT_EMOJI[personality.element]} ${elementLabel} · ${zodiacLabel}`
}
