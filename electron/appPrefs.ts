import { app, ipcMain, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

type AppPrefs = {
  openAtLogin?: boolean
}

const openAtLoginListeners = new Set<(enabled: boolean) => void>()

function prefsFile() {
  return path.join(app.getPath('userData'), 'app-prefs.json')
}

function readPrefs(): AppPrefs {
  try {
    return JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) as AppPrefs
  } catch {
    return {}
  }
}

function writePrefs(patch: Partial<AppPrefs>) {
  const next = { ...readPrefs(), ...patch }
  fs.mkdirSync(path.dirname(prefsFile()), { recursive: true })
  fs.writeFileSync(prefsFile(), JSON.stringify(next, null, 2))
  return next
}

export function getOpenAtLogin(): boolean {
  try {
    return Boolean(app.getLoginItemSettings().openAtLogin)
  } catch {
    return Boolean(readPrefs().openAtLogin)
  }
}

export function setOpenAtLogin(enabled: boolean): boolean {
  const next = Boolean(enabled)
  writePrefs({ openAtLogin: next })
  try {
    app.setLoginItemSettings({
      openAtLogin: next,
      openAsHidden: true,
    })
  } catch (error) {
    console.error('[app] setLoginItemSettings failed', error)
  }
  const applied = getOpenAtLogin()
  openAtLoginListeners.forEach((listener) => {
    try {
      listener(applied)
    } catch (error) {
      console.error('[app] openAtLogin listener failed', error)
    }
  })
  return applied
}

export function onOpenAtLoginChange(listener: (enabled: boolean) => void) {
  openAtLoginListeners.add(listener)
  return () => {
    openAtLoginListeners.delete(listener)
  }
}

/** 启动时把本地偏好同步到系统登录项（打包后才真正生效） */
export function syncOpenAtLoginFromPrefs() {
  const prefs = readPrefs()
  if (prefs.openAtLogin === undefined) return getOpenAtLogin()
  return setOpenAtLogin(Boolean(prefs.openAtLogin))
}

export function registerAppPrefsIpc(
  getMainWindow: () => BrowserWindow | null,
  onChanged?: (openAtLogin: boolean) => void,
) {
  if (onChanged) onOpenAtLoginChange(onChanged)
  onOpenAtLoginChange((enabled) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('app:open-at-login-changed', enabled)
    }
  })
  ipcMain.handle('app:get-open-at-login', () => getOpenAtLogin())
  ipcMain.handle('app:set-open-at-login', (_event, enabled: boolean) => {
    return setOpenAtLogin(Boolean(enabled))
  })
}
