import { app, BrowserWindow, ipcMain, net, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'

/** GitHub 原始 Release 目录 */
const ORIGIN_FEED_URL =
  'https://github.com/lzy526329-lgtm/MPE/releases/latest/download'

/**
 * 国内优先走镜像，失败再回退官方 GitHub。
 * 镜像格式：https://ghfast.top/https://github.com/...
 */
const UPDATE_FEED_CANDIDATES = [
  `https://ghfast.top/${ORIGIN_FEED_URL}`,
  `https://ghproxy.net/${ORIGIN_FEED_URL}`,
  ORIGIN_FEED_URL,
]

/** 当前选用的 feed（检查/下载成功后记住，减少来回试） */
let activeFeedUrl = UPDATE_FEED_CANDIDATES[0]

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
  /** Mac 未签名包走 DMG，不走 ShipIt 自动替换 */
  installMode: 'auto' | 'dmg'
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

const installMode: UpdateState['installMode'] = process.platform === 'darwin' ? 'dmg' : 'auto'

let state: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  packaged: app.isPackaged,
  installMode,
}

/** Mac 自定义下载的 DMG 本地路径 */
let macDmgPath: string | null = null

function broadcast(win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) return
  win.webContents.send('app:update-state', state)
}

function setState(win: BrowserWindow | null, patch: Partial<UpdateState>) {
  state = {
    ...state,
    ...patch,
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    installMode,
  }
  broadcast(win)
}

function notesText(info: UpdateInfo): string | undefined {
  const notes = info.releaseNotes
  if (!notes) return undefined
  if (typeof notes === 'string') return notes
  return notes.map((item) => item.note).filter(Boolean).join('\n')
}

function friendlyUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/404|Not Found|authentication token/i.test(message)) {
    return (
      '无法访问更新源（404）。请确认 GitHub 仓库为 Public，' +
      '且 Release 已上传 latest-mac.yml / latest.yml。'
    )
  }
  if (/ERR_CONNECTION_RESET|ERR_CONNECTION_TIMED_OUT|ERR_NAME_NOT_RESOLVED|net::|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(message)) {
    return '网络无法连接更新源。可稍后重试，或到 GitHub / Gitee Release 手动下载安装包。'
  }
  if (/code signature|签名|ShipIt|did not pass validation|资源必须存在/i.test(message)) {
    return (
      'Mac 未签名安装包无法自动替换（系统签名校验失败）。' +
      '请到 GitHub Release 下载 .dmg，拖到「应用程序」覆盖安装。'
    )
  }
  return message
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10) || 0)
  const pb = b.split('.').map((x) => Number.parseInt(x, 10) || 0)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da > db) return 1
    if (da < db) return -1
  }
  return 0
}

function parseMacYml(text: string): { version: string; dmgName: string } | null {
  const version = text.match(/^version:\s*['"]?([^\s'"]+)/m)?.[1]
  const dmgName =
    text.match(/url:\s*(MPT-[^\s]+\.dmg)/)?.[1] ||
    text.match(/-\s*url:\s*(MPT-[^\s]+\.dmg)/)?.[1]
  if (!version || !dmgName) return null
  return { version, dmgName }
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, redirect: 'follow' })
    const chunks: Buffer[] = []
    request.on('response', (response) => {
      const status = response.statusCode ?? 0
      if (status >= 400) {
        reject(new Error(`HTTP ${status} ${url}`))
        return
      }
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      response.on('error', reject)
    })
    request.on('error', reject)
    request.end()
  })
}

async function fetchTextFromFeeds(fileName: string): Promise<{ text: string; feedUrl: string }> {
  const ordered = [
    activeFeedUrl,
    ...UPDATE_FEED_CANDIDATES.filter((url) => url !== activeFeedUrl),
  ]
  let lastError: unknown
  for (const feedUrl of ordered) {
    try {
      const text = await fetchText(`${feedUrl}/${fileName}`)
      activeFeedUrl = feedUrl
      return { text, feedUrl }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function downloadToFile(
  url: string,
  dest: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, redirect: 'follow' })
    request.on('response', (response) => {
      const status = response.statusCode ?? 0
      if (status >= 400) {
        reject(new Error(`下载失败 HTTP ${status}`))
        return
      }
      const total = Number(response.headers['content-length'] || 0)
      let received = 0
      const file = fs.createWriteStream(dest)
      response.on('data', (chunk) => {
        received += chunk.length
        file.write(chunk)
        if (total > 0) onProgress(Math.min(99, Math.round((received / total) * 100)))
      })
      response.on('end', () => {
        file.end(() => {
          onProgress(100)
          resolve()
        })
      })
      response.on('error', (error) => {
        file.destroy()
        reject(error)
      })
    })
    request.on('error', reject)
    request.end()
  })
}

