import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import { registerPetIpc, restorePetIfNeeded, isPetOpen } from './pet'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { compressImage, type CompressRequest } from './compress'
import {
  archiveFilters,
  compressArchive,
  extractArchive,
  inspectArchive,
  inspectCompressionSource,
  type CompressArchiveRequest,
  type ExtractRequest,
} from './archive'
import {
  attachWatermarkMediaHeaders,
  parseWatermark,
  saveWatermarkMedia,
  suggestedFileName,
  type SaveWatermarkRequest,
  type WatermarkResult,
} from './watermark'
import { scanDisk, cleanCategories } from './diskClean'
import {
  addPdfWatermark,
  compressPdfFile,
  extractPdfImages,
  inspectImageSource,
  inspectPdf,
  pdfToImages,
  imagesToPdf,
  mergePdfFiles,
  splitPdfFile,
  type CompressPdfRequest,
  type ExtractPdfImagesRequest,
  type ImagesToPdfRequest,
  type MergePdfRequest,
  type PdfToImagesRequest,
  type SplitPdfRequest,
  type WatermarkPdfRequest,
} from './pdf'

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow(show = false) {
  if (win && !win.isDestroyed()) {
    if (show) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
    return win
  }

  win = new BrowserWindow({
    width: 960,
    height: 720,
    show,
    title: 'MPT',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('closed', () => {
    win = null
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST!, 'index.html'))
  }
  return win
}

function ensureMainWindow() {
  return createWindow(true)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !isPetOpen()) {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  ensureMainWindow()
})

ipcMain.handle('image:compress', (_event, request: CompressRequest) => compressImage(request))
ipcMain.handle('archive:choose', async () => {
  const selection = await dialog.showOpenDialog(win!, {
    title: '选择压缩包',
    properties: ['openFile'],
    filters: archiveFilters,
  })
  if (selection.canceled || !selection.filePaths[0]) return null
  return inspectArchive(selection.filePaths[0])
})
ipcMain.handle('archive:inspect', (_event, archivePath: string) => inspectArchive(archivePath))
ipcMain.handle('archive:choose-destination', async (_event, defaultPath?: string) => {
  const selection = await dialog.showOpenDialog(win!, {
    title: '选择解压位置',
    defaultPath,
    properties: ['openDirectory', 'createDirectory'],
  })
  return selection.canceled ? null : selection.filePaths[0]
})
ipcMain.handle('archive:extract', (_event, request: ExtractRequest) => extractArchive(request))
ipcMain.handle('archive:choose-sources', async (_event, mode: 'files' | 'directory') => {
  const selection = await dialog.showOpenDialog(win!, {
    title: mode === 'files' ? '选择要压缩的文件' : '选择要压缩的文件夹',
    properties:
      mode === 'files'
        ? ['openFile', 'multiSelections']
        : ['openDirectory', 'multiSelections'],
  })
  if (selection.canceled) return []
  return Promise.all(selection.filePaths.map(inspectCompressionSource))
})
ipcMain.handle('archive:inspect-source', (_event, sourcePath: string) =>
  inspectCompressionSource(sourcePath))
ipcMain.handle('archive:compress', (_event, request: CompressArchiveRequest) =>
  compressArchive(request))
ipcMain.handle('path:open', (_event, targetPath: string) => shell.openPath(targetPath))
ipcMain.handle('path:reveal', (_event, targetPath: string) => shell.showItemInFolder(targetPath))
ipcMain.handle('pdf:inspect', (_event, pdfPath: string) => inspectPdf(pdfPath))
ipcMain.handle('pdf:inspect-image', (_event, imagePath: string) => inspectImageSource(imagePath))
ipcMain.handle('pdf:merge', (_event, request: MergePdfRequest) => mergePdfFiles(request))
ipcMain.handle('pdf:split', (_event, request: SplitPdfRequest) => splitPdfFile(request))
ipcMain.handle('pdf:images-to-pdf', (_event, request: ImagesToPdfRequest) => imagesToPdf(request))
ipcMain.handle('pdf:to-images', (_event, request: PdfToImagesRequest) => pdfToImages(request))
ipcMain.handle('pdf:compress', (_event, request: CompressPdfRequest) => compressPdfFile(request))
ipcMain.handle('pdf:extract-images', (_event, request: ExtractPdfImagesRequest) =>
  extractPdfImages(request))
ipcMain.handle('pdf:add-watermark', (_event, request: WatermarkPdfRequest) =>
  addPdfWatermark(request))
