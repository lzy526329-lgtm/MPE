import { describe, expect, it } from 'vitest'

import { commitFarmReminderLatches, decideFarmReminder, farmReminderId } from './farmReminders'

describe('decideFarmReminder', () => {
  it('returns null when nothing needs attention', () => {
    const result = decideFarmReminder({ needs: [], latches: {} })
    expect(result.decision).toBeNull()
    expect(result.latches).toEqual({})
  })

  it('picks harvest before bug and water', () => {
    const { decision, latches } = decideFarmReminder({
      needs: ['harvest', 'bug', 'water'],
      latches: {},
    })
    expect(decision?.kind).toBe('harvest')
    expect(decision?.text).toMatch(/熟|收/)
    expect(decision?.requireConfirm).toBe(false)
    expect(decision?.dismissAfterMs).toBe(8_000)
    expect(latches.harvest).toBe(true)
  })

  it('skips a latched kind and uses the next need', () => {
    const { decision } = decideFarmReminder({
      needs: ['harvest', 'bug'],
      latches: { harvest: true },
    })
    expect(decision?.kind).toBe('bug')
    expect(decision?.text).toMatch(/虫/)
  })

  it('clears latches once the need is gone so it can fire again later', () => {
    const { decision, latches } = decideFarmReminder({
      needs: ['water'],
      latches: { harvest: true, bug: true },
    })
    expect(decision?.kind).toBe('water')
    expect(latches).toEqual({ water: true })
  })

  it('returns cleared latches even when there is nothing to say', () => {
    const result = decideFarmReminder({
      needs: [],
      latches: { harvest: true },
    })
    expect(result.decision).toBeNull()
    expect(result.latches).toEqual({})
  })

  it('uses farm: ids so bubbles auto-dismiss without confirm', () => {
    expect(farmReminderId('harvest')).toBe('farm:harvest')
    expect(farmReminderId('bug')).toBe('farm:bug')
    expect(farmReminderId('water')).toBe('farm:water')
  })

  it('does not latch a new kind until the bubble is delivered', () => {
    const result = decideFarmReminder({ needs: ['harvest'], latches: {} })
    expect(commitFarmReminderLatches(result, false)).toEqual({})
    expect(commitFarmReminderLatches(result, true)).toEqual({ harvest: true })
  })

  it('still drops resolved latches when the next reminder is not delivered', () => {
    const result = decideFarmReminder({
      needs: ['water'],
      latches: { harvest: true },
    })
    expect(commitFarmReminderLatches(result, false)).toEqual({})
    expect(commitFarmReminderLatches(result, true)).toEqual({ water: true })
  })
})
