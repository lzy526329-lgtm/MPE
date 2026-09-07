import { describe, expect, it } from 'vitest'
import { canStartJump, rectsOverlap, stepJumpY } from './petJumpPhysics'
import { resolveJumpRunConfig } from './petSkillDefaults'

describe('petJumpPhysics', () => {
  it('rectsOverlap detects AABB collision with padding', () => {
    expect(
      rectsOverlap(
        { x: 0, y: 0, w: 40, h: 40 },
        { x: 30, y: 30, w: 20, h: 20 },
      ),
    ).toBe(true)
    expect(
      rectsOverlap(
        { x: 0, y: 0, w: 40, h: 40 },
        { x: 50, y: 0, w: 20, h: 20 },
      ),
    ).toBe(false)
  })

  it('canStartJump only when grounded', () => {
    expect(canStartJump(0, 0)).toBe(true)
    expect(canStartJump(-12, -400)).toBe(false)
    expect(canStartJump(0, -10)).toBe(false)
  })

  it('stepJumpY rises then lands on ground', () => {
    let y = 0
    let vy = -720
    const gravity = 2200
    // first frame lifts off
    ;({ y, vy } = stepJumpY(y, vy, gravity, 1 / 60))
    expect(y).toBeLessThan(0)
    // integrate until land
    for (let i = 0; i < 120; i++) {
      ;({ y, vy } = stepJumpY(y, vy, gravity, 1 / 60))
    }
    expect(y).toBe(0)
    expect(vy).toBe(0)
  })
})

describe('resolveJumpRunConfig', () => {
  it('uses defaults when character has no jump config', () => {
    const config = resolveJumpRunConfig(null)
    expect(config.gravity).toBeGreaterThan(1000)
    expect(config.jumpVelocity).toBeLessThan(0)
    expect(config.scrollSpeed).toBeGreaterThan(100)
    expect(config.spawnMinMs).toBeLessThan(config.spawnMaxMs)
  })

  it('merges character minigames.jumpRun overrides', () => {
    const config = resolveJumpRunConfig({
      skills: {},
      minigames: {
        jumpRun: {
          scrollSpeed: 420,
          jumpVelocity: -900,
          gravity: 2600,
          spawnMinMs: 700,
          spawnMaxMs: 1400,
        },
      },
    })
    expect(config.scrollSpeed).toBe(420)
    expect(config.jumpVelocity).toBe(-900)
    expect(config.gravity).toBe(2600)
    expect(config.spawnMinMs).toBe(700)
    expect(config.spawnMaxMs).toBe(1400)
  })
})
