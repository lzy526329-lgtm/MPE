import { describe, expect, it } from 'vitest'

import { reduceFishingState, type FishingUiState } from './fishingStateMachine'
import { nextTimedEvent } from './fishingPage'

describe('fishing UI state machine', () => {
  it('moves through casting, waiting, biting and resolving', () => {
    let state: FishingUiState = { phase: 'idle' }
    state = reduceFishingState(state, { type: 'CAST_REQUESTED', baitId: 'basic' })
    expect(state.phase).toBe('casting')
    state = reduceFishingState(state, {
      type: 'CAST_ACCEPTED',
      token: 't1',
      biteAt: 3_500,
      deadline: 4_700,
    })
    expect(state.phase).toBe('waiting')
    state = reduceFishingState(state, { type: 'BITE_STARTED' })
    expect(state.phase).toBe('biting')
    state = reduceFishingState(state, { type: 'REEL_REQUESTED' })
    expect(state.phase).toBe('resolving')
    state = reduceFishingState(state, {
      type: 'REEL_CONTINUED',
      deadline: 6_700,
      fight: {
        progress: 0.2,
        tension: 0.3,
        tensionAt: 3_600,
        fishPull: 0.5,
        lineDangerUntil: 0,
        lineRecoveryUntil: 0,
        lineRecoveryStatus: 'safe',
      },
    })
    expect(state).toMatchObject({
      phase: 'biting',
      baitId: 'basic',
      token: 't1',
      deadline: 6_700,
      fight: { progress: 0.2, tension: 0.3 },
    })
    expect(nextTimedEvent(state, 4_701)).toBeNull()
    expect(nextTimedEvent(state, 6_701)).toEqual({ type: 'BITE_EXPIRED' })
  })

  it('ignores reel requests from idle', () => {
    const state: FishingUiState = { phase: 'idle' }
    expect(reduceFishingState(state, { type: 'REEL_REQUESTED' })).toBe(state)
  })

  it('moves results to caught or failed and resets them', () => {
    const resolving: FishingUiState = { phase: 'resolving', token: 't1' }
    const caught = reduceFishingState(resolving, {
      type: 'REEL_CAUGHT',
      catch: { id: 'a', fishId: 'crucian', quality: 'white', weightKg: 0.4, sellPrice: 3, caughtAt: 1 },
    })
    expect(caught.phase).toBe('caught')
    expect(reduceFishingState(caught, { type: 'RESET' })).toEqual({ phase: 'idle' })
  })
})
