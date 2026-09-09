import type { BaitId, FishCatch } from '../electron/fishing/fishingTypes'

export type FishingFailureReason =
  | 'too-early'
  | 'too-late'
  | 'line-broken'
  | 'cancelled'
  | 'error'

export type FishingFightState = {
  progress: number
  tension: number
  tensionAt: number
  fishPull: number
}

export type FishingUiState =
  | { phase: 'idle' }
  | { phase: 'casting'; baitId: BaitId }
  | { phase: 'waiting'; baitId: BaitId; token: string; biteAt: number; deadline: number }
  | {
      phase: 'biting'
      baitId: BaitId
      token: string
      deadline: number
      fight?: FishingFightState
    }
  | {
      phase: 'resolving'
      token: string
      baitId?: BaitId
      deadline?: number
      fight?: FishingFightState
    }
  | { phase: 'caught'; catch: FishCatch }
  | { phase: 'failed'; reason: FishingFailureReason }

export type FishingUiEvent =
  | { type: 'CAST_REQUESTED'; baitId: BaitId }
  | { type: 'CAST_ACCEPTED'; token: string; biteAt: number; deadline: number }
  | { type: 'BITE_STARTED' }
  | { type: 'BITE_EXPIRED' }
  | { type: 'REEL_REQUESTED' }
  | { type: 'REEL_CONTINUED'; fight: FishingFightState }
  | { type: 'REEL_CAUGHT'; catch: FishCatch }
  | { type: 'REEL_FAILED'; reason: FishingFailureReason }
  | { type: 'RESET' }

export function reduceFishingState(
  state: FishingUiState,
  event: FishingUiEvent,
): FishingUiState {
  if (state.phase === 'idle' && event.type === 'CAST_REQUESTED') {
    return { phase: 'casting', baitId: event.baitId }
  }
  if (state.phase === 'casting' && event.type === 'CAST_ACCEPTED') {
    return {
      phase: 'waiting',
      baitId: state.baitId,
      token: event.token,
      biteAt: event.biteAt,
      deadline: event.deadline,
    }
  }
  if (state.phase === 'waiting' && event.type === 'BITE_STARTED') {
    return {
      phase: 'biting',
      baitId: state.baitId,
      token: state.token,
      deadline: state.deadline,
      fight: {
        progress: 0,
        tension: 0,
        tensionAt: state.biteAt,
        fishPull: 0,
      },
    }
  }
  if (state.phase === 'biting' && event.type === 'BITE_EXPIRED') {
    return { phase: 'failed', reason: 'too-late' }
  }
  if ((state.phase === 'waiting' || state.phase === 'biting') && event.type === 'REEL_REQUESTED') {
    return {
      phase: 'resolving',
      token: state.token,
      baitId: state.baitId,
      deadline: state.deadline,
      fight: state.phase === 'biting' ? state.fight : undefined,
    }
  }
  if (state.phase === 'resolving' && event.type === 'REEL_CONTINUED') {
    return {
      phase: 'biting',
      baitId: state.baitId ?? 'basic',
      token: state.token,
      deadline: state.deadline ?? 0,
      fight: event.fight,
    }
  }
  if (state.phase === 'resolving' && event.type === 'REEL_CAUGHT') {
    return { phase: 'caught', catch: event.catch }
  }
  if (
    (state.phase === 'casting' ||
      state.phase === 'waiting' ||
      state.phase === 'biting' ||
      state.phase === 'resolving') &&
    event.type === 'REEL_FAILED'
  ) {
    return { phase: 'failed', reason: event.reason }
  }
  if ((state.phase === 'caught' || state.phase === 'failed') && event.type === 'RESET') {
    return { phase: 'idle' }
  }
  return state
}
