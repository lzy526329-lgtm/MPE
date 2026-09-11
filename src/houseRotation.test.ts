import { describe, expect, it } from 'vitest'

describe('house rotation values', () => {
  it('wraps rotation through a full turn', () => {
    expect((0 - 15 + 360) % 360).toBe(345)
    expect((345 + 15) % 360).toBe(0)
  })
})
