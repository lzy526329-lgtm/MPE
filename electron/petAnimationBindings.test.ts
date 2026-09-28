import { describe, expect, it } from 'vitest'
import {
  ANIMATION_ACTIONS,
  defaultAnimationBindings,
  mergeAnimationBindings,
  sanitizeAnimationBindings,
  setAnimationBinding,
} from './petAnimationBindings'

describe('petAnimationBindings', () => {
  it('keeps only known actions and non-empty animation names', () => {
    expect(sanitizeAnimationBindings({
      run: 'walk',
      jump: 'unknown',
      '': 'idle',
      sleep: 'sleep',
    })).toEqual({ run: 'walk', sleep: 'sleep' })
  })

  it('updates one animation binding and removes it when cleared', () => {
    const next = setAnimationBinding({ run: 'walk' }, 'jump', 'victory')
    expect(next).toEqual({ run: 'walk', jump: 'victory' })
    expect(setAnimationBinding(next, 'run', '')).toEqual({ jump: 'victory' })
  })

  it('keeps one animation per action so a later choice replaces the earlier one', () => {
    expect(setAnimationBinding({ run: 'walk' }, 'sprint', 'walk')).toEqual({ sprint: 'walk' })
  })

  it('shares the same action ids as the renderer choices', () => {
    expect(ANIMATION_ACTIONS.map((item) => item.id)).toContain('skill_touch')
  })

  it('derives the legacy default action from familiar animation names', () => {
    expect(defaultAnimationBindings(['run', 'shuijiao', 'skill_01', 'skill_01_2', 'custom'])).toEqual({
      run: 'walk',
      shuijiao: 'sleep',
      skill_01: 'victory',
    })
  })

  it('lets an explicit binding replace the inferred default for the same action', () => {
    expect(mergeAnimationBindings(
      { run: 'walk' },
      { sprint: 'walk' },
    )).toEqual({ sprint: 'walk' })
  })
})