ipcMain.handle('pdf:choose-save', async (_event, options?: { defaultPath?: string; title?: string }) => {
  const selection = await dialog.showSaveDialog(win!, {
    title: options?.title ?? '保存 PDF 文件',
    defaultPath: options?.defaultPath,
    filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
  })
  return selection.canceled ? null : selection.filePath
})
ipcMain.handle('pdf:choose-folder', async (_event, defaultPath?: string) => {
  const selection = await dialog.showOpenDialog(win!, {
    title: '选择导出文件夹',
    defaultPath,
    properties: ['openDirectory', 'createDirectory'],
  })
  return selection.canceled ? null : selection.filePaths[0]
})
ipcMain.handle('watermark:parse', (_event, url: string) => parseWatermark(url))
ipcMain.handle('watermark:save', async (_event, result: WatermarkResult) => {
  const defaultName = suggestedFileName(result)
  const selection = await dialog.showSaveDialog(win!, {
    title: '保存无水印文件',
    defaultPath: defaultName,
    filters: result.type === 'picture'
      ? [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
      : [{ name: '视频', extensions: ['mp4'] }],
  })
  if (selection.canceled || !selection.filePath) return null
  const request: SaveWatermarkRequest = {
    url: result.video_url,
    referer: result.referer,
    suggestedName: defaultName,
  }
  return saveWatermarkMedia({ ...request, outputPath: selection.filePath })
})

function getSystemInfo() {
  const platform = process.platform
  const cpus = os.cpus()
  const totalMem = os.totalmem()
  const freeMem = os.freemem()

  // CPU info
  const cpuModel = cpus[0]?.model?.trim() ?? '未知'
  const cpuCores = cpus.length

  // Disk info (cross-platform)
  const diskInfo: { mount: string; total: number; used: number; free: number }[] = []
  try {
    if (platform === 'darwin' || platform === 'linux') {
      const raw = execSync('df -k', { encoding: 'utf8' })
      for (const line of raw.split('\n').slice(1)) {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 6) continue
        const mount = parts[parts.length - 1]
        if (!mount.startsWith('/') || mount.startsWith('/System/Volumes/') && mount !== '/System/Volumes/Data') continue
        if (platform === 'darwin' && mount !== '/' && mount !== '/System/Volumes/Data') continue
        const total = parseInt(parts[1]) * 1024
        const used = parseInt(parts[2]) * 1024
        const free = parseInt(parts[3]) * 1024
        if (!isNaN(total) && total > 0) diskInfo.push({ mount, total, used, free })
      }
    } else if (platform === 'win32') {
      const raw = execSync('wmic logicaldisk get size,freespace,caption /format:csv', { encoding: 'utf8' })
      for (const line of raw.split('\n').slice(2)) {
        const parts = line.trim().split(',')
        if (parts.length < 4) continue
        const mount = parts[1]
        const free = parseInt(parts[2])
        const total = parseInt(parts[3])
        if (!isNaN(total) && total > 0) {
          diskInfo.push({ mount, total, used: total - free, free })
        }
      }
    }
  } catch { /* ignore disk errors */ }

  // GPU info (best-effort)
  let gpuModel = '未知'
  try {
    if (platform === 'darwin') {
      const raw = execSync('system_profiler SPDisplaysDataType 2>/dev/null', { encoding: 'utf8' })
      const match = raw.match(/Chipset Model:\s*(.+)/i)
      if (match) gpuModel = match[1].trim()
    } else if (platform === 'win32') {
      const raw = execSync('wmic path win32_VideoController get name /format:csv', { encoding: 'utf8' })
      const lines = raw.split('\n').slice(2).filter(Boolean)
      const parts = lines[0]?.split(',')
      if (parts && parts[1]) gpuModel = parts[1].trim()
    } else {
      const raw = execSync('lspci | grep -i vga', { encoding: 'utf8' })
      gpuModel = raw.split('\n')[0]?.replace(/.*:\s*/, '').trim() ?? '未知'
    }
  } catch { /* ignore gpu errors */ }

  // macOS version
  let osVersion = `${os.type()} ${os.release()}`
  try {
    if (platform === 'darwin') {
      const raw = execSync('sw_vers', { encoding: 'utf8' })
      const name = raw.match(/ProductName:\s*(.+)/)?.[1]?.trim() ?? 'macOS'
      const ver = raw.match(/ProductVersion:\s*(.+)/)?.[1]?.trim() ?? ''
      osVersion = `${name} ${ver}`
    } else if (platform === 'win32') {
      const raw = execSync('ver', { encoding: 'utf8', shell: 'cmd.exe' })
      osVersion = raw.trim()
    }
  } catch { /* ignore */ }

  return {
    platform,
    osVersion,
    hostname: os.hostname(),
    arch: os.arch(),
    cpuModel,
    cpuCores,
    totalMem,
    freeMem,
    uptime: os.uptime(),
    gpuModel,
    diskInfo,
  }
}

ipcMain.handle('system:info', () => getSystemInfo())
ipcMain.handle('disk:scan', () => scanDisk())
ipcMain.handle('disk:clean', (_event, ids: string[]) => cleanCategories(ids))

app.whenReady().then(() => {
  attachWatermarkMediaHeaders(session.defaultSession)
  registerPetIpc(() => win, ensureMainWindow)
  createWindow(false)
  restorePetIfNeeded()
})
