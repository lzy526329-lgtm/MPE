import { describe, expect, it } from 'vitest'
import { PLOT_COUNT } from './farmCatalog'

describe('farmCatalog', () => {
  it('PLOT_COUNT is 6', () => {
    expect(PLOT_COUNT).toBe(6)
  })
})
