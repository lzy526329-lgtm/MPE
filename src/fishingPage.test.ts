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
})
