import { BrowserWindow, Menu, app, ipcMain, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
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
  skin?: PetSkinConfig
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

let petWin: BrowserWindow | null = null
let getMainWindow: () => BrowserWindow | null = () => null
let ipcRegistered = false

function settingsFile() {
  return path.join(app.getPath('userData'), 'pet.json')
}

function readSettings(): PetSettings {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) as PetSettings
  } catch {
    return { enabled: false }
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

export function showMainWindow() {
  const main = getMainWindow()
  if (!main) return
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
}

export function closePetWindow(saveEnabled = false) {
  if (saveEnabled) writeSettings({ enabled: false })
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
  if (readSettings().enabled) createPetWindow()
}

export function registerPetIpc(getMain: () => BrowserWindow | null) {
  getMainWindow = getMain
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
  ipcMain.handle('pet:show-main', () => {
    showMainWindow()
  })
  ipcMain.handle('pet:popup-menu', () => {
    if (!isPetOpen()) return
    const menu = Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => showMainWindow() },
      { type: 'separator' },
      {
        label: '关闭桌宠',
        click: () => setPetEnabled(false),
      },
    ])
    menu.popup({ window: petWin! })
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

  setInterval(() => {
    tickVitals()
  }, 30_000)
}
