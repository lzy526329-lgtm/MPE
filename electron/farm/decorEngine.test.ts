import { describe, expect, it } from 'vitest'

import { buyDecor } from './decorEngine'
import { createDefaultGameState, toGameViewState } from '../game/gameEngine'

describe('buyDecor max limit', () => {
  it('rejects buying room when already owning one in inventory', () => {
    const game = createDefaultGameState(1_000)
    game.wallet.coins = 500
    game.inventory.decors.room = 1
    const view = toGameViewState(game)

    const result = buyDecor(game, 'room', view)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('最多购买')
    expect(result.game.inventory.decors.room).toBe(1)
  })

  it('rejects buying goods when one is already placed', () => {
    const game = createDefaultGameState(1_000)
    game.wallet.coins = 500
    game.farm.placedDecors = [
      {
        instanceId: 'goods-1',
        decorId: 'goods',
        left: 10,
        top: 10,
        width: 12,
        zIndex: 1,
      },
    ]
    const view = toGameViewState(game)

    const result = buyDecor(game, 'goods', view)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('最多购买')
  })

  it('allows buying room when none owned', () => {
    const game = createDefaultGameState(1_000)
    game.wallet.coins = 500
    const view = toGameViewState(game)

    const result = buyDecor(game, 'room', view)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.game.inventory.decors.room).toBe(1)
    expect(result.game.wallet.coins).toBe(350)
  })
})
