import { BrowserWindow, Menu, app, ipcMain, powerMonitor, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { APP_HOME_PAGE, PET_TOOL_MENU, type AppPageId } from './appPages'
import { registerPetAiIpc, generateSituationalLine, isProactiveAiEnabled } from './petAi'
import { getPetCharacter, listPetCharacters } from './petCharacters'
import {
  createDefaultProfile,
  createDefaultStats,
  getPersonalityDecayRates,
  titleForLevel,
  type PetProfileStored,
  type PetStatsStored,
} from './petProfile'
import {
  loadSkinView,
  pruneLegacyClipFiles,
  readSkinConfig,
  removePetClip,
  resetPetSkin,
  savePetClip,
  updatePetClip,
  type PetClipKey,
  type PetSkinConfig,
  type SavePetClipRequest,
  type UpdatePetClipRequest,
} from './petSkin'
import { rememberCareEvent, rememberRename } from './petMemory'
import { pickCareLine, type CareKind } from './petCareLines'
import {
  advanceWorkSession,
  decideProactiveChat,
  isProactiveReminderId,
  PROACTIVE_CHECK_INTERVAL_MS,
  proactiveReminderId,
  type ProactiveLatches,
  type WorkSessionState,
} from './petProactiveChat'

export type PetCareReactPayload = {
  kind: CareKind
  text: string
  animation: 'victory'
}

export const PET_SIZE_MIN = 96
export const PET_SIZE_MAX = 280
export const PET_SIZE_DEFAULT = 160

export type { PetGender, PetPersonality, PetProfileStored, PetStatsStored } from './petProfile'

type PetSettings = {
  enabled: boolean
  x?: number
  y?: number
  size?: number
  characterId?: string
  autoWalk?: boolean
  profile?: PetProfileStored
  stats?: PetStatsStored
  lastVitalAt?: number
  /** 最近一次玩家互动（喂食/清洁/休息/对话等） */
  lastInteractAt?: number
  lastProactiveAt?: number
  proactiveLatches?: ProactiveLatches
  reminders?: PetReminderStored[]
  activeChatReminderId?: string
  /** @deprecated use stats.satiety */
  health?: number
  /** @deprecated use stats / hunger inverted to satiety */
  hunger?: number
  /** @deprecated migrated to reminders[] */
  reminderEnabled?: boolean
  /** @deprecated */
  reminderMode?: PetReminderMode
  /** @deprecated */
  reminderMinutes?: number
  /** @deprecated */
  reminderOnceAt?: string
  /** @deprecated */
  reminderDailyTime?: string
  /** @deprecated */
  reminderText?: string
  /** @deprecated */
  reminderRequireConfirm?: boolean
  /** @deprecated */
  reminderNextAt?: number
  /** @deprecated */
  reminderPendingText?: string
  /** @deprecated */
  reminderPendingSince?: number
  skin?: PetSkinConfig
}

type PetReminderStored = {
  id: string
  enabled: boolean
  mode: PetReminderMode
  minutes: number
  onceAt?: string
  dailyTime: string
  text: string
  requireConfirm: boolean
  nextAt?: number
  pendingText?: string
  pendingSince?: number
}

export type PetStatus = {
  enabled: boolean
  autoWalk: boolean
  size: number
  characterId: string
  satiety: number
  hygiene: number
  health: number
  mood: number
  profile: PetProfileStored
}

export type PetBounds = {
  x: number
  y: number
  width: number
  height: number
  workArea: { x: number; y: number; width: number; height: number }
}

/** 窗口放大时的水平锚点：贴边时往开阔方向扩，减少 clamp 挪位 */
export type PetViewportAnchor = 'bottom-center' | 'bottom-left' | 'bottom-right'

export type PetReminderItem = {
  id: string
  enabled: boolean
  mode: PetReminderMode
  minutes: number
  onceAt: string
  dailyTime: string
  text: string
  requireConfirm: boolean
  nextAt: number | null
  pendingText: string | null
  pendingSince: number | null
}

export type PetReminderMode = 'interval-repeat' | 'interval-once' | 'datetime-once' | 'daily-time'

export type PetChatMessage = {
  reminderId: string
  text: string
  requireConfirm: boolean
  dismissAfterMs: number | null
  /** 可选：展示气泡时播放的 Spine 动画名 */
  animation?: string
}

let petWin: BrowserWindow | null = null
let getMainWindow: () => BrowserWindow | null = () => null
let ensureMainWindow: () => BrowserWindow | null = () => null
let ipcRegistered = false
let reminderTimer: ReturnType<typeof setInterval> | null = null
let chatQueue: PetChatMessage[] = []
let activeChatMessage: PetChatMessage | null = null
let activeChatTimer: ReturnType<typeof setTimeout> | null = null
let lastProactiveCheckAt = 0
let proactiveSpeechBusy = false
/** 本进程内的连续工作会话（不落盘；重启后重新计时） */
let workSessionState: WorkSessionState = { startedAt: null }
/** 避免渲染进程崩溃后短时间反复重建 */
let petCrashRestartTimer: ReturnType<typeof setTimeout> | null = null
let lastPetCrashAt = 0
/** 状态数值未变时，最多多久仍刷一次 lastVitalAt */
const VITALS_FLUSH_MS = 60_000
/** 桌宠小游戏：当前进行中的 id，null 表示未开始 */
let activeMinigameId: string | null = null
/** 一局小游戏：消耗饱食/卫生，提升心情加成 */
const PLAY_SATIETY_COST = 6
const PLAY_HYGIENE_COST = 3
const PLAY_MOOD_GAIN = 20

export type PetMinigameEvent =
  | { action: 'start'; id: 'ball-hit' | 'heart-rally' }
  | { action: 'stop' }

function settingsFile() {
  return path.join(app.getPath('userData'), 'pet.json')
}

function readSettings(): PetSettings {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) as PetSettings
  } catch {
    return { enabled: true }
  }
}

