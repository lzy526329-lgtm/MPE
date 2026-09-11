import { describe, expect, it } from 'vitest'

import { createFishingSessionManager, LINE_RED_WINDOW_MS } from './fishingSession'

function setup(rng: () => number = () => 0) {
  let now = 1_000
  let sequence = 0
  const manager = createFishingSessionManager({
    now: () => now,
    rng,
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
    for (let index = 0; index < 100; index += 1) {
      setNow(cast.biteAt + index * 250)
      outcome = manager.reel(7, cast.token)
      if (outcome.status === 'caught') break
    }
    expect(outcome).toMatchObject({
      status: 'caught',
      catch: { id: 'token-1', fishId: 'crucian' },
      progress: 1,
    })
    expect(manager.reel(7, cast.token)).toEqual({ status: 'invalid' })
  })

  it('randomly turns the line red and breaks at the end of the two-second buffer', () => {
    const rolls = [0, 0, 0, 0, 0.99, 0]
    const { manager, setNow } = setup(() => rolls.shift() ?? 0)
    const cast = manager.start(7, 'basic')

    setNow(cast.biteAt)
    expect(manager.reel(7, cast.token)).toMatchObject({
      status: 'continue',
      deadline: cast.deadline + LINE_RED_WINDOW_MS,
      lineDangerUntil: cast.biteAt + 3_000,
      lineRecoveryUntil: cast.biteAt + 3_700,
      lineRecoveryStatus: 'safe',
    })
    setNow(cast.biteAt + 1_999)
    expect(manager.reel(7, cast.token)).toMatchObject({
      status: 'continue',
      deadline: cast.deadline + LINE_RED_WINDOW_MS,
    })
    setNow(cast.biteAt + 2_000)
    expect(manager.reel(7, cast.token)).toEqual({ status: 'line-broken' })
  })

  it.each([
    [0.8999, false],
    [0.9, true],
  ])('uses the upper ten percent of random rolls for red lines: %s', (roll, triggersRed) => {
    const rolls = [0, 0, 0, 0, roll]
    const { manager, setNow } = setup(() => rolls.shift() ?? 0)
    const cast = manager.start(7, 'basic')
    setNow(cast.biteAt)
    expect(manager.reel(7, cast.token)).toMatchObject({
      status: 'continue',
      lineDangerUntil: triggersRed ? cast.biteAt + 3_000 : 0,
    })
  })

  it('lets a red line recover at three seconds and isolates sessions by owner', () => {
    const rolls = [0, 0, 0, 0, 0.99, 0, 0, 0]
    const { manager, setNow } = setup(() => rolls.shift() ?? 0)
    const recovered = manager.start(7, 'basic')
    setNow(recovered.biteAt)
    expect(manager.reel(7, recovered.token).status).toBe('continue')
    setNow(recovered.biteAt + 3_000)
    expect(manager.reel(7, recovered.token)).toMatchObject({
      status: 'continue',
      lineDangerUntil: recovered.biteAt + 3_000,
      lineRecoveryUntil: recovered.biteAt + 3_700,
    })
    setNow(recovered.biteAt + 3_701)
    expect(manager.reel(7, recovered.token)).toMatchObject({
      status: 'continue',
      lineDangerUntil: 0,
      lineRecoveryUntil: 0,
    })

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

  it('allows a catch after many mandatory red pauses exceed the original deadline', () => {
    let roll = 0
    const { manager, setNow } = setup(() => roll)
    const cast = manager.start(7, 'basic')
    roll = 0.99
    let now = cast.biteAt
    let deadline = cast.deadline
    let previousDangerUntil = 0
    let pauses = 0
    let caught = false
    for (let tick = 0; tick < 100; tick += 1) {
      setNow(now)
      const result = manager.reel(7, cast.token)
      expect(['continue', 'caught']).toContain(result.status)
      if (result.status !== 'continue' && result.status !== 'caught') break
      if (result.lineDangerUntil > now && result.lineDangerUntil !== previousDangerUntil) {
        pauses += 1
        deadline += LINE_RED_WINDOW_MS
      }
      expect(result.deadline).toBe(deadline)
      previousDangerUntil = result.lineDangerUntil
      if (result.status === 'caught') {
        caught = true
        break
      }
      now = Math.max(now + 220, result.lineDangerUntil)
    }
    expect(pauses).toBeGreaterThan(3)
    expect(now).toBeGreaterThan(cast.deadline)
    expect(caught).toBe(true)
  })

  it('still expires after the usable reeling time runs out', () => {
    const rolls = [0, 0, 0, 0, 0.99, 0]
    const { manager, setNow } = setup(() => rolls.shift() ?? 0)
    const cast = manager.start(7, 'basic')
    setNow(cast.biteAt)
    manager.reel(7, cast.token)
    setNow(cast.deadline + LINE_RED_WINDOW_MS + 1)
    expect(manager.reel(7, cast.token)).toEqual({ status: 'too-late' })
  })
})
