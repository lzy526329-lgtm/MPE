import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCloudPawsUrl, mountCloudPawsPage } from '../cloudPawsPage'
import { navigateToPage } from '../appNavigation'

let dispose: (() => void) | undefined
afterEach(() => { dispose?.(); dispose = undefined; vi.unstubAllGlobals() })

describe('embedded Cloud Paws', () => {
  it.each([
    ['http://localhost:5173/', 'http://localhost:5173/games/cloud-paws/index.html'],
    ['file:///C:/Program%20Files/MPT/resources/app.asar/dist/index.html', 'file:///C:/Program%20Files/MPT/resources/app.asar/dist/games/cloud-paws/index.html'],
    ['file:///Applications/MPT.app/Contents/Resources/app.asar/dist/index.html', 'file:///Applications/MPT.app/Contents/Resources/app.asar/dist/games/cloud-paws/index.html'],
  ])('resolves bundled game within %s', (base, expected) => {
    expect(getCloudPawsUrl(base)).toBe(expected)
  })

  it('loads on first visit, pauses when leaving, and reuses the same game on return', () => {
    const handlers = new Map<string, () => void>()
    const messages: unknown[] = []
    const frame = {
      src: '', title: '', className: '',
      contentWindow: { postMessage: (message: unknown) => messages.push(message) },
      addEventListener: (name: string, fn: () => void) => handlers.set(name, fn),
      remove: vi.fn(),
    }
    const children: unknown[] = []
    const root = { append: (child: unknown) => children.push(child) }
    vi.stubGlobal('document', {
      baseURI: 'file:///Applications/MPT.app/Contents/Resources/app.asar/dist/index.html',
      querySelector: (selector: string) => selector === '#cloud-paws-root' ? root : null,
      querySelectorAll: () => [],
      createElement: () => frame,
    })
    navigateToPage('pet-settings-page')
    dispose = mountCloudPawsPage()
    expect(children).toHaveLength(0)
    navigateToPage('cloud-paws-page')
    expect(children).toHaveLength(1)
    expect(frame.src).toContain('/dist/games/cloud-paws/index.html')
    handlers.get('load')?.()
    expect(messages.at(-1)).toEqual({ type: 'cloud-paws:visibility', visible: true })
    navigateToPage('toolbox-page')
    expect(messages.at(-1)).toEqual({ type: 'cloud-paws:visibility', visible: false })
    navigateToPage('cloud-paws-page')
    expect(children).toHaveLength(1)
    expect(messages.at(-1)).toEqual({ type: 'cloud-paws:visibility', visible: true })
    dispose?.(); dispose = undefined
    expect(frame.remove).toHaveBeenCalledOnce()
  })
})

it('only forwards commands from its own iframe and never sends credentials into the game', async () => {
  const messages: any[] = []
  let receive: (event: any) => void = () => {}
  const listeners = new Map<string, () => void>()
  const command = vi.fn(async () => ({ ok: true, data: {} }))
  const frame = { src: '', title: '', className: '', contentWindow: { postMessage: (value: unknown) => messages.push(value) },
    addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), remove: vi.fn() }
  vi.stubGlobal('window', { electronAPI: {
    gameAccountCloudPawsCommand: command,
    gameAccountGetState: async () => ({ account: { userId: 12, nickname: '伙伴', token: 'never-expose-this' } }),
  }, addEventListener: (_name: string, fn: typeof receive) => { receive = fn }, removeEventListener: vi.fn() })
  vi.stubGlobal('document', { baseURI: 'http://localhost:5173/', querySelector: () => ({ append: vi.fn() }), querySelectorAll: () => [], createElement: () => frame })
  navigateToPage('cloud-paws-page'); dispose = mountCloudPawsPage(); listeners.get('load')?.()
  await Promise.resolve()
  expect(messages.find(m => m.type === 'cloud-paws:account')?.account).toEqual({ id: '12', name: '伙伴' })
  expect(JSON.stringify(messages)).not.toContain('never-expose-this')
  const data = { type: 'cloud-paws:command', command: { action: 'ready', ready: true } }
  receive({ source: {}, origin: 'http://localhost:5173', data })
  receive({ source: frame.contentWindow, origin: 'https://untrusted.example', data })
  expect(command).not.toHaveBeenCalled()
  receive({ source: frame.contentWindow, origin: 'http://localhost:5173', data })
  await Promise.resolve()
  expect(command).toHaveBeenCalledWith(data.command)
})
