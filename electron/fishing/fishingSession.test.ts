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
  it('allows reeling only inside the bite window', () => {
    const { manager, setNow } = setup()
    const cast = manager.start(7, 'basic')
    expect(cast).toMatchObject({ token: 'token-1', biteAt: 3_500, deadline: 23_500 })

    setNow(3_499)
    expect(manager.reel(7, cast.token)).toEqual({ status: 'too-early' })
    expect(manager.reel(7, cast.token)).toEqual({ status: 'invalid' })
  })

  it('returns progress during the fight and consumes the token on catch', () => {
    const { manager, setNow } = setup()
    const cast = manager.start(7, 'basic')
    let outcome: ReturnType<typeof manager.reel> = { status: 'invalid' }
    for (let index = 0; index < 15; index += 1) {
      setNow(cast.biteAt + index * 1_000)
      outcome = manager.reel(7, cast.token)
    }
    expect(outcome).toMatchObject({
      status: 'caught',
      catch: { id: 'token-1', fishId: 'crucian' },
      progress: 1,
    })
    expect(manager.reel(7, cast.token)).toEqual({ status: 'invalid' })
  })

  it('breaks a red line, recovers tension while waiting and isolates sessions by owner', () => {
    const { manager, setNow } = setup()
    const strained = manager.start(7, 'basic')
    setNow(strained.biteAt)
    expect(manager.reel(7, strained.token).status).toBe('continue')
    setNow(strained.biteAt)
    expect(manager.reel(7, strained.token).status).toBe('continue')
    setNow(strained.biteAt)
    expect(manager.reel(7, strained.token).status).toBe('continue')
    setNow(strained.biteAt)
    expect(manager.reel(7, strained.token)).toMatchObject({
      status: 'continue',
      tension: expect.any(Number),
    })
    setNow(strained.biteAt)
    expect(manager.reel(7, strained.token).status).toBe('continue')
    setNow(strained.biteAt)
    expect(manager.reel(7, strained.token)).toEqual({ status: 'line-broken' })

    const expired = manager.start(7, 'basic')
    setNow(expired.biteAt)
    manager.reel(7, expired.token)
    setNow(expired.biteAt + 2_400)
    expect(manager.reel(7, expired.token).status).toBe('continue')

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
    expect(manager.reel(7, second.token).status).toBe('continue')
  })
})
