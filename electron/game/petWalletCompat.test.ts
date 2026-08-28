import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDefaultGameState } from './gameEngine'
import { saveGameAtomic } from './gameStore'

const dirs: string[] = []

function petJsonWithCoins(coins: number): string {
  return JSON.stringify(
    {
      enabled: true,
      size: 160,
      profile: {
        id: 'pet-1',
        name: 'MPT',
        gender: 'unknown',
        birthday: '2026-08-28',
        title: '初心伙伴',
        level: 0,
        growth: 0,
        coins,
        personality: {
          element: 'fire',
          archetype: 'brave',
          traits: ['热情'],
        },
      },
      stats: { satiety: 100, hygiene: 100, health: 100, moodBonus: 0 },
      lastVitalAt: 1_000,
      lastInteractAt: 1_000,
    },
    null,
    2,
  )
}

function mockElectron(dir: string): void {
  vi.doMock('electron', () => ({
    app: { getPath: () => dir },
    BrowserWindow: class {},
    Menu: { buildFromTemplate: vi.fn() },
    ipcMain: { handle: vi.fn() },
    powerMonitor: { getSystemIdleTime: vi.fn(() => 0) },
    screen: {},
  }))
}

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mpt-pet-wallet-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  vi.doUnmock('electron')
  vi.doUnmock('./gameStore')
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('pet wallet compatibility', () => {
  it('reads profile coins from the game wallet without rewriting pet.json', async () => {
    const dir = makeDir()
    const petPath = join(dir, 'pet.json')
    const petJson = petJsonWithCoins(999)
    writeFileSync(petPath, petJson)
    const game = createDefaultGameState(1_000)
    game.wallet.coins = 37
    saveGameAtomic(dir, game)

    mockElectron(dir)
    const { getPetStatus } = await import('../pet')

    const status = getPetStatus()

    expect(status.profile.coins).toBe(37)
    expect(readFileSync(petPath, 'utf8')).toBe(petJson)
  })

  it('does not rewrite game.json when the status poll only reads the wallet', async () => {
    const dir = makeDir()
    writeFileSync(join(dir, 'pet.json'), petJsonWithCoins(999))
    const game = createDefaultGameState(1_000)
    game.wallet.coins = 37
    saveGameAtomic(dir, game)
    const gamePath = join(dir, 'game.json')
    const before = readFileSync(gamePath, 'utf8')

    mockElectron(dir)
    const { getPetStatus } = await import('../pet')

    getPetStatus()
    getPetStatus()
    getPetStatus()

    expect(readFileSync(gamePath, 'utf8')).toBe(before)
  })

  it('falls back to the legacy profile coins when the wallet cannot be read', async () => {
    const dir = makeDir()
    writeFileSync(join(dir, 'pet.json'), petJsonWithCoins(999))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    mockElectron(dir)
    vi.doMock('./gameStore', () => ({
      peekWalletCoins: () => {
        throw Object.assign(new Error('wallet unreadable'), { code: 'EACCES' })
      },
    }))
    const { getPetStatus } = await import('../pet')

    expect(getPetStatus().profile.coins).toBe(999)
    expect(consoleError).toHaveBeenCalledTimes(1)
  })

  it('keeps the last known wallet balance and throttles repeated failures', async () => {
    const dir = makeDir()
    writeFileSync(join(dir, 'pet.json'), petJsonWithCoins(999))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let attempts = 0

    mockElectron(dir)
    vi.doMock('./gameStore', () => ({
      peekWalletCoins: () => {
        attempts += 1
        if (attempts === 1) return 55
        throw Object.assign(new Error('wallet unreadable'), { code: 'EIO' })
      },
    }))
    const { getPetStatus } = await import('../pet')

    expect(getPetStatus().profile.coins).toBe(55)
    for (let index = 0; index < 60; index += 1) {
      expect(getPetStatus().profile.coins).toBe(55)
    }

    expect(attempts).toBe(61)
    expect(consoleError).toHaveBeenCalledTimes(1)
  })
})
