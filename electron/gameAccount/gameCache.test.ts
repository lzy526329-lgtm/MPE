import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { clearActiveGameUser, getGameCachePath, normalizeGameCacheUserId, prepareGameCache, resolveGameDataPath, setActiveGameUser } from './gameCache'

const cleanup: string[] = []
afterEach(() => cleanup.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))

describe('game account cache paths', () => {
  it('uses a separate game file for each account', () => {
    expect(getGameCachePath('/tmp/mpt', 42)).toBe('/tmp/mpt/game-cache/42/game.json')
    expect(getGameCachePath('/tmp/mpt', '7')).toBe('/tmp/mpt/game-cache/7/game.json')
  })

  it('rejects path-like account identifiers', () => {
    expect(() => normalizeGameCacheUserId('../other')).toThrow('Invalid game cache user id')
    expect(() => normalizeGameCacheUserId('')).toThrow('Invalid game cache user id')
  })

  it('copies the legacy local save only for the first account migration', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'game-cache-'))
    cleanup.push(userDataPath)
    mkdirSync(userDataPath, { recursive: true })
    writeFileSync(join(userDataPath, 'game.json'), '{"wallet":{"coins":73}}')

    const first = prepareGameCache(userDataPath, 42)
    expect(readFileSync(join(first, 'game.json'), 'utf8')).toBe('{"wallet":{"coins":73}}')

    const second = prepareGameCache(userDataPath, 7)
    expect(second).toContain('/game-cache/7')
    expect(() => readFileSync(join(second, 'game.json'), 'utf8')).toThrow()
  })

  it('resolves the active account path and falls back to the root for guests', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'game-cache-'))
    cleanup.push(userDataPath)
    clearActiveGameUser()
    expect(resolveGameDataPath(userDataPath)).toBe(userDataPath)
    setActiveGameUser(42)
    expect(resolveGameDataPath(userDataPath)).toBe(join(userDataPath, 'game-cache', '42'))
    clearActiveGameUser()
  })
})
