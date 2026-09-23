import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { resolveBattleTestProfile } from './battleTestProfile'
import { createSessionStore } from './gameAccount/sessionStore'
import { createDefaultGameState } from './game/gameEngine'
import { loadGame, saveGameAtomic } from './game/gameStore'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })))

it('leaves packaged apps and ordinary development profiles unchanged', () => {
  expect(resolveBattleTestProfile(true, 'A', '/data/mpt')).toBeNull()
  expect(resolveBattleTestProfile(false, undefined, '/data/mpt')).toBeNull()
  expect(() => resolveBattleTestProfile(false, '../mpt', '/data/mpt')).toThrow()
})

it('keeps accounts, devices and saved games independent across both clients and normal startup', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mpt-battle-profiles-'))
  dirs.push(directory)
  const normalPath = join(directory, 'mpt')
  const a = resolveBattleTestProfile(false, 'A', normalPath)!
  const b = resolveBattleTestProfile(false, 'B', normalPath)!
  const encryption = {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(text),
    decryptString: (buffer: Buffer) => buffer.toString(),
  }
  const normal = createSessionStore(normalPath, encryption)
  const playerA = createSessionStore(a.userData, encryption)
  const playerB = createSessionStore(b.userData, encryption)
  const account = { uid: '123456789', email: 'test@example.invalid', nickname: null, token: 'test-only', lastRevision: 0, status: 1 }
  playerA.setSession({ ...account, userId: 1, deviceId: playerA.getDeviceId() })
  playerB.setSession({ ...account, userId: 2, deviceId: playerB.getDeviceId() })
  expect(createSessionStore(a.userData, encryption).getSession()?.userId).toBe(1)
  expect(createSessionStore(b.userData, encryption).getSession()?.userId).toBe(2)
  expect(normal.getSession()).toBeNull()
  expect(new Set([normal.getDeviceId(), playerA.getDeviceId(), playerB.getDeviceId()]).size).toBe(3)
  const game = createDefaultGameState(1000)
  game.wallet.coins = 123
  saveGameAtomic(a.userData, game)
  expect(loadGame(a.userData, 1000).wallet.coins).toBe(123)
  expect(loadGame(b.userData, 1000).wallet.coins).toBe(100)
  expect(loadGame(normalPath, 1000).wallet.coins).toBe(100)
  playerA.clearSession()
  expect(createSessionStore(b.userData, encryption).getSession()?.userId).toBe(2)
})
