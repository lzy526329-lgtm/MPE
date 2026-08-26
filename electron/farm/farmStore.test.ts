import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createDefaultFarm, plant } from './farmEngine'
import { loadFarm, parseFarmPayload, saveFarm, withFarm } from './farmStore'
import type { FarmState } from './farmTypes'

const T0 = 1_000_000
const tempDirs: string[] = []

function createTempUserData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-store-'))
  tempDirs.push(dir)
  return dir
}

function farmFile(userDataPath: string) {
  return path.join(userDataPath, 'farm.json')
}

function readStoredFarm(userDataPath: string): FarmState {
  return JSON.parse(fs.readFileSync(farmFile(userDataPath), 'utf8')) as FarmState
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('parseFarmPayload', () => {
  it('resets corrupt payload', () => {
    const { state, didReset } = parseFarmPayload('not-json', 1234)

    expect(didReset).toBe(true)
    expect(state.version).toBe(1)
    expect(state.plots).toHaveLength(6)
    expect(state.lastSettledAt).toBe(1234)
  })

  it('resets payloads with invalid version or plots', () => {
    const invalidVersion = parseFarmPayload(JSON.stringify({ ...createDefaultFarm(T0), version: 2 }), T0)
    const invalidPlots = parseFarmPayload(JSON.stringify({ ...createDefaultFarm(T0), plots: [] }), T0)

    expect(invalidVersion.didReset).toBe(true)
    expect(invalidPlots.didReset).toBe(true)
  })
})

describe('farmStore', () => {
  it('saves farm.json under the user data path', () => {
    const userDataPath = createTempUserData()
    const state = { ...createDefaultFarm(T0), lastWeatherRollAt: T0 - 1_000 }

    saveFarm(userDataPath, state)

    expect(readStoredFarm(userDataPath)).toMatchObject({
      version: 1,
      lastSettledAt: T0,
      lastWeatherRollAt: T0 - 1_000,
    })
  })

  it('loads, settles, and writes back an existing farm', () => {
    const userDataPath = createTempUserData()
    const planted = plant(createDefaultFarm(T0), 0, 'lettuce', T0)
    expect(planted.ok).toBe(true)
    if (!planted.ok) return
    saveFarm(userDataPath, planted.state)

    const state = loadFarm(userDataPath, T0 + 30_000)

    expect(state.lastSettledAt).toBe(T0 + 30_000)
    expect(state.plots[0]).toMatchObject({ status: 'growing', progressMs: 30_000 })
    expect(readStoredFarm(userDataPath).lastSettledAt).toBe(T0 + 30_000)
  })

  it('renames corrupt farm.json before resetting to the default farm', () => {
    const userDataPath = createTempUserData()
    fs.writeFileSync(farmFile(userDataPath), 'not-json')

    const state = loadFarm(userDataPath, T0)
    const files = fs.readdirSync(userDataPath)

    expect(state).toMatchObject({
      version: 1,
      lastSettledAt: T0,
    })
    expect(files.some((file) => /^farm\.json\.corrupt\.\d+$/.test(file))).toBe(true)
    expect(readStoredFarm(userDataPath).plots).toHaveLength(6)
  })

  it('serializes withFarm mutations so later calls see earlier writes', async () => {
    const userDataPath = createTempUserData()
    saveFarm(userDataPath, createDefaultFarm(T0))

    const [first, second] = await Promise.all([
      withFarm(userDataPath, T0, (state) => ({
        ok: true,
        state: { ...state, inventory: { ...state.inventory, lettuce: 1 } },
      })),
      withFarm(userDataPath, T0, (state) => ({
        ok: true,
        state: { ...state, inventory: { ...state.inventory, tomato: 2 } },
      })),
    ])

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(readStoredFarm(userDataPath).inventory).toEqual({ lettuce: 1, tomato: 2 })
  })
})
