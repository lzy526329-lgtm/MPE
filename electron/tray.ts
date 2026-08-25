import { app, Menu, Tray, nativeImage, type BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { getPetEnabled, setPetEnabled } from './pet'
import { getOpenAtLogin, setOpenAtLogin } from './appPrefs'

let tray: Tray | null = null
let quitting = false
let rebuildMenu: (() => void) | null = null

export function isAppQuitting() {
  return quitting
}

export function markAppQuitting() {
  quitting = true
}

export function requestAppQuit() {
  quitting = true
  app.quit()
}

function resolveTrayIconPath() {
  const candidates = [
    path.join(process.resourcesPath, 'icon.png'),
    path.join(__dirname, '../build/icon.png'),
    path.join(app.getAppPath(), 'build/icon.png'),
    path.join(process.cwd(), 'build/icon.png'),
  ]
  return candidates.find((file) => fs.existsSync(file)) ?? null
}

function createTrayImage() {
  const iconPath = resolveTrayIconPath()
  if (!iconPath) return nativeImage.createEmpty()
  let image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) return image
  const size = process.platform === 'darwin' ? 18 : 16
  image = image.resize({ width: size, height: size, quality: 'best' })
  if (process.platform === 'darwin') {
    image.setTemplateImage(true)
  }
  return image
}

type TrayDeps = {
  showMainWindow: () => BrowserWindow | null
  hideMainWindow: () => void
}

export function createAppTray(deps: TrayDeps): { tray: Tray; refresh: () => void } {
  if (tray && rebuildMenu) {
    return { tray, refresh: rebuildMenu }
  }

  tray = new Tray(createTrayImage())
  tray.setToolTip('MPT · MY PET')

  const rebuild = () => {
    if (!tray) return
    const petOn = getPetEnabled()
    const openAtLogin = getOpenAtLogin()
    const menu = Menu.buildFromTemplate([
      {
        label: '打开控制面板',
        click: () => {
          deps.showMainWindow()
        },
      },
      { type: 'separator' },
      {
        label: petOn ? '隐藏宠物' : '显示宠物',
        click: () => {
          setPetEnabled(!getPetEnabled())
          rebuild()
        },
      },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: openAtLogin,
        click: (item) => {
          setOpenAtLogin(item.checked)
          rebuild()
        },
      },
      { type: 'separator' },
      {
        label: '退出 MPT',
        click: () => requestAppQuit(),
      },
    ])
    tray.setContextMenu(menu)
  }

  rebuildMenu = rebuild
  rebuild()

  tray.on('click', () => {
    if (process.platform !== 'darwin') {
      deps.showMainWindow()
    }
  })

  tray.on('double-click', () => {
    deps.showMainWindow()
  })

  return { tray, refresh: rebuild }
}

export function destroyAppTray() {
  tray?.destroy()
  tray = null
  rebuildMenu = null
}
