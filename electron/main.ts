import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
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

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST!, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
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

app.whenReady().then(createWindow)
