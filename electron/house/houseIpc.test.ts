import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createDefaultGameState } from '../game/gameEngine'
import { saveGameAtomic } from '../game/gameStore'
import { createHouseHandlers } from './houseIpc'
import { furnitureCounts } from '../game/furnitureCatalog'

const directories: string[] = []
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }) })

it('returns and publishes the newly saved furniture, and restores stock on removal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'house-test-'))
  directories.push(dir)
  const game = createDefaultGameState(1000)
  game.inventory.furniture = furnitureCounts({ bed: 1 })
  saveGameAtomic(dir, game)
  const publish = vi.fn()
  const options = { userDataPath: dir, now: () => 1000, publish }
  const handlers = createHouseHandlers(options)
  const placed = await handlers.place('bed', 'floor')
  expect(placed.ok).toBe(true)
  expect(placed.state.house?.placedDecors).toHaveLength(1)
  expect(placed.state.inventory.furniture?.bed).toBe(0)
  expect(publish).toHaveBeenLastCalledWith(placed.state)
  const item = placed.state.house!.placedDecors[0]
  const saved = await handlers.save([{ ...item, left: 50, top: 72 }])
  expect(saved.state.house?.placedDecors[0]).toMatchObject({ left: 50, top: 72 })
  const reopened = await createHouseHandlers(options).getState()
  expect(reopened.house).toEqual(saved.state.house)
  expect(reopened.inventory.furniture?.bed).toBe(0)
  const removed = await handlers.remove(item.instanceId)
  expect(removed.state.house?.placedDecors).toEqual([])
  expect(removed.state.inventory.furniture?.bed).toBe(1)
})
