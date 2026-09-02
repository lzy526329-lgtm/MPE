import { describe, expect, it } from 'vitest'
import { DREAM_LINES, pickCareLine, pickDreamLine } from './petCareLines'

describe('pickCareLine', () => {
  it('returns a feed line from the local pool', () => {
    const line = pickCareLine('feed')
    expect(line.length).toBeGreaterThan(0)
  })
})

describe('pickDreamLine', () => {
  it('returns a canned dream story', () => {
    const line = pickDreamLine(() => 0)
    expect(line).toBe(DREAM_LINES[0])
    expect(line.length).toBeGreaterThan(8)
  })

  it('picks from the dream pool', () => {
    const line = pickDreamLine(() => 0.99)
    expect(DREAM_LINES).toContain(line)
  })
})
