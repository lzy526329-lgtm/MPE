import { expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import { createAccountIpcHandler, createTrustedAppUrl, getTrustedMainWindow, guardMainWindowNavigation } from './trustedRenderer'

const fileUrl = 'file:///Applications/MPT.app/Contents/Resources/app.asar/dist/index.html'
function context(url = fileUrl) {
  const mainFrame = { url, parent: null }
  const webContents = { mainFrame, getURL: () => mainFrame.url, isDestroyed: () => false }
  const window = { webContents, isDestroyed: () => false }
  return {
    window,
    event: { sender: webContents, senderFrame: mainFrame },
    authorization: { getMain: () => window, isTrustedUrl: createTrustedAppUrl({ appFileUrl: fileUrl, isPackaged: true }) },
  }
}

it('allows account operations only from the trusted main window top-level frame', async () => {
  const { event, authorization, window } = context()
  let accountValue = 'old'
  const invoke = createAccountIpcHandler(async (value: string) => { accountValue = value; return 'done' }, authorization)
  expect(await invoke(event, 'new')).toBe('done')
  expect(accountValue).toBe('new')
  expect(getTrustedMainWindow(authorization)).toBe(window)
})

it('preserves additional room-operation arguments across the trusted IPC boundary', async () => {
  const { event, authorization } = context()
  const invoke = createAccountIpcHandler(async (roomId: number, ...args: unknown[]) => ({ roomId, args }), authorization)
  expect(await invoke(event, 7, true, 'room-request')).toEqual({ roomId: 7, args: [true, 'room-request'] })
})

it('accepts the configured local development main frame', async () => {
  const { event, authorization } = context('http://127.0.0.1:5173/')
  authorization.isTrustedUrl = createTrustedAppUrl({ appFileUrl: fileUrl, isPackaged: false, devServerUrl: 'http://127.0.0.1:5173/' })
  expect(await createAccountIpcHandler(async () => 'account state', authorization)(event, undefined)).toBe('account state')
})

it('rejects a trusted-looking sender frame when webContents has already moved to a remote page', async () => {
  const { event, authorization } = context()
  event.sender.getURL = () => 'https://untrusted.example/'
  let called = false
  const invoke = createAccountIpcHandler(async () => { called = true }, authorization)
  await expect(invoke(event, undefined)).rejects.toThrow('Untrusted account IPC sender')
  expect(called).toBe(false)
})

it('rejects a different webContents even when its URL matches the application', async () => {
  const { event, authorization } = context()
  let called = false
  const invoke = createAccountIpcHandler(async () => { called = true }, authorization)
  await expect(invoke({ ...event, sender: { ...event.sender } }, undefined)).rejects.toThrow('Untrusted account IPC sender')
  expect(called).toBe(false)
})

it.each(['same-origin', 'remote'])('rejects a %s subframe without performing the account action', async variant => {
  const { event, authorization } = context()
  let called = false
  const invoke = createAccountIpcHandler(async () => { called = true }, authorization)
  const senderFrame = { url: variant === 'remote' ? 'https://untrusted.example/' : fileUrl, parent: event.senderFrame }
  await expect(invoke({ ...event, senderFrame }, undefined)).rejects.toThrow('Untrusted account IPC sender')
  expect(called).toBe(false)
})

it.each(['https://untrusted.example/', 'file:///tmp/index.html', 'about:blank', 'data:text/html,untrusted'])('rejects main window content at %s', async url => {
  const { event, authorization } = context(url)
  let called = false
  const invoke = createAccountIpcHandler(async () => { called = true }, authorization)
  await expect(invoke(event, undefined)).rejects.toThrow('Untrusted account IPC sender')
  expect(called).toBe(false)
  expect(getTrustedMainWindow(authorization)).toBeNull()
})

it('rejects missing frames, destroyed windows, and stale frames after navigation', async () => {
  const { event, window, authorization } = context()
  const invoke = createAccountIpcHandler(async () => 'account data', authorization)
  await expect(invoke({ ...event, senderFrame: null }, undefined)).rejects.toThrow()
  await expect(invoke({ ...event, senderFrame: { ...event.senderFrame } }, undefined)).rejects.toThrow()
  window.isDestroyed = () => true
  await expect(invoke(event, undefined)).rejects.toThrow()
})

it('does not return account data when the caller navigates while a request is pending', async () => {
  const { event, authorization } = context()
  let complete!: (value: string) => void
  const invoke = createAccountIpcHandler(() => new Promise<string>(resolve => { complete = resolve }), authorization)
  const pending = expect(invoke(event, undefined)).rejects.toThrow('Untrusted account IPC sender')
  event.senderFrame.url = 'https://untrusted.example/'
  complete('private account data')
  await pending
})

it('trusts only the configured local dev document and ignores dev configuration in packaged apps', () => {
  const local = createTrustedAppUrl({ appFileUrl: fileUrl, isPackaged: false, devServerUrl: 'http://localhost:5173/' })
  expect(local('http://localhost:5173/#account')).toBe(true)
  expect(local('http://localhost:5174/')).toBe(false)
  expect(local('http://localhost:5173/untrusted.html')).toBe(false)
  expect(local('http://localhost:5173@untrusted.example/')).toBe(false)
  const packaged = createTrustedAppUrl({ appFileUrl: fileUrl, isPackaged: true, devServerUrl: 'http://localhost:5173/' })
  expect(packaged('http://localhost:5173/')).toBe(false)
  expect(packaged(fileUrl + '#account')).toBe(true)
  expect(packaged(fileUrl + '?external=1')).toBe(false)
  expect(() => createTrustedAppUrl({ appFileUrl: fileUrl, isPackaged: false, devServerUrl: 'https://untrusted.example/' })).toThrow()
})

it('blocks untrusted navigation and redirects and denies new windows', () => {
  type NavigationListener = (event: { preventDefault: () => void }, url: string) => void
  const listeners = new Map<string, NavigationListener>()
  let openHandler!: (details: unknown) => { action: string }
  const contents = {
    on: (name: string, listener: NavigationListener) => { listeners.set(name, listener) },
    setWindowOpenHandler: (handler: typeof openHandler) => { openHandler = handler },
  }
  guardMainWindowNavigation(contents as unknown as Pick<WebContents, 'on' | 'setWindowOpenHandler'>, createTrustedAppUrl({ appFileUrl: fileUrl, isPackaged: true }))
  for (const name of ['will-navigate', 'will-redirect']) {
    const prevented = vi.fn()
    listeners.get(name)!({ preventDefault: prevented }, 'https://untrusted.example/')
    expect(prevented).toHaveBeenCalledOnce()
    prevented.mockClear()
    listeners.get(name)!({ preventDefault: prevented }, fileUrl + '#account')
    expect(prevented).not.toHaveBeenCalled()
  }
  expect(openHandler({ url: fileUrl })).toEqual({ action: 'deny' })
})
