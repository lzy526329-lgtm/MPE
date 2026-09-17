import { describe, expect, it } from 'vitest'
import { houseSurfaceAt, constrainHousePoint } from '../houseLayout'

describe('illustrated room surfaces', () => {
  it('maps the two walls and diamond floor to the reference image', () => {
    expect(houseSurfaceAt({ left: 25, top: 38 })).toBe('left-wall')
    expect(houseSurfaceAt({ left: 75, top: 38 })).toBe('right-wall')
    expect(houseSurfaceAt({ left: 50, top: 72 })).toBe('floor')
    expect(houseSurfaceAt({ left: 5, top: 5 })).toBeNull()
    expect(houseSurfaceAt({ left: 95, top: 90 })).toBeNull()
  })
  it('keeps a dragged anchor on its original surface', () => {
    expect(constrainHousePoint('floor', { left: 50, top: 72 })).toEqual({ left: 50, top: 72 })
    const constrained = constrainHousePoint('floor', { left: 5, top: 5 })
    expect(constrained.top).toBeGreaterThanOrEqual(40.5)
    expect(houseSurfaceAt(constrained)).toBe('floor')
  })
})
