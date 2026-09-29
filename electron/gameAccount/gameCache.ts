import fs from 'node:fs'
import path from 'node:path'

let activeGameUserId: number | string | null = null

export function normalizeGameCacheUserId(value: number | string): string {
  const normalized = String(value)
  if (!/^[1-9]\d*$/.test(normalized)) throw new Error('Invalid game cache user id')
  return normalized
}

export function getGameCachePath(userDataPath: string, userId: number | string): string {
  return path.join(userDataPath, 'game-cache', normalizeGameCacheUserId(userId), 'game.json')
}

export function ensureGameCacheDir(userDataPath: string, userId: number | string): string {
  const filePath = getGameCachePath(userDataPath, userId)
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  return filePath
}

export function prepareGameCache(userDataPath: string, userId: number | string): string {
  const target = getGameCachePath(userDataPath, userId)
  const cacheRoot = path.dirname(path.dirname(target))
  const cacheDir = path.dirname(target)
  const legacyFile = path.join(userDataPath, 'game.json')
  const marker = path.join(cacheRoot, '.legacy-migrated')
  fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 })
  if (!fs.existsSync(target) && !fs.existsSync(marker) && fs.existsSync(legacyFile)) {
    fs.copyFileSync(legacyFile, target)
    fs.writeFileSync(marker, JSON.stringify({ userId: normalizeGameCacheUserId(userId) }), { mode: 0o600, flag: 'wx' })
  }
  return cacheDir
}

export function isGameCachePath(filePath: string): boolean {
  return filePath.includes(`${path.sep}game-cache${path.sep}`) && path.basename(filePath) === 'game.json'
}

export function setActiveGameUser(userId: number | string): void {
  activeGameUserId = normalizeGameCacheUserId(userId)
}

export function clearActiveGameUser(): void {
  activeGameUserId = null
}

export function resolveGameDataPath(userDataPath: string): string {
  return activeGameUserId === null ? userDataPath : prepareGameCache(userDataPath, activeGameUserId)
}