function migrateLegacyStats(settings: PetSettings): PetStatsStored {
  if (settings.stats) return settings.stats
  const legacyHealth = typeof settings.health === 'number' ? settings.health : 100
  const legacyHunger = typeof settings.hunger === 'number' ? settings.hunger : 20
  return {
    satiety: clampStat(100 - legacyHunger),
    hygiene: 100,
    health: clampStat(legacyHealth),
  }
}

function ensurePetProfile(settings: PetSettings): PetProfileStored {
  if (settings.profile?.id) {
    const profile = settings.profile
    return {
      ...profile,
      title: profile.title || titleForLevel(profile.level ?? 0),
      level: profile.level ?? 0,
      growth: profile.growth ?? 0,
      coins: profile.coins ?? 0,
      personality: profile.personality ?? createDefaultProfile().personality,
    }
  }
  return createDefaultProfile()
}

function ensurePetData(settings = readSettings()) {
  const patch: Partial<PetSettings> = {}
  let changed = false

  if (!settings.profile?.id) {
    patch.profile = createDefaultProfile()
    changed = true
  }

  if (!settings.stats) {
    patch.stats = migrateLegacyStats(settings)
    changed = true
  }

  if (typeof settings.lastVitalAt !== 'number') {
    patch.lastVitalAt = Date.now()
    changed = true
  }

  if (typeof settings.lastInteractAt !== 'number') {
    patch.lastInteractAt = Date.now()
    changed = true
  }

  if (changed) {
    writeSettings(patch)
    return { ...settings, ...patch }
  }

  return settings
}

function getPetStats(settings = ensurePetData()): PetStatsStored {
  const stats = settings.stats ?? createDefaultStats()
  return {
    satiety: clampStat(stats.satiety),
    hygiene: clampStat(stats.hygiene),
    health: clampStat(stats.health),
    moodBonus: clampStat(stats.moodBonus ?? 0),
  }
}

function getPetProfile(settings = ensurePetData()): PetProfileStored {
  return ensurePetProfile(settings)
}

function writeSettings(patch: Partial<PetSettings>) {
  const next = { ...readSettings(), ...patch }
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2))
}

function petCrashLogFile() {
  return path.join(app.getPath('userData'), 'pet-crash.log')
}

function appendPetCrashLog(label: string, detail: unknown) {
  const line = `[${new Date().toISOString()}] ${label} ${JSON.stringify(detail)}\n`
  try {
    fs.appendFileSync(petCrashLogFile(), line)
  } catch {
    /* ignore */
  }
  console.error('[pet]', label, detail)
}

function schedulePetCrashRecover(reason: string) {
  const now = Date.now()
  if (now - lastPetCrashAt < 5_000) return
  lastPetCrashAt = now
  if (petCrashRestartTimer) clearTimeout(petCrashRestartTimer)
  petCrashRestartTimer = setTimeout(() => {
    petCrashRestartTimer = null
    if (readSettings().enabled === false) return
    appendPetCrashLog('recover', { reason })
    if (petWin && !petWin.isDestroyed()) {
      try {
        petWin.webContents.reloadIgnoringCache()
        return
      } catch {
        /* fall through to recreate */
      }
    }
    createPetWindow()
  }, 800)
}

function clampStat(value: number) {
  return Math.min(100, Math.max(0, value))
}

function roundStat(value: number) {
  return Math.round(clampStat(value))
}

function computeMood(stats: PetStatsStored, profile: PetProfileStored) {
  let mood = stats.health * 0.45 + stats.satiety * 0.35 + stats.hygiene * 0.2
  if (stats.satiety < 30) mood -= 10
  if (stats.hygiene < 30) mood -= 10
  if (stats.health < 40) mood -= 20

  switch (profile.personality.element) {
    case 'fire':
      mood += stats.satiety >= 60 ? 4 : -2
      break
    case 'earth':
      mood += 3
      break
    case 'air':
      mood += stats.hygiene >= 60 ? 2 : -3
      break
    case 'water':
      mood += Math.min(stats.health, stats.hygiene) < 50 ? -4 : 2
      break
  }

  return roundStat(mood)
}

function resolveMood(stats: PetStatsStored, profile: PetProfileStored) {
  return roundStat(computeMood(stats, profile) + (stats.moodBonus ?? 0))
}

function clampReminderMinutes(value: number) {
  return Math.min(24 * 60, Math.max(1, Math.round(value)))
}

function sanitizeReminderMode(mode: string | undefined): PetReminderMode {
  if (mode === 'interval-once' || mode === 'datetime-once' || mode === 'daily-time') return mode
  return 'interval-repeat'
}

function sanitizeReminderOnceAt(value: string | undefined) {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return ''
  const timestamp = Date.parse(trimmed)
  if (Number.isNaN(timestamp)) return ''
  return new Date(timestamp).toISOString()
}

function sanitizeReminderDailyTime(value: string | undefined) {
  const source = (value ?? '').trim()
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(source)
  if (!match) return '18:00'
  return `${match[1]}:${match[2]}`
}

function sanitizeReminderText(text: string) {
  const trimmed = text.trim()
  return trimmed || '该喝水啦'
}

function computeNextDailyAt(dailyTime: string, now = Date.now()) {
  const [hourRaw, minuteRaw] = dailyTime.split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return now + 24 * 60_000
  const next = new Date(now)
  next.setSeconds(0, 0)
  next.setHours(hour, minute, 0, 0)
  if (next.getTime() <= now) next.setDate(next.getDate() + 1)
  return next.getTime()
}

function computeReminderNextAt(
  settings: Pick<PetReminderItem, 'mode' | 'minutes' | 'onceAt' | 'dailyTime'>,
  now = Date.now(),
) {
  if (settings.mode === 'interval-repeat' || settings.mode === 'interval-once') {
    return now + clampReminderMinutes(settings.minutes) * 60_000
  }
  if (settings.mode === 'daily-time') {
    return computeNextDailyAt(settings.dailyTime, now)
  }
  const parsed = Date.parse(settings.onceAt)
  return Number.isNaN(parsed) ? now + 5 * 60_000 : parsed
}

