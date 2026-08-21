import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import { registerPetIpc, restorePetIfNeeded, isPetOpen } from './pet'
import path from 'node:path'
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
import { getSystemInfo } from './systemInfo'
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

app.on('child-process-gone', (_event, details) => {
  console.error('[app] child-process-gone', details)
})

process.on('uncaughtException', (error) => {
  console.error('[app] uncaughtException', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[app] unhandledRejection', reason)
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

ipcMain.handle('system:info', () => getSystemInfo())
ipcMain.handle('disk:scan', () => scanDisk())
ipcMain.handle('disk:clean', (_event, ids: string[]) => cleanCategories(ids))

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    ensureMainWindow()
  })

  app.whenReady().then(() => {
    attachWatermarkMediaHeaders(session.defaultSession)
    registerPetIpc(() => win, ensureMainWindow)
    createWindow(false)
    restorePetIfNeeded()
  })
}
