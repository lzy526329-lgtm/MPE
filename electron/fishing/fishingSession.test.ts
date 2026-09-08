import { describe, expect, it } from 'vitest'

import { createFishingSessionManager } from './fishingSession'

function setup() {
  let now = 1_000
  let sequence = 0
  const manager = createFishingSessionManager({
    now: () => now,
    rng: () => 0,
    randomUUID: () => `token-${++sequence}`,
  })
  return { manager, setNow: (value: number) => { now = value } }
}

describe('fishing session manager', () => {
  it('allows one reel only inside the bite window', () => {
    const { manager, setNow } = setup()
    const cast = manager.start(7, 'basic')
    expect(cast).toMatchObject({ token: 'token-1', biteAt: 3_500, deadline: 5_500 })

    setNow(3_499)
    expect(manager.reel(7, cast.token)).toEqual({ status: 'too-early' })
    expect(manager.reel(7, cast.token)).toEqual({ status: 'invalid' })
  })

  it('returns a catch during the window and consumes the token', () => {
    const { manager, setNow } = setup()
    const cast = manager.start(7, 'basic')
    setNow(cast.biteAt)
    expect(manager.reel(7, cast.token)).toMatchObject({
      status: 'caught',
      catch: { id: 'token-1', fishId: 'crucian' },
    })
    expect(manager.reel(7, cast.token)).toEqual({ status: 'invalid' })
  })

  it('expires, cancels and isolates sessions by owner', () => {
    const { manager, setNow } = setup()
    const expired = manager.start(7, 'basic')
    setNow(expired.deadline + 1)
    expect(manager.reel(7, expired.token)).toEqual({ status: 'too-late' })

    const isolated = manager.start(7, 'premium')
    expect(manager.reel(8, isolated.token)).toEqual({ status: 'invalid' })
    expect(manager.cancel(7, isolated.token)).toBe(true)
    expect(manager.reel(7, isolated.token)).toEqual({ status: 'invalid' })
  })

  it('replaces an owners previous session', () => {
    const { manager, setNow } = setup()
    const first = manager.start(7, 'basic')
    const second = manager.start(7, 'premium')
    expect(manager.reel(7, first.token)).toEqual({ status: 'invalid' })
    setNow(second.biteAt)
    expect(manager.reel(7, second.token).status).toBe('caught')
  })
})
