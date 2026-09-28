import { describe, expect, it } from 'vitest'
import {
  ANIMATION_ACTIONS,
  pickAnimationName,
  preferredSleepAnimation,
  resolveAnimationForAction,
} from '../petAnimationNames'

describe('petAnimationNames', () => {
  it('picks the first candidate that exists', () => {
    expect(pickAnimationName(['idle', 'run', 'shuijiao'], ['sleep', 'shuijiao', 'rest'])).toBe(
      'shuijiao',
    )
  })

  it('prefers shuijiao for rest/sleep', () => {
    expect(preferredSleepAnimation(['idle', 'victory', 'shuijiao'])).toBe('shuijiao')
  })

  it('falls back when sleep animation is missing', () => {
    expect(preferredSleepAnimation(['idle', 'victory'])).toBeNull()
  })

  it('uses a configured action binding before the legacy candidate names', () => {
    expect(resolveAnimationForAction(
      ['idle', 'run', 'jump'],
      { run: 'walk', jump: 'victory' },
      'walk',
      ['run'],
    )).toBe('run')
    expect(resolveAnimationForAction(
      ['idle', 'run'],
      { run: 'attack' },
      'walk',
      ['run'],
    )).toBe('run')
  })

  it('exposes stable user-facing animation action choices', () => {
    expect(ANIMATION_ACTIONS.map((item) => item.id)).toEqual([
      'idle',
      'walk',
      'sleep',
      'touch',
      'skill_touch',
      'victory',
      'attack',
      'hurt',
      'die',
    ])
  })
})