function generateReminderId() {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function hasLegacyReminder(settings: PetSettings) {
  return (
    settings.reminderEnabled !== undefined ||
    settings.reminderMode !== undefined ||
    settings.reminderMinutes !== undefined ||
    settings.reminderOnceAt !== undefined ||
    settings.reminderDailyTime !== undefined ||
    settings.reminderText !== undefined ||
    settings.reminderRequireConfirm !== undefined ||
    settings.reminderNextAt !== undefined ||
    settings.reminderPendingText !== undefined ||
    settings.reminderPendingSince !== undefined
  )
}

function legacyToStored(settings: PetSettings): PetReminderStored {
  return {
    id: generateReminderId(),
    enabled: settings.reminderEnabled !== false,
    mode: sanitizeReminderMode(settings.reminderMode),
    minutes: clampReminderMinutes(settings.reminderMinutes ?? 10),
    onceAt: sanitizeReminderOnceAt(settings.reminderOnceAt) || undefined,
    dailyTime: sanitizeReminderDailyTime(settings.reminderDailyTime),
    text: sanitizeReminderText(settings.reminderText ?? '该喝水啦'),
    requireConfirm: settings.reminderRequireConfirm !== false,
    nextAt: settings.reminderNextAt,
    pendingText: settings.reminderPendingText,
    pendingSince: settings.reminderPendingSince,
  }
}

function normalizeReminderItem(raw: PetReminderStored): PetReminderItem {
  const mode = sanitizeReminderMode(raw.mode)
  const minutes = clampReminderMinutes(raw.minutes ?? 10)
  const onceAt = sanitizeReminderOnceAt(raw.onceAt)
  const dailyTime = sanitizeReminderDailyTime(raw.dailyTime)
  const text = sanitizeReminderText(raw.text ?? '该喝水啦')
  const requireConfirm = raw.requireConfirm !== false
  const nextAt = typeof raw.nextAt === 'number' ? raw.nextAt : null
  const pendingText = raw.pendingText?.trim() ? raw.pendingText : null
  const pendingSince = typeof raw.pendingSince === 'number' ? raw.pendingSince : null
  return {
    id: raw.id,
    enabled: raw.enabled !== false,
    mode,
    minutes,
    onceAt,
    dailyTime,
    text,
    requireConfirm,
    nextAt,
    pendingText,
    pendingSince,
  }
}

function getStoredReminders(settings = readSettings()): PetReminderStored[] {
  if (settings.reminders?.length) return settings.reminders
  if (hasLegacyReminder(settings)) return [legacyToStored(settings)]
  return []
}

function getReminderItems(settings = readSettings()): PetReminderItem[] {
  return getStoredReminders(settings).map(normalizeReminderItem)
}

function findPendingReminder(reminders: PetReminderItem[], settings = readSettings()) {
  const activeId = settings.activeChatReminderId
  if (activeId) {
    const active = reminders.find((item) => item.id === activeId)
    if (active?.pendingText && active.requireConfirm) return active
  }
  return reminders.find((item) => item.pendingText && item.requireConfirm) ?? null
}

function persistReminders(reminders: PetReminderStored[], extra: Partial<PetSettings> = {}) {
  writeSettings({ reminders, ...extra })
}

function updateStoredReminder(id: string, patch: Partial<PetReminderStored>) {
  const reminders = getStoredReminders()
  const index = reminders.findIndex((item) => item.id === id)
  if (index < 0) return reminders
  reminders[index] = { ...reminders[index], ...patch }
  persistReminders(reminders)
  return reminders
}

function migrateRemindersIfNeeded() {
  const settings = readSettings()
  if (settings.reminders?.length) return
  if (!hasLegacyReminder(settings)) return
  persistReminders([legacyToStored(settings)])
}

function clampSize(value: number) {
  const rounded = Math.round(value / 8) * 8
  return Math.min(PET_SIZE_MAX, Math.max(PET_SIZE_MIN, rounded))
}

export function getPetSize() {
  return clampSize(readSettings().size ?? PET_SIZE_DEFAULT)
}

export function getPetStatus(): PetStatus {
  const settings = ensurePetData()
  const stats = getPetStats(settings)
  const profile = getPetProfile(settings)
  return {
    enabled: Boolean(settings.enabled),
    autoWalk: settings.autoWalk !== false,
    size: getPetSize(),
    characterId: getPetCharacter(settings.characterId)?.id ?? '',
    satiety: roundStat(stats.satiety),
    hygiene: roundStat(stats.hygiene),
    health: roundStat(stats.health),
    mood: resolveMood(stats, profile),
    profile,
  }
}

function notifyStatusChanged(status = getPetStatus()) {
  getMainWindow()?.webContents.send('pet:status-changed', status)
  if (petWin && !petWin.isDestroyed()) {
    petWin.webContents.send('pet:status-changed', status)
  }
}

function notifyRemindersUpdated(reminders = getReminderItems()) {
  getMainWindow()?.webContents.send('pet:reminders-updated', reminders)
}

function emitPetChatMessage(message: PetChatMessage) {
  if (petWin && !petWin.isDestroyed()) {
    petWin.webContents.send('pet:chat-message', message)
  }
}

function emitPetChatClear() {
  if (petWin && !petWin.isDestroyed()) {
    petWin.webContents.send('pet:chat-clear')
  }
}

function stopActiveChatTimer() {
  if (activeChatTimer) {
    clearTimeout(activeChatTimer)
    activeChatTimer = null
  }
}

function flushNextChatInQueue() {
  if (activeChatMessage || !chatQueue.length) return
  const next = chatQueue.shift()
  if (!next) return
  activeChatMessage = next
  if (next.requireConfirm && !isProactiveReminderId(next.reminderId)) {
    writeSettings({ activeChatReminderId: next.reminderId })
  }
  emitPetChatMessage(next)
  if (!next.requireConfirm && next.dismissAfterMs) {
    activeChatTimer = setTimeout(() => {
      stopActiveChatTimer()
      emitPetChatClear()
      activeChatMessage = null
      flushNextChatInQueue()
    }, next.dismissAfterMs)
  }
}

function enqueueChatMessage(message: PetChatMessage) {
  chatQueue.push(message)
  flushNextChatInQueue()
}

function removeQueuedReminder(reminderId: string) {
  chatQueue = chatQueue.filter((item) => item.reminderId !== reminderId)
}

function upsertReminder(
  request: {
    id?: string
    enabled: boolean
    mode: PetReminderMode
    minutes: number
    onceAt: string
    dailyTime: string
    text: string
    requireConfirm: boolean
  },
) {
  const reminders = getStoredReminders()
  const mode = sanitizeReminderMode(request.mode)
  const minutes = clampReminderMinutes(request.minutes)
  const onceAt = sanitizeReminderOnceAt(request.onceAt)
  const dailyTime = sanitizeReminderDailyTime(request.dailyTime)
  const text = sanitizeReminderText(request.text)
  const requireConfirm = Boolean(request.requireConfirm)
  const enabled = Boolean(request.enabled)
  const now = Date.now()

  const existingIndex = request.id ? reminders.findIndex((item) => item.id === request.id) : -1
  if (existingIndex >= 0) {
    const existing = reminders[existingIndex]
    const next: PetReminderStored = {
      ...existing,
      enabled,
      mode,
      minutes,
      onceAt: onceAt || undefined,
      dailyTime,
      text,
      requireConfirm,
      pendingText: undefined,
      pendingSince: undefined,
      nextAt: enabled
        ? computeReminderNextAt({ mode, minutes, onceAt, dailyTime }, now)
        : undefined,
    }
    reminders[existingIndex] = next
  } else {
    reminders.push({
      id: generateReminderId(),
      enabled,
      mode,
      minutes,
      onceAt: onceAt || undefined,
      dailyTime,
      text,
      requireConfirm,
      nextAt: enabled
        ? computeReminderNextAt({ mode, minutes, onceAt, dailyTime }, now)
        : undefined,
    })
  }

  persistReminders(reminders)
  const items = getReminderItems()
  notifyRemindersUpdated(items)
  return items
}

function deleteReminder(id: string) {
  const settings = readSettings()
  const reminders = getStoredReminders().filter((item) => item.id !== id)
  const extra: Partial<PetSettings> = {}
  removeQueuedReminder(id)
  if (settings.activeChatReminderId === id || activeChatMessage?.reminderId === id) {
    stopActiveChatTimer()
    activeChatMessage = null
    extra.activeChatReminderId = undefined
    emitPetChatClear()
    flushNextChatInQueue()
  }
  persistReminders(reminders, extra)
  const items = getReminderItems()
  notifyRemindersUpdated(items)
  return items
}

function fireReminder(reminder: PetReminderItem, now: number) {
  const message: PetChatMessage = {
    reminderId: reminder.id,
    text: reminder.text,
    requireConfirm: reminder.requireConfirm,
    dismissAfterMs: reminder.requireConfirm ? null : 10_000,
  }
  enqueueChatMessage(message)

  const oneShot = reminder.mode === 'interval-once' || reminder.mode === 'datetime-once'
  if (reminder.requireConfirm) {
    updateStoredReminder(reminder.id, {
      pendingText: reminder.text,
      pendingSince: now,
      nextAt: undefined,
    })
  } else {
    updateStoredReminder(reminder.id, {
      pendingText: undefined,
      pendingSince: undefined,
      enabled: oneShot ? false : reminder.enabled,
      nextAt: oneShot ? undefined : computeReminderNextAt(reminder, now),
    })
  }
  notifyRemindersUpdated()
}

function confirmReminder(reminderId?: string) {
  const settings = readSettings()
  const reminders = getReminderItems(settings)
  const pending = findPendingReminder(reminders, settings)
  const id = reminderId ?? settings.activeChatReminderId ?? pending?.id
  if (!id) return reminders

  const reminder = reminders.find((item) => item.id === id)
  if (!reminder?.pendingText) return reminders

  const oneShot = reminder.mode === 'interval-once' || reminder.mode === 'datetime-once'
  updateStoredReminder(id, {
    pendingText: undefined,
    pendingSince: undefined,
    enabled: oneShot ? false : reminder.enabled,
    nextAt: oneShot ? undefined : computeReminderNextAt(reminder, Date.now()),
  })

  const stillPending = getReminderItems().find(
    (item) => item.id !== id && item.pendingText && item.requireConfirm,
  )
  writeSettings({
    activeChatReminderId: stillPending?.id,
  })
  removeQueuedReminder(id)
  stopActiveChatTimer()
  activeChatMessage = null
  emitPetChatClear()

  if (stillPending) {
    enqueueChatMessage({
      reminderId: stillPending.id,
      text: stillPending.pendingText!,
      requireConfirm: true,
      dismissAfterMs: null,
    })
  }
  flushNextChatInQueue()

  const items = getReminderItems()
  notifyRemindersUpdated(items)
  return items
}

function tickReminder() {
  const settings = readSettings()
  const reminders = getReminderItems(settings)
  if (!reminders.length) return

  const blocking = findPendingReminder(reminders, settings)
  if (blocking) return

  const now = Date.now()
  for (const reminder of reminders) {
    if (!reminder.enabled) continue
    if (reminder.pendingText && reminder.requireConfirm) continue

    const nextAt = reminder.nextAt
    if (!nextAt || nextAt <= 0) {
      updateStoredReminder(reminder.id, {
        nextAt: computeReminderNextAt(reminder, now),
      })
      notifyRemindersUpdated()
      continue
    }
    if (now < nextAt) continue

    fireReminder(reminder, now)
    break
  }
}

function applyVitals(
  patch: Partial<PetStatsStored> & Partial<Pick<PetSettings, 'autoWalk' | 'lastVitalAt'>>,
) {
  const settings = ensurePetData()
  const current = getPetStats(settings)
  const stats: PetStatsStored = {
    satiety: clampStat(patch.satiety ?? current.satiety),
    hygiene: clampStat(patch.hygiene ?? current.hygiene),
    health: clampStat(patch.health ?? current.health),
    moodBonus: clampStat(patch.moodBonus ?? current.moodBonus ?? 0),
  }
  const next: Partial<PetSettings> = { stats }
  if (patch.autoWalk !== undefined) next.autoWalk = patch.autoWalk
  if (patch.lastVitalAt !== undefined) next.lastVitalAt = patch.lastVitalAt
  writeSettings(next)
  const status = getPetStatus()
  notifyStatusChanged(status)
  return status
}

/** 记录玩家互动，并清掉「寂寞」latch */
export function markPetInteracted(extraLatches?: ProactiveLatches) {
  const settings = ensurePetData()
  const latches: ProactiveLatches = { ...(settings.proactiveLatches ?? {}) }
  delete latches.lonely
  if (extraLatches) {
    for (const key of Object.keys(extraLatches) as Array<keyof ProactiveLatches>) {
      if (extraLatches[key] === false) delete latches[key]
    }
  }
  writeSettings({
    lastInteractAt: Date.now(),
    proactiveLatches: latches,
  })
}

function tickProactiveChat() {
  if (!isPetOpen()) return
  const now = Date.now()
  if (now - lastProactiveCheckAt < PROACTIVE_CHECK_INTERVAL_MS) return
  lastProactiveCheckAt = now

  // 有待确认提醒或当前气泡时不插队
  if (activeChatMessage?.requireConfirm) return
  if (activeChatMessage || chatQueue.length > 0) return
  if (proactiveSpeechBusy) return

  const settings = ensurePetData()
  if (!settings.enabled) return

  const idleSeconds = powerMonitor.getSystemIdleTime()
  const work = advanceWorkSession(workSessionState, idleSeconds, now)
  workSessionState = work.state

  const stats = getPetStats(settings)
  const profile = getPetProfile(settings)
  const decision = decideProactiveChat({
    satiety: stats.satiety,
    hygiene: stats.hygiene,
    health: stats.health,
    mood: resolveMood(stats, profile),
    lastInteractAt: settings.lastInteractAt ?? now,
    lastProactiveAt: settings.lastProactiveAt,
    latches: settings.proactiveLatches ?? {},
    continuousWorkMs: work.continuousWorkMs,
    element: profile.personality.element,
    now,
  })

  // 休息打断或重启后不在工作段时，清掉 working_long latch（即使本轮不说话）
  if (!decision) {
    if (settings.proactiveLatches?.working_long && work.continuousWorkMs <= 0) {
      const latches = { ...(settings.proactiveLatches ?? {}) }
      delete latches.working_long
      writeSettings({ proactiveLatches: latches })
    }
    return
  }

  // 先落盘冷却/latch，避免 LLM 等待期间重复触发
  writeSettings({
    lastProactiveAt: now,
    proactiveLatches: decision.latches,
  })

  const deliver = (text: string) => {
    enqueueChatMessage({
      reminderId: proactiveReminderId(decision.kind),
      text,
      requireConfirm: false,
      dismissAfterMs: decision.kind === 'sing' ? 12_000 : 8_000,
      animation: decision.animation,
    })
  }

  if (!isProactiveAiEnabled()) {
    deliver(decision.text)
    return
  }

  proactiveSpeechBusy = true
  void generateSituationalLine(decision.kind, decision.text)
    .then((text) => {
      if (!isPetOpen()) return
      deliver(text)
    })
    .finally(() => {
      proactiveSpeechBusy = false
    })
}

function tickVitals() {
  const settings = ensurePetData()
  if (!settings.enabled) return getPetStatus()

  const now = Date.now()
  const last = settings.lastVitalAt ?? now
  const elapsedHours = (now - last) / 3_600_000
  if (elapsedHours <= 0) return getPetStatus()

  const stats = getPetStats(settings)
  const rates = getPersonalityDecayRates(getPetProfile(settings).personality)
  const satiety = clampStat(stats.satiety - rates.satiety * elapsedHours)
  const hygiene = clampStat(stats.hygiene - rates.hygiene * elapsedHours)
  const moodBonus = clampStat((stats.moodBonus ?? 0) - rates.moodBonus * elapsedHours)
  let health = stats.health
  let healthDropPerHour = 0

  if (satiety < 20) healthDropPerHour += 1
  if (hygiene < 20) healthDropPerHour += 1
  if (satiety <= 0) healthDropPerHour += 2
  if (hygiene <= 0) healthDropPerHour += 2

  if (healthDropPerHour > 0) {
    health = clampStat(health - healthDropPerHour * rates.healthPenalty * elapsedHours)
  }

  // 每秒 tick 会算出极小浮点变化；展示值未变时不要每秒写盘 + 广播，避免长时间运行拖垮
  const displayChanged =
    roundStat(satiety) !== roundStat(stats.satiety) ||
    roundStat(hygiene) !== roundStat(stats.hygiene) ||
    roundStat(health) !== roundStat(stats.health) ||
    roundStat(moodBonus) !== roundStat(stats.moodBonus ?? 0)
  if (!displayChanged && now - last < VITALS_FLUSH_MS) {
    return getPetStatus()
  }

  return applyVitals({ satiety, hygiene, health, moodBonus, lastVitalAt: now })
}

function notifyEnabled(enabled: boolean) {
  getMainWindow()?.webContents.send('pet:enabled-changed', enabled)
  petEnabledListeners.forEach((listener) => {
    try {
      listener(enabled)
    } catch (error) {
      console.error('[pet] enabled listener failed', error)
    }
  })
}

const petEnabledListeners = new Set<(enabled: boolean) => void>()

export function onPetEnabledChange(listener: (enabled: boolean) => void) {
  petEnabledListeners.add(listener)
  return () => {
    petEnabledListeners.delete(listener)
  }
}

function notifySkinChanged() {
  const view = loadSkinView(readSkinConfig(readSettings()))
  if (petWin && !petWin.isDestroyed()) {
    petWin.webContents.send('pet:skin-changed', view)
  }
}

function getPetWindowSize() {
  if (petWin && !petWin.isDestroyed()) {
    return petWin.getSize()[0]
  }
  return getPetSize()
}

function getPetWindowExtent() {
  if (petWin && !petWin.isDestroyed()) {
    const [width, height] = petWin.getSize()
    return { width, height }
  }
  const size = getPetSize()
  return { width: size, height: size }
}

function clampToWorkArea(x: number, y: number, width = getPetWindowSize(), height = width) {
  const display = screen.getDisplayNearestPoint({ x, y })
  const area = display.workArea
  const maxX = area.x + area.width - width
  const maxY = area.y + area.height - height
  return {
    x: Math.round(Math.min(Math.max(x, area.x), Math.max(area.x, maxX))),
    y: Math.round(Math.min(Math.max(y, area.y), Math.max(area.y, maxY))),
  }
}

/** 仅调整实际窗口/画布，不改用户设定的 idle 体型 size */
function applyPetViewport(
  rawWidth: number,
  rawHeight = rawWidth,
  anchor: PetViewportAnchor = 'bottom-center',
) {
  if (!petWin || petWin.isDestroyed()) return getPetWindowExtent()
  const prev = getPetWindowExtent()
  const minSide = getPetSize()
  const width = Math.max(minSide, Math.round(rawWidth))
  const height = Math.max(minSide, Math.round(rawHeight))
  if (width === prev.width && height === prev.height) return prev
  const [x, y] = petWin.getPosition()
  const deltaW = width - prev.width
  const deltaH = height - prev.height
  let nextX = x
  if (anchor === 'bottom-center') nextX = x - Math.round(deltaW / 2)
  else if (anchor === 'bottom-right') nextX = x - deltaW
  const nextY = y - deltaH
  const next = clampToWorkArea(Math.round(nextX), Math.round(nextY), width, height)
  petWin.setBounds({ x: next.x, y: next.y, width, height })
  writeSettings({ x: next.x, y: next.y })
  setTimeout(refreshPetWinTransparency, 0)
  return { width, height }
}

/**
 * 只持久化用户设定的 idle 体型；真实窗口尺寸由渲染进程 fitSpineToView → setPetViewport 决定。
 * 若这里先缩成 contentSize，而 canvas 仍按更大 view 把角色锚在底部，宠物会被裁出窗外。
 */
function applyPetSize(raw: number) {
  const size = clampSize(raw)
  writeSettings({ size })
  if (petWin && !petWin.isDestroyed()) {
    const current = getPetWindowSize()
    // 变大时先撑开窗口，避免新体型还没 fit 完就被旧窗裁切
    if (current < size) {
      applyPetViewport(size)
    }
  }
  const status = getPetStatus()
  notifyStatusChanged(status)
  return status
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

function persistPosition() {
  if (!petWin || petWin.isDestroyed()) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    if (!petWin || petWin.isDestroyed()) return
    const [x, y] = petWin.getPosition()
    writeSettings({ x, y, enabled: true })
  }, 250)
}

