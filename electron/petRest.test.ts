import { describe, expect, it } from 'vitest'
import {
  DREAM_REMINDER_ID,
  REST_HEALTH_INTERVAL_MS,
  advanceRestHealth,
  isDreamReminderId,
  isPetResting,
  tickRestingVitals,
} from './petRest'

describe('isPetResting', () => {
  it('treats a positive timestamp as resting', () => {
    expect(isPetResting(1_700_000_000_000)).toBe(true)
  })

  it('treats missing timestamps as awake', () => {
    expect(isPetResting(undefined)).toBe(false)
    expect(isPetResting(null)).toBe(false)
    expect(isPetResting(0)).toBe(false)
  })
})

describe('advanceRestHealth', () => {
  it('gains 1 health every 6 seconds', () => {
    expect(advanceRestHealth(10, REST_HEALTH_INTERVAL_MS)).toBe(11)
    expect(advanceRestHealth(10, REST_HEALTH_INTERVAL_MS * 3)).toBe(13)
  })

  it('caps health at 100', () => {
    expect(advanceRestHealth(99, REST_HEALTH_INTERVAL_MS * 10)).toBe(100)
  })

  it('does not change health when no time has passed', () => {
    expect(advanceRestHealth(40, 0)).toBe(40)
    expect(advanceRestHealth(40, -100)).toBe(40)
  })
})

describe('tickRestingVitals', () => {
  it('recovers health and leaves satiety, hygiene, and mood bonus unchanged', () => {
    const next = tickRestingVitals(
      { health: 20, satiety: 55, hygiene: 40, moodBonus: 8 },
      REST_HEALTH_INTERVAL_MS * 2,
    )
    expect(next).toEqual({
      health: 22,
      satiety: 55,
      hygiene: 40,
      moodBonus: 8,
    })
  })
})

describe('dream reminder id', () => {
  it('identifies the wake-up dream bubble', () => {
    expect(isDreamReminderId(DREAM_REMINDER_ID)).toBe(true)
    expect(isDreamReminderId('proactive:weak')).toBe(false)
    expect(isDreamReminderId(undefined)).toBe(false)
  })
})
