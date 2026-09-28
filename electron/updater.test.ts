import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  responses: new Map<string, string>(),
  requests: [] as string[],
  downloads: '',
}))

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.28', isPackaged: true, getPath: () => runtime.downloads },
  ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => runtime.handlers.set(name, handler) },
  net: {
    request: ({ url }: { url: string }) => {
      const request = new EventEmitter() as EventEmitter & { end: () => void }
      request.end = () => queueMicrotask(() => {
        const name = url.split('/').pop()!
        runtime.requests.push(name)
        const body = runtime.responses.get(name)
        const response = Object.assign(new EventEmitter(), { statusCode: body === undefined ? 404 : 200, headers: {} })
        request.emit('response', response)
        if (body !== undefined) {
          response.emit('data', Buffer.from(body))
          response.emit('end')
        }
      })
      return request
    },
  },
  shell: {},
}))
vi.mock('electron-updater', () => ({ autoUpdater: { setFeedURL: vi.fn(), on: vi.fn() } }))

beforeEach(() => {
  vi.resetModules()
  runtime.handlers.clear()
  runtime.responses.clear()
  runtime.requests.length = 0
  runtime.downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'mpt-update-'))
})
afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(runtime.downloads, { recursive: true, force: true })
})

async function start(arch: string) {
  vi.stubGlobal('process', { ...process, platform: 'darwin', arch })
  const { registerUpdaterIpc } = await import('./updater')
  registerUpdaterIpc(() => null)
}

const armYml = 'version: 1.0.29\nfiles:\n  - url: MPT-1.0.29-mac-arm64.zip\n  - url: MPT-1.0.29-mac-arm64.dmg\n'
const intelYml = 'version: 1.0.29\nfiles:\n  - url: MPT-1.0.29-mac-x64.zip\n  - url: MPT-1.0.29-mac-x64.dmg\n'

it.each([
  ['x64', 'latest-mac-x64.yml', 'MPT-1.0.29-mac-x64.dmg'],
  ['arm64', 'latest-mac.yml', 'MPT-1.0.29-mac-arm64.dmg'],
])('downloads the matching installer on %s and preserves the existing Apple Silicon feed', async (arch, feed, dmg) => {
  runtime.responses.set('latest-mac.yml', armYml)
  runtime.responses.set('latest-mac-x64.yml', intelYml)
  runtime.responses.set(dmg, 'installer fixture')
  await start(arch)
  expect(await runtime.handlers.get('app:check-update')!()).toMatchObject({ updateAvailable: true })
  expect(runtime.requests).toEqual([feed])
  expect(await runtime.handlers.get('app:download-update')!()).toMatchObject({ ok: true })
  expect(runtime.requests).toEqual([feed, feed, dmg])
  expect(fs.readFileSync(path.join(runtime.downloads, dmg), 'utf8')).toBe('installer fixture')
})

it('does not offer an ARM installer to Intel even if the update metadata is wrong', async () => {
  runtime.responses.set('latest-mac-x64.yml', armYml)
  runtime.responses.set('latest-mac.yml', armYml)
  await start('x64')
  expect(await runtime.handlers.get('app:check-update')!()).toMatchObject({ updateAvailable: false })
  expect(runtime.handlers.get('app:get-version')!()).toMatchObject({ status: 'error' })
})

it('selects the Intel installer even when an ARM entry is listed first', async () => {
  const both = armYml + '  - url: MPT-1.0.29-mac-x64.dmg\n'
  runtime.responses.set('latest-mac-x64.yml', both)
  runtime.responses.set('latest-mac.yml', both)
  runtime.responses.set('MPT-1.0.29-mac-x64.dmg', 'intel installer')
  await start('x64')
  await runtime.handlers.get('app:check-update')!()
  expect(await runtime.handlers.get('app:download-update')!()).toMatchObject({ ok: true })
  expect(fs.readdirSync(runtime.downloads)).toEqual(['MPT-1.0.29-mac-x64.dmg'])
})