async function downloadFileFromFeeds(
  fileName: string,
  dest: string,
  onProgress: (percent: number) => void,
) {
  const ordered = [
    activeFeedUrl,
    ...UPDATE_FEED_CANDIDATES.filter((url) => url !== activeFeedUrl),
  ]
  let lastError: unknown
  for (const feedUrl of ordered) {
    try {
      await downloadToFile(`${feedUrl}/${fileName}`, dest, onProgress)
      activeFeedUrl = feedUrl
      return feedUrl
    } catch (error) {
      lastError = error
      try {
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
      } catch {
        /* ignore */
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function downloadMacDmg(win: BrowserWindow | null) {
  const { text: yml } = await fetchTextFromFeeds('latest-mac.yml')
  const meta = parseMacYml(yml)
  if (!meta) throw new Error('无法解析 latest-mac.yml（缺少 dmg 条目）')

  const destDir = app.getPath('downloads')
  const dest = path.join(destDir, meta.dmgName)

  setState(win, {
    status: 'downloading',
    progress: 0,
    latestVersion: meta.version,
    error: undefined,
  })

  await downloadFileFromFeeds(meta.dmgName, dest, (progress) => {
    setState(win, { status: 'downloading', progress })
  })

  macDmgPath = dest
  setState(win, {
    status: 'downloaded',
    progress: 100,
    latestVersion: meta.version,
    error: undefined,
  })
  return dest
}

export function registerUpdaterIpc(getMainWindow: () => BrowserWindow | null) {
  // 默认走国内镜像；Windows/Linux 的 electron-updater 也用同一源
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: activeFeedUrl,
  })
  autoUpdater.autoDownload = false
  // Mac 未签名时 ShipIt 会校验失败，禁止退出时静默安装
  autoUpdater.autoInstallOnAppQuit = process.platform !== 'darwin'
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
    if (process.platform === 'darwin') return
    setState(getMainWindow(), {
      status: 'downloading',
      progress: Math.round(progress.percent),
      error: undefined,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    if (process.platform === 'darwin') return
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
      error: friendlyUpdateError(error),
      progress: undefined,
    })
  })

  ipcMain.handle('app:get-version', (): UpdateState => ({
    ...state,
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    installMode,
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
      // Mac：直接读 yml（镜像优先），避免触发 ShipIt
      if (process.platform === 'darwin') {
        const { text: yml, feedUrl } = await fetchTextFromFeeds('latest-mac.yml')
        autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })
        const meta = parseMacYml(yml)
        if (!meta) throw new Error('无法解析 latest-mac.yml')
        const newer = compareVersions(meta.version, app.getVersion()) > 0
        if (newer) {
          setState(getMainWindow(), {
            status: 'available',
            latestVersion: meta.version,
            releaseName: meta.version,
            error: undefined,
          })
          return {
            updateAvailable: true,
            currentVersion: app.getVersion(),
            latestVersion: meta.version,
            packaged: true,
            message: `发现新版本 ${meta.version}（Mac 将下载 DMG 手动安装）`,
          }
        }
        setState(getMainWindow(), {
          status: 'not-available',
          latestVersion: meta.version,
          error: undefined,
        })
        return {
          updateAvailable: false,
          currentVersion: app.getVersion(),
          latestVersion: meta.version,
          packaged: true,
          message: '当前已是最新版本',
        }
      }

      // Win/Linux：先试镜像，失败切换下一个源再检查
      let lastError: unknown
      for (const feedUrl of [
        activeFeedUrl,
        ...UPDATE_FEED_CANDIDATES.filter((url) => url !== activeFeedUrl),
      ]) {
        try {
          autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })
          await autoUpdater.checkForUpdates()
          if (state.status === 'error') {
            lastError = new Error(state.error || '检查更新失败')
            continue
          }
          activeFeedUrl = feedUrl
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
          return {
            updateAvailable: false,
            currentVersion: app.getVersion(),
            latestVersion: state.latestVersion || app.getVersion(),
            packaged: true,
            message: '当前已是最新版本',
          }
        } catch (error) {
          lastError = error
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError))
    } catch (error) {
      const message = friendlyUpdateError(error)
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
    if (state.status !== 'available' && state.status !== 'error' && state.status !== 'downloaded') {
      return { ok: false as const, message: '请先检查更新' }
    }
    try {
      if (process.platform === 'darwin') {
        const dest = await downloadMacDmg(getMainWindow())
        return {
          ok: true as const,
          message: `已下载到「下载」文件夹：${path.basename(dest)}`,
        }
      }
      setState(getMainWindow(), { status: 'downloading', progress: 0, error: undefined })
      await autoUpdater.downloadUpdate()
      return { ok: true as const, message: '开始下载更新' }
    } catch (error) {
      const message = friendlyUpdateError(error)
      setState(getMainWindow(), { status: 'error', error: message })
      return { ok: false as const, message }
    }
  })

  ipcMain.handle('app:install-update', async () => {
    if (state.status !== 'downloaded') {
      return { ok: false as const, message: '更新尚未下载完成' }
    }

    if (process.platform === 'darwin') {
      if (!macDmgPath || !fs.existsSync(macDmgPath)) {
        return { ok: false as const, message: '未找到已下载的 DMG，请重新下载' }
      }
      const result = await shell.openPath(macDmgPath)
      if (result) {
        return { ok: false as const, message: `无法打开安装包：${result}` }
      }
      setTimeout(() => app.quit(), 800)
      return {
        ok: true as const,
        message: '已打开 DMG，请拖到「应用程序」覆盖安装后重新打开。应用即将退出。',
      }
    }

    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true)
    }, 200)
    return { ok: true as const, message: '正在安装并重启…' }
  })
}
