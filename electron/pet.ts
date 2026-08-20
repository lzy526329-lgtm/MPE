import { BrowserWindow, Menu, app, ipcMain, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { APP_HOME_PAGE, PET_TOOL_MENU, type AppPageId } from './appPages'
import { getPetCharacter, listPetCharacters } from './petCharacters'
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

export const PET_SIZE_MIN = 96
export const PET_SIZE_MAX = 280
export const PET_SIZE_DEFAULT = 160

type PetSettings = {
  enabled: boolean
  x?: number
  y?: number
  size?: number
  characterId?: string
  autoWalk?: boolean
  health?: number
  hunger?: number
  lastVitalAt?: number
  reminders?: PetReminderStored[]
  activeChatReminderId?: string
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
  health: number
  hunger: number
}

export type PetBounds = {
  x: number
  y: number
  width: number
  height: number
  workArea: { x: number; y: number; width: number; height: number }
}

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
}

let petWin: BrowserWindow | null = null
let getMainWindow: () => BrowserWindow | null = () => null
let ensureMainWindow: () => BrowserWindow | null = () => null
let ipcRegistered = false
let reminderTimer: ReturnType<typeof setInterval> | null = null
let chatQueue: PetChatMessage[] = []
let activeChatMessage: PetChatMessage | null = null
let activeChatTimer: ReturnType<typeof setTimeout> | null = null

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

function writeSettings(patch: Partial<PetSettings>) {
  const next = { ...readSettings(), ...patch }
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2))
}

function clampStat(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)))
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
  const settings = readSettings()
  return {
    enabled: Boolean(settings.enabled),
    autoWalk: settings.autoWalk !== false,
    size: getPetSize(),
    characterId: getPetCharacter(settings.characterId)?.id ?? '',
    health: clampStat(settings.health ?? 100),
    hunger: clampStat(settings.hunger ?? 20),
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
  writeSettings({ activeChatReminderId: next.reminderId })
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

function applyVitals(patch: Partial<Pick<PetSettings, 'health' | 'hunger' | 'autoWalk' | 'lastVitalAt'>>) {
  writeSettings(patch)
  const status = getPetStatus()
  notifyStatusChanged(status)
  return status
}

function tickVitals() {
  const settings = readSettings()
  if (!settings.enabled) return getPetStatus()
  const hunger = clampStat((settings.hunger ?? 20) + 2)
  let health = clampStat(settings.health ?? 100)
  if (hunger >= 70) health = clampStat(health - 1)
  if (hunger >= 95) health = clampStat(health - 2)
  return applyVitals({ hunger, health, lastVitalAt: Date.now() })
}

function notifyEnabled(enabled: boolean) {
  getMainWindow()?.webContents.send('pet:enabled-changed', enabled)
}

function notifySkinChanged() {
  const view = loadSkinView(readSkinConfig(readSettings()))
  if (petWin && !petWin.isDestroyed()) {
    petWin.webContents.send('pet:skin-changed', view)
  }
}

function clampToWorkArea(x: number, y: number, size = getPetSize()) {
  const display = screen.getDisplayNearestPoint({ x, y })
  const area = display.workArea
  return {
    x: Math.min(Math.max(x, area.x), area.x + area.width - size),
    y: Math.min(Math.max(y, area.y), area.y + area.height - size),
  }
}

function applyPetSize(raw: number) {
  const prev = getPetSize()
  const size = clampSize(raw)
  writeSettings({ size })
  if (petWin && !petWin.isDestroyed()) {
    const [x, y] = petWin.getPosition()
    const next = clampToWorkArea(
      Math.round(x + (prev - size) / 2),
      y + (prev - size),
      size,
    )
    petWin.setBounds({ x: next.x, y: next.y, width: size, height: size })
    writeSettings({ x: next.x, y: next.y, size })
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

function navigateMainWindow(main: BrowserWindow, pageId: AppPageId) {
  const send = () => {
    if (main.isDestroyed()) return
    main.webContents.send('main:navigate', pageId)
  }
  if (main.webContents.isLoadingMainFrame()) {
    main.webContents.once('did-finish-load', send)
    return
  }
  send()
}

export function showMainWindow(pageId: AppPageId = APP_HOME_PAGE) {
  let main = getMainWindow()
  if (!main || main.isDestroyed()) {
    main = ensureMainWindow()
  }
  if (!main || main.isDestroyed()) return
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
  navigateMainWindow(main, pageId)
}

function openMainPage(pageId: AppPageId) {
  showMainWindow(pageId)
}

function buildPetMenu() {
  const reminders = getReminderItems()
  const pending = findPendingReminder(reminders)
  return Menu.buildFromTemplate([
    { label: '宠物设置', click: () => openMainPage(APP_HOME_PAGE) },
    { type: 'separator' },
    {
      label: '喂食',
      click: () => {
        const settings = readSettings()
        applyVitals({ hunger: clampStat((settings.hunger ?? 20) - 35) })
      },
    },
    {
      label: '休息',
      click: () => {
        const settings = readSettings()
        applyVitals({ health: clampStat((settings.health ?? 100) + 25) })
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
      label: '工具箱',
      submenu: PET_TOOL_MENU.map((item) => ({
        label: item.label,
        click: () => openMainPage(item.id),
      })),
    },
    { type: 'separator' },
    {
      label: '关闭宠物',
      click: () => setPetEnabled(false),
    },
  ])
}

export function closePetWindow(saveEnabled = false) {
  if (saveEnabled) writeSettings({ enabled: false })
  stopActiveChatTimer()
  activeChatMessage = null
  chatQueue = []
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  petWin.setAlwaysOnTop(true, 'screen-saver')
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  petWin.setIgnoreMouseEvents(false)

  if (process.env['VITE_DEV_SERVER_URL']) {
    petWin.loadURL(petIndexUrl())
  } else {
    petWin.loadFile(petIndexUrl())
  }

  petWin.once('ready-to-show', () => petWin?.showInactive())
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
  petWin.on('moved', persistPosition)
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
    const [x, y] = petWin!.getPosition()
    const { workArea } = screen.getDisplayNearestPoint({ x, y })
    const size = getPetSize()
    return { x, y, width: size, height: size, workArea }
  })
  ipcMain.handle('pet:set-position', (_event, x: number, y: number) => {
    if (!isPetOpen()) return null
    const next = clampToWorkArea(Math.round(x), Math.round(y))
    petWin!.setPosition(next.x, next.y)
    return next
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
  ipcMain.handle('pet:feed', () => {
    const settings = readSettings()
    return applyVitals({ hunger: clampStat((settings.hunger ?? 20) - 35) })
  })
  ipcMain.handle('pet:rest', () => {
    const settings = readSettings()
    return applyVitals({ health: clampStat((settings.health ?? 100) + 25) })
  })
  migrateRemindersIfNeeded()
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
    }, 1_000)
  }
}
