import { describe, expect, it } from 'vitest'
import { normalizeHouseEdit } from './houseEdit'

describe('house furniture editing', () => {
  it('clamps layer and keeps mirror state', () => {
    expect(normalizeHouseEdit({ zIndex: 99, flipX: true })).toEqual({ zIndex: 30, flipX: true })
    expect(normalizeHouseEdit({ zIndex: -2, flipX: false })).toEqual({ zIndex: 0, flipX: false })
  })
})
