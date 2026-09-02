import { describe, expect, it } from 'vitest'
import { pickAnimationName, preferredSleepAnimation } from './petAnimationNames'

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
})
