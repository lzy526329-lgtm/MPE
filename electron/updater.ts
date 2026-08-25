import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'dev'

export type UpdateState = {
  status: UpdateStatus
  currentVersion: string
  latestVersion?: string
  releaseName?: string
  releaseNotes?: string
  progress?: number
  error?: string
  packaged: boolean
}

type UpdateCheckResult = {
  updateAvailable: boolean
  currentVersion: string
  latestVersion?: string
  releaseName?: string
  releaseNotes?: string
  packaged: boolean
  message: string
}

let state: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  packaged: app.isPackaged,
}

function broadcast(win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) return
  win.webContents.send('app:update-state', state)
}

function setState(win: BrowserWindow | null, patch: Partial<UpdateState>) {
  state = { ...state, ...patch, currentVersion: app.getVersion(), packaged: app.isPackaged }
  broadcast(win)
}

function notesText(info: UpdateInfo): string | undefined {
  const notes = info.releaseNotes
  if (!notes) return undefined
  if (typeof notes === 'string') return notes
  return notes.map((item) => item.note).filter(Boolean).join('\n')
}

export function registerUpdaterIpc(getMainWindow: () => BrowserWindow | null) {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  // 手动触发的 workflow_dispatch 会打成 pre-release，开发自测时可打开
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    setState(getMainWindow(), { status: 'checking', error: undefined, progress: undefined })
  })

  autoUpdater.on('update-available', (info) => {
    setState(getMainWindow(), {
      status: 'available',
      latestVersion: info.version,
      releaseName: info.releaseName || info.version,
      releaseNotes: notesText(info),
      error: undefined,
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    setState(getMainWindow(), {
      status: 'not-available',
      latestVersion: info.version,
      error: undefined,
      progress: undefined,
    })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setState(getMainWindow(), {
      status: 'downloading',
      progress: Math.round(progress.percent),
      error: undefined,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setState(getMainWindow(), {
      status: 'downloaded',
      latestVersion: info.version,
      releaseName: info.releaseName || info.version,
      releaseNotes: notesText(info),
      progress: 100,
      error: undefined,
    })
  })

  autoUpdater.on('error', (error) => {
    setState(getMainWindow(), {
      status: 'error',
      error: error?.message || String(error),
      progress: undefined,
    })
  })

  ipcMain.handle('app:get-version', (): UpdateState => ({
    ...state,
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
  }))

  ipcMain.handle('app:check-update', async (): Promise<UpdateCheckResult> => {
    if (!app.isPackaged) {
      setState(getMainWindow(), { status: 'dev' })
      return {
        updateAvailable: false,
        currentVersion: app.getVersion(),
        packaged: false,
        message: '开发模式不会检查远程更新，请使用打包后的安装包验证。',
      }
    }

    setState(getMainWindow(), { status: 'checking', error: undefined, progress: undefined })
    try {
      await autoUpdater.checkForUpdates()
      if (state.status === 'available') {
        return {
          updateAvailable: true,
          currentVersion: app.getVersion(),
          latestVersion: state.latestVersion,
          releaseName: state.releaseName,
          releaseNotes: state.releaseNotes,
          packaged: true,
          message: `发现新版本 ${state.latestVersion}`,
        }
      }
      if (state.status === 'error') {
        return {
          updateAvailable: false,
          currentVersion: app.getVersion(),
          packaged: true,
          message: state.error || '检查更新失败',
        }
      }
      return {
        updateAvailable: false,
        currentVersion: app.getVersion(),
        latestVersion: state.latestVersion || app.getVersion(),
        packaged: true,
        message: '当前已是最新版本',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setState(getMainWindow(), { status: 'error', error: message })
      return {
        updateAvailable: false,
        currentVersion: app.getVersion(),
        packaged: true,
        message: `检查更新失败：${message}`,
      }
    }
  })

  ipcMain.handle('app:download-update', async () => {
    if (!app.isPackaged) {
      return { ok: false as const, message: '开发模式无法下载更新' }
    }
    if (state.status !== 'available' && state.status !== 'error') {
      return { ok: false as const, message: '请先检查更新' }
    }
    try {
      setState(getMainWindow(), { status: 'downloading', progress: 0, error: undefined })
      await autoUpdater.downloadUpdate()
      return { ok: true as const, message: '开始下载更新' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setState(getMainWindow(), { status: 'error', error: message })
      return { ok: false as const, message }
    }
  })

  ipcMain.handle('app:install-update', () => {
    if (state.status !== 'downloaded') {
      return { ok: false as const, message: '更新尚未下载完成' }
    }
    // 稍后退出，让 IPC 先返回
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true)
    }, 200)
    return { ok: true as const, message: '正在安装并重启…' }
  })
}
