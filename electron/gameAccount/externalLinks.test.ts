import { expect, it, vi } from 'vitest'
import { installExternalLinkHandler } from './externalLinks'
import { createTrustedExternalLinkHandler, createTrustedAppUrl } from './trustedRenderer'

const fileUrl = 'file:///Applications/MPT.app/Contents/Resources/app.asar/dist/index.html'
function setup() {
  const mainFrame = { url: fileUrl, parent: null }
  const contents = { mainFrame, getURL: () => mainFrame.url, isDestroyed: () => false }
  const window = { webContents: contents, isDestroyed: () => false }
  const authorization = { getMain: () => window, isTrustedUrl: createTrustedAppUrl({ appFileUrl: fileUrl, isPackaged: true }) }
  const opened: string[] = []
  const handler = createTrustedExternalLinkHandler(authorization, async (url: string) => { opened.push(url) })
  return { handler, opened, event: { sender: contents, senderFrame: mainFrame } }
}

it.each(['https://platform.deepseek.com/api_keys', 'https://video.example/media/play.mp4?token=abc', 'http://video.example/play.mp4'])('opens the trusted main document external link %s in the system browser', async url => {
  const { handler, opened, event } = setup()
  expect(await handler(event, url)).toBe(true)
  expect(opened).toEqual([url])
})

it.each(['file:///tmp/private.html', 'javascript:alert(1)', 'data:text/html,test', 'mailto:player@example.com', 'app:private', 'https://', 'https://[invalid', 'https:example.com', '//example.com', 'https://user:password@example.com/', 'https://example.com/\nfile', 'https://example.com/\\file'])('does not open an unsafe or malformed external destination %s', async url => {
  const { handler, opened, event } = setup()
  expect(await handler(event, url)).toBe(false)
  expect(opened).toEqual([])
})

it('does not open links requested by a different webContents, subframe, or navigated remote page', async () => {
  const { handler, opened, event } = setup()
  const url = 'https://platform.deepseek.com/api_keys'
  await expect(handler({ ...event, sender: { ...event.sender } }, url)).rejects.toThrow('Untrusted account IPC sender')
  await expect(handler({ ...event, senderFrame: { url: fileUrl, parent: event.senderFrame } }, url)).rejects.toThrow('Untrusted account IPC sender')
  event.senderFrame.url = 'https://untrusted.example/'
  await expect(handler(event, url)).rejects.toThrow('Untrusted account IPC sender')
  expect(opened).toEqual([])
})

it('does not leak system browser failures to the renderer', async () => {
  const mainFrame = { url: fileUrl, parent: null }
  const contents = { mainFrame, getURL: () => fileUrl, isDestroyed: () => false }
  const handler = createTrustedExternalLinkHandler({ getMain: () => ({ webContents: contents, isDestroyed: () => false }), isTrustedUrl: url => url === fileUrl }, async () => { throw new Error('/private/user/profile') })
  expect(await handler({ sender: contents, senderFrame: mainFrame }, 'https://example.com/')).toBe(false)
})

it('routes target blank links including noreferrer through IPC and installs listeners only once', async () => {
  const listeners = new Map<string, (event: MouseEvent) => void>()
  const document = {
    addEventListener: vi.fn((type: string, listener: (event: MouseEvent) => void) => { listeners.set(type, listener) }),
    removeEventListener: vi.fn((type: string) => { listeners.delete(type) }),
  } as unknown as Pick<Document, 'addEventListener' | 'removeEventListener'>
  const opened: string[] = []
  const invoke = async (url: string) => { opened.push(url) }
  const cleanup = installExternalLinkHandler(document, invoke)
  expect(installExternalLinkHandler(document, invoke)).toBe(cleanup)
  for (const [type, button, href] of [['click', 0, 'https://platform.deepseek.com/api_keys'], ['auxclick', 1, 'https://video.example/play.mp4']] as const) {
    const preventDefault = vi.fn()
    const anchor = { href, rel: 'noopener noreferrer' }
    listeners.get(type)!({ button, target: { closest: () => anchor }, preventDefault, defaultPrevented: false } as unknown as MouseEvent)
    expect(preventDefault).toHaveBeenCalledOnce()
  }
  expect(opened).toEqual(['https://platform.deepseek.com/api_keys', 'https://video.example/play.mp4'])
  expect(document.addEventListener).toHaveBeenCalledTimes(2)
  cleanup()
  expect(listeners.size).toBe(0)
  const newCleanup = installExternalLinkHandler(document, invoke)
  cleanup()
  expect(installExternalLinkHandler(document, invoke)).toBe(newCleanup)
  newCleanup()
})

it('does not forward unsafe destinations, non-links, already handled events, or right clicks', () => {
  const listeners = new Map<string, (event: MouseEvent) => void>()
  const document = {
    addEventListener: (type: string, listener: (event: MouseEvent) => void) => { listeners.set(type, listener) },
    removeEventListener: (type: string) => { listeners.delete(type) },
  } as unknown as Pick<Document, 'addEventListener' | 'removeEventListener'>
  const invoke = vi.fn().mockResolvedValue(true)
  const cleanup = installExternalLinkHandler(document, invoke)
  for (const [href, button, defaultPrevented] of [['javascript:alert(1)', 0, false], [null, 0, false], ['https://example.com/', 2, false], ['https://example.com/', 0, true]] as const) {
    listeners.get('click')!({ button, defaultPrevented, target: { closest: () => href ? { href } : null }, preventDefault: () => {} } as unknown as MouseEvent)
  }
  expect(invoke).not.toHaveBeenCalled()
  cleanup()
})