function navigateMainWindow(
  main: BrowserWindow,
  pageId: AppPageId,
  prefill?: { input: string },
) {
  const send = () => {
    if (main.isDestroyed()) return
    main.webContents.send('main:navigate', pageId)
    if (prefill?.input) {
      main.webContents.send('tool:prefill', { pageId, input: prefill.input })
    }
  }
  if (main.webContents.isLoadingMainFrame()) {
    main.webContents.once('did-finish-load', send)
    return
  }
  send()
}

export function showMainWindow(
  pageId: AppPageId = APP_HOME_PAGE,
  prefill?: { input: string },
) {
  let main = getMainWindow()
  if (!main || main.isDestroyed()) {
    main = ensureMainWindow()
  }
  if (!main || main.isDestroyed()) return
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
  navigateMainWindow(main, pageId, prefill)
}

function openMainPage(pageId: AppPageId) {
  showMainWindow(pageId)
}

function emitCareReact(kind: CareKind) {
  if (!petWin || petWin.isDestroyed()) return
  const fallback = pickCareLine(kind)
  const send = (text: string) => {
    if (!petWin || petWin.isDestroyed()) return
    const payload: PetCareReactPayload = {
      kind,
      text,
      animation: 'victory',
    }
    petWin.webContents.send('pet:care-react', payload)
  }

  if (!isProactiveAiEnabled()) {
    send(fallback)
    return
  }

  void generateSituationalLine(kind, fallback).then(send)
}

