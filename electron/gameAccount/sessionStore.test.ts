import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createSessionStore } from './sessionStore'

const dirs: string[] = []
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from([...value].reverse().join('')),
  decryptString: (value: Buffer) => [...value.toString()].reverse().join(''),
}
const account = { userId: 42, uid: '123456789', email: 'player@example.com', nickname: null, token: 'secret-player-token', lastRevision: 3, status: 1 }
function directory() {
  const dir = mkdtempSync(join(tmpdir(), 'account-session-'))
  dirs.push(dir)
  return dir
}
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })))

it('round trips an encrypted session without writing plaintext and preserves device identity', () => {
  const dir = directory()
  const store = createSessionStore(dir, encryption)
  const deviceId = store.getDeviceId()
  store.setSession({ ...account, deviceId })
  const bytes = readFileSync(join(dir, 'game-account.json'), 'utf8')
  expect(bytes).not.toContain(account.token)
  const restored = createSessionStore(dir, encryption)
  expect(restored.getSession()).toEqual({ ...account, deviceId })
  restored.clearSession()
  expect(createSessionStore(dir, encryption).getDeviceId()).toBe(deviceId)
  expect(createSessionStore(dir, encryption).getSession()).toBeNull()
})

it('keeps a token only in memory when safe encryption is unavailable', () => {
  const dir = directory()
  const unavailable = { ...encryption, isEncryptionAvailable: () => false }
  const store = createSessionStore(dir, unavailable)
  store.setSession({ ...account, deviceId: store.getDeviceId() })
  expect(store.getSession()?.token).toBe(account.token)
  expect(readFileSync(join(dir, 'game-account.json'), 'utf8')).not.toContain(account.token)
  expect(createSessionStore(dir, unavailable).getSession()).toBeNull()
})

it('preserves pending sync metadata alongside the encrypted session on restart', () => {
  const dir = directory()
  const store = createSessionStore(dir, encryption)
  store.setSession({ ...account, deviceId: store.getDeviceId() })
  store.setSyncMetadata({ checksum: 'abc', pending: true })
  const restored = createSessionStore(dir, encryption)
  expect(restored.getSyncMetadata()).toEqual({ checksum: 'abc', pending: true })
})
