import type { WebContents } from 'electron'
import { externalHttpUrl } from './externalLinks'

type AccountFrame = { readonly url: string; readonly parent: unknown | null }
type AccountWebContents = { readonly mainFrame: AccountFrame; getURL: () => string; isDestroyed: () => boolean }
type AccountWindow = { webContents: AccountWebContents; isDestroyed: () => boolean }
export type AccountAuthorization<TWindow extends AccountWindow = AccountWindow> = {
  getMain: () => TWindow | null
  isTrustedUrl: (url: string) => boolean
}
type AccountIpcEvent = { sender: AccountWebContents; senderFrame: AccountFrame | null }

export function createTrustedAppUrl(options: { appFileUrl: string; isPackaged: boolean; devServerUrl?: string }): (url: string) => boolean {
  const development = !options.isPackaged && Boolean(options.devServerUrl)
  const expected = new URL(development ? options.devServerUrl! : options.appFileUrl)
  if (expected.username || expected.password || (development
    ? !['http:', 'https:'].includes(expected.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(expected.hostname)
    : expected.protocol !== 'file:')) throw new Error('Invalid trusted application URL')
  expected.hash = ''
  return candidate => {
    try {
      const url = new URL(candidate)
      url.hash = ''
      return url.href === expected.href
    } catch { return false }
  }
}

export function getTrustedMainWindow<TWindow extends AccountWindow>(authorization: AccountAuthorization<TWindow>): TWindow | null {
  try {
    const window = authorization.getMain()
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return null
    const contents = window.webContents
    if (contents.mainFrame.parent !== null || !authorization.isTrustedUrl(contents.getURL()) || !authorization.isTrustedUrl(contents.mainFrame.url)) return null
    return window
  } catch { return null }
}

function isTrustedSender(event: AccountIpcEvent, authorization: AccountAuthorization): boolean {
  try {
    const window = getTrustedMainWindow(authorization)
    return Boolean(window && event.sender === window.webContents && event.senderFrame &&
      event.senderFrame === window.webContents.mainFrame && event.senderFrame.parent === null &&
      authorization.isTrustedUrl(event.senderFrame.url))
  } catch { return false }
}

export function createAccountIpcHandler<TInput, TResult>(handler: (input: TInput, ...args: unknown[]) => Promise<TResult>, authorization: AccountAuthorization) {
  return async (event: AccountIpcEvent, input: TInput, ...args: unknown[]): Promise<TResult> => {
    if (!isTrustedSender(event, authorization)) throw new Error('Untrusted account IPC sender')
    const result = await handler(input, ...args)
    // A request may finish after the original document has navigated or closed.
    if (!isTrustedSender(event, authorization)) throw new Error('Untrusted account IPC sender')
    return result
  }
}

export function createTrustedExternalLinkHandler(authorization: AccountAuthorization, openExternal: (url: string) => Promise<void>) {
  return createAccountIpcHandler(async (destination: unknown) => {
    const url = externalHttpUrl(destination)
    if (!url) return false
    try {
      await openExternal(url)
      return true
    } catch { return false }
  }, authorization)
}

export function guardMainWindowNavigation(contents: Pick<WebContents, 'on' | 'setWindowOpenHandler'>, isTrustedUrl: (url: string) => boolean): void {
  const blockUntrusted = (event: { preventDefault: () => void }, url: string) => {
    if (!isTrustedUrl(url)) event.preventDefault()
  }
  contents.on('will-navigate', blockUntrusted)
  contents.on('will-redirect', blockUntrusted)
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
}