function feedPetAction() {
  const stats = getPetStats()
  const status = applyVitals({ satiety: clampStat(stats.satiety + 35) })
  rememberCareEvent(status.profile.id, 'feed')
  markPetInteracted({ hungry: false })
  emitCareReact('feed')
  return status
}

function cleanPetAction() {
  const stats = getPetStats()
  const status = applyVitals({ hygiene: clampStat(stats.hygiene + 35) })
  rememberCareEvent(status.profile.id, 'clean')
  markPetInteracted({ dirty: false })
  emitCareReact('clean')
  return status
}

function restPetAction() {
  const stats = getPetStats()
  const status = applyVitals({ health: clampStat(stats.health + 25) })
  rememberCareEvent(status.profile.id, 'rest')
  markPetInteracted({ weak: false })
  return status
}

function applyPlayVitals() {
  const stats = getPetStats()
  const status = applyVitals({
    satiety: clampStat(stats.satiety - PLAY_SATIETY_COST),
    hygiene: clampStat(stats.hygiene - PLAY_HYGIENE_COST),
    moodBonus: clampStat((stats.moodBonus ?? 0) + PLAY_MOOD_GAIN),
  })
  markPetInteracted()
  return status
}

function emitPetMinigame(event: PetMinigameEvent) {
  if (petWin && !petWin.isDestroyed()) {
    petWin.webContents.send('pet:minigame', event)
  }
}

