import { describe, expect, it } from 'vitest'

import { createDefaultGameState, toGameViewState } from '../electron/game/gameEngine'
import { nextTimedEvent, renderFishingPage } from './fishingPage'
import type { FishingUiState } from './fishingStateMachine'

describe('fishing page', () => {
  it('renders cast controls and selected bait while idle', () => {
    const view = toGameViewState(createDefaultGameState(1_000))
    view.inventory.baits.basic = 2
    const html = renderFishingPage(view, { phase: 'idle' }, 'basic', '')
    expect(html).toContain('普通鱼饵')
    expect(html).toContain('data-fishing-cast')
    expect(html).toContain('data-fishing-backpack-open')
    expect(html).toContain('图鉴 0 / 5')
    expect(html).toContain('×2')
  })

  it('maps current time to bite and timeout events', () => {
    const waiting: FishingUiState = {
      phase: 'waiting',
      baitId: 'basic',
      token: 't1',
      biteAt: 3_500,
      deadline: 4_700,
    }
    expect(nextTimedEvent(waiting, 3_499)).toBeNull()
    expect(nextTimedEvent(waiting, 3_500)).toEqual({ type: 'BITE_STARTED' })
    expect(nextTimedEvent({ ...waiting, phase: 'biting' }, 4_701)).toEqual({
      type: 'BITE_EXPIRED',
    })
  })

  it('opens a catalog with discovered fish details and hidden silhouettes', () => {
    const view = toGameViewState(createDefaultGameState(1_000))
    view.fishing.discoveredFish = ['crucian']

    const closed = renderFishingPage(view, { phase: 'idle' }, 'basic', '', false)
    expect(closed).toContain('data-fishing-catalog-open')
    expect(closed).not.toContain('aria-label="鱼类图鉴"')

    const opened = renderFishingPage(view, { phase: 'idle' }, 'basic', '', true)
    expect(opened).toContain('aria-label="鱼类图鉴"')
    expect(opened).toContain('鲫鱼')
    expect(opened).toContain('尚未发现')
    expect(opened).toContain('data-fishing-catalog-close')
  })
})