function startPetMinigame(id: 'ball-hit' | 'heart-rally') {
  if (!isPetOpen()) createPetWindow()
  if (activeMinigameId) return
  applyPlayVitals()
  activeMinigameId = id
  emitPetMinigame({ action: 'start', id })
}

function stopPetMinigame() {
  if (!activeMinigameId) return
  activeMinigameId = null
  emitPetMinigame({ action: 'stop' })
}

function buildPetMenu() {
  const reminders = getReminderItems()
  const pending = findPendingReminder(reminders)
  const ballHitActive = activeMinigameId === 'ball-hit'
  const heartRallyActive = activeMinigameId === 'heart-rally'
  const anyMinigameActive = Boolean(activeMinigameId)
  return Menu.buildFromTemplate([
    { label: '宠物设置', click: () => openMainPage(APP_HOME_PAGE) },
    { label: '与我对话', click: () => openMainPage('pet-chat-page') },
    // 家园入口暂隐，页面代码保留：openMainPage('pet-home-page')
    { type: 'separator' },
    {
      label: '喂食',
      click: () => {
        feedPetAction()
      },
    },
    {
      label: '清洁',
      click: () => {
        cleanPetAction()
      },
    },
    {
      label: '休息',
      click: () => {
        restPetAction()
      },
    },
    ...(pending
      ? [
          { type: 'separator' as const },
          { label: '确认提醒', click: () => confirmReminder(pending.id) },
        ]
      : []),
    { type: 'separator' },
    {
      label: '小游戏',
      submenu: [
        {
          label: ballHitActive ? '打小球（进行中）' : '打小球',
          enabled: !anyMinigameActive,
          click: () => startPetMinigame('ball-hit'),
        },
        {
          label: heartRallyActive ? '弹爱心（进行中）' : '弹爱心',
          enabled: !anyMinigameActive,
          click: () => startPetMinigame('heart-rally'),
        },
      ],
    },
    { label: '农场', click: () => openMainPage('farm-page') },
    {
      label: '工具箱',
      submenu: PET_TOOL_MENU.map((item) => ({
        label: item.label,
        click: () => openMainPage(item.id),
      })),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit(),
    },
  ])
}

export function closePetWindow(saveEnabled = false) {
  if (saveEnabled) writeSettings({ enabled: false })
  stopActiveChatTimer()
  activeChatMessage = null
  chatQueue = []
  activeMinigameId = null
  if (petWin && !petWin.isDestroyed()) {
    petWin.close()
  }
  petWin = null
}

export function isPetOpen() {
  return Boolean(petWin && !petWin.isDestroyed())
}

export function getPetEnabled() {
  return readSettings().enabled
}

function petIndexUrl() {
  const devUrl = process.env['VITE_DEV_SERVER_URL']
  if (devUrl) return new URL('pet.html', devUrl).toString()
  return path.join(process.env.DIST!, 'pet.html')
}

/** Windows + Electron 35.5+：透明无边框窗失焦/改尺寸后可能画出伪标题或整窗变空白，轻微改尺寸强制重绘 */
function refreshPetWinTransparency() {
  if (process.platform !== 'win32' || !petWin || petWin.isDestroyed()) return
  const bounds = petWin.getBounds()
  petWin.setBounds({ ...bounds, height: bounds.height + 1 })
  petWin.setBounds(bounds)
}

export function createPetWindow() {
  if (isPetOpen()) {
    petWin!.show()
    return petWin
  }

  const settings = readSettings()
  const size = getPetSize()
  const cursor = screen.getCursorScreenPoint()
  const fallback = clampToWorkArea(cursor.x - size / 2, cursor.y - size / 2, size)
  const start = clampToWorkArea(settings.x ?? fallback.x, settings.y ?? fallback.y, size)

  petWin = new BrowserWindow({
    x: start.x,
    y: start.y,
    width: size,
    height: size,
    title: '',
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    show: false,
    backgroundColor: '#00000000',
    // Windows 11：圆角非客户区容易留下白条
    ...(process.platform === 'win32' ? { roundedCorners: false } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  petWin.setTitle('')
  petWin.setMenu(null)

  petWin.setAlwaysOnTop(true, 'screen-saver')
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  petWin.setIgnoreMouseEvents(false)

  if (process.env['VITE_DEV_SERVER_URL']) {
    petWin.loadURL(petIndexUrl())
  } else {
    petWin.loadFile(petIndexUrl())
  }

  petWin.once('ready-to-show', () => {
    petWin?.showInactive()
    setTimeout(refreshPetWinTransparency, 30)
  })
  petWin.once('ready-to-show', () => {
    stopActiveChatTimer()
    activeChatMessage = null
    chatQueue = []
    const pending = findPendingReminder(getReminderItems())
    if (pending?.pendingText) {
      enqueueChatMessage({
        reminderId: pending.id,
        text: pending.pendingText,
        requireConfirm: true,
        dismissAfterMs: null,
      })
      flushNextChatInQueue()
    }
  })
  petWin.on('blur', refreshPetWinTransparency)
  petWin.on('focus', refreshPetWinTransparency)
  petWin.on('moved', persistPosition)
  petWin.webContents.on('render-process-gone', (_event, details) => {
    appendPetCrashLog('render-process-gone', details)
    if (details.reason === 'clean-exit') return
    schedulePetCrashRecover(details.reason)
  })
  petWin.webContents.on('unresponsive', () => {
    appendPetCrashLog('unresponsive', { at: Date.now() })
  })
  petWin.on('closed', () => {
    petWin = null
  })

  writeSettings({ enabled: true, x: start.x, y: start.y })
  notifyEnabled(true)
  notifyStatusChanged()
  return petWin
}

export function setPetEnabled(enabled: boolean) {
  if (enabled) {
    createPetWindow()
    return
  }
  closePetWindow(true)
  notifyEnabled(false)
  notifyStatusChanged()
}

export function restorePetIfNeeded() {
  if (readSettings().enabled !== false) createPetWindow()
}

export function registerPetIpc(
  getMain: () => BrowserWindow | null,
  ensureMain: () => BrowserWindow | null = getMain,
) {
  getMainWindow = getMain
  ensureMainWindow = ensureMain
  if (ipcRegistered) return
  ipcRegistered = true
  const skin = readSkinConfig(readSettings())
  pruneLegacyClipFiles()
  writeSettings({ skin })

  ipcMain.handle('pet:get-enabled', () => getPetEnabled())
  ipcMain.handle('pet:set-enabled', (_event, enabled: boolean) => {
    setPetEnabled(Boolean(enabled))
    return getPetEnabled()
  })
  ipcMain.handle('pet:get-bounds', (): PetBounds | null => {
    if (!isPetOpen()) return null
    const bounds = petWin!.getBounds()
    const { workArea } = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y })
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      workArea,
    }
  })
  ipcMain.handle(
    'pet:set-viewport',
    (
      _event,
      size: number | { width: number; height: number },
      anchor?: PetViewportAnchor,
    ) => {
      const valid: PetViewportAnchor[] = ['bottom-center', 'bottom-left', 'bottom-right']
      const nextAnchor = valid.includes(anchor as PetViewportAnchor)
        ? (anchor as PetViewportAnchor)
        : 'bottom-center'
      if (typeof size === 'number') {
        return applyPetViewport(Number(size), Number(size), nextAnchor)
      }
      return applyPetViewport(Number(size?.width), Number(size?.height), nextAnchor)
    },
  )
  ipcMain.handle('pet:set-position', (_event, x: number, y: number) => {
    if (!isPetOpen()) return null
    const extent = getPetWindowExtent()
    const next = clampToWorkArea(Math.round(x), Math.round(y), extent.width, extent.height)
    petWin!.setBounds({
      x: next.x,
      y: next.y,
      width: extent.width,
      height: extent.height,
    })
    const applied = petWin!.getBounds()
    return { x: applied.x, y: applied.y }
  })
  ipcMain.handle('pet:ignore-mouse', (_event, ignore: boolean) => {
    if (!isPetOpen()) return
    petWin!.setIgnoreMouseEvents(Boolean(ignore), { forward: true })
  })
  ipcMain.handle('pet:show-main', (_event, pageId?: AppPageId) => {
    showMainWindow(pageId ?? APP_HOME_PAGE)
  })
  ipcMain.handle('pet:popup-menu', () => {
    if (!isPetOpen()) return
    buildPetMenu().popup({ window: petWin! })
  })
  ipcMain.handle('pet:minigame-ended', () => {
    activeMinigameId = null
  })
  ipcMain.handle('pet:get-status', () => getPetStatus())
  ipcMain.handle('pet:set-auto-walk', (_event, autoWalk: boolean) => {
    return applyVitals({ autoWalk: Boolean(autoWalk) })
  })
  ipcMain.handle('pet:set-size', (_event, size: number) => {
    return applyPetSize(Number(size))
  })
  ipcMain.handle('pet:list-characters', () => listPetCharacters())
  ipcMain.handle('pet:set-character', (_event, characterId: string) => {
    const selected = getPetCharacter(String(characterId))
    if (!selected) return getPetStatus()
    writeSettings({ characterId: selected.id })
    const status = getPetStatus()
    notifyStatusChanged(status)
    return status
  })
  ipcMain.handle('pet:feed', () => feedPetAction())
  ipcMain.handle('pet:clean', () => cleanPetAction())
  ipcMain.handle('pet:rest', () => restPetAction())
  ipcMain.handle('pet:get-profile', () => getPetProfile())
  ipcMain.handle('pet:update-profile', (_event, patch: { name?: string }) => {
    const settings = ensurePetData()
    const profile = getPetProfile(settings)
    const name = patch.name?.trim()
    if (!name || name === profile.name) return getPetStatus()
    writeSettings({
      profile: {
        ...profile,
        name,
      },
    })
    rememberRename(profile.id, name)
    markPetInteracted()
    const status = getPetStatus()
    notifyStatusChanged(status)
    return status
  })
  migrateRemindersIfNeeded()
  ensurePetData()
  ipcMain.handle('pet:get-reminders', () => getReminderItems())
  ipcMain.handle(
    'pet:upsert-reminder',
    (
      _event,
      request: {
        id?: string
        enabled: boolean
        mode: PetReminderMode
        minutes: number
        onceAt: string
        dailyTime: string
        text: string
        requireConfirm: boolean
      },
    ) =>
      upsertReminder({
        id: request.id ? String(request.id) : undefined,
        enabled: Boolean(request.enabled),
        mode: sanitizeReminderMode(request.mode),
        minutes: Number(request.minutes),
        onceAt: String(request.onceAt ?? ''),
        dailyTime: String(request.dailyTime ?? ''),
        text: String(request.text ?? ''),
        requireConfirm: Boolean(request.requireConfirm),
      }),
  )
  ipcMain.handle('pet:delete-reminder', (_event, id: string) => deleteReminder(String(id)))
  ipcMain.handle('pet:confirm-reminder', (_event, reminderId?: string) =>
    confirmReminder(reminderId ? String(reminderId) : undefined),
  )
  ipcMain.handle('pet:get-skin', () => loadSkinView(readSkinConfig(readSettings())))
  ipcMain.handle('pet:save-clip', async (_event, request: SavePetClipRequest) => {
    const clip = await savePetClip(request)
    const skin = readSkinConfig(readSettings())
    writeSettings({
      skin: {
        clips: {
          ...skin.clips,
          [request.key]: {
            fileName: clip.fileName,
            originalName: clip.originalName,
            frames: clip.frames,
            fps: clip.fps,
            layout: clip.layout,
            facing: clip.facing,
            width: clip.width,
            height: clip.height,
          },
        },
      },
    })
    notifySkinChanged()
    return clip
  })
  ipcMain.handle('pet:update-clip', (_event, request: UpdatePetClipRequest) => {
    const skin = updatePetClip(readSkinConfig(readSettings()), request)
    writeSettings({ skin })
    notifySkinChanged()
    return loadSkinView(skin)
  })
  ipcMain.handle('pet:remove-clip', (_event, key: PetClipKey) => {
    const skin = removePetClip(readSkinConfig(readSettings()), key)
    writeSettings({ skin })
    notifySkinChanged()
    return loadSkinView(skin)
  })
  ipcMain.handle('pet:reset-skin', () => {
    const skin = resetPetSkin(readSkinConfig(readSettings()))
    writeSettings({ skin })
    notifySkinChanged()
    return loadSkinView(skin)
  })

  if (!reminderTimer) {
    reminderTimer = setInterval(() => {
      tickVitals()
      tickReminder()
      tickProactiveChat()
    }, 1_000)
  }

  registerPetAiIpc(() => petWin, showMainWindow)
}
