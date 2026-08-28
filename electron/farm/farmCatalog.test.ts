import { describe, expect, it } from 'vitest'
import { PLOT_COUNT } from './farmCatalog'

describe('farmCatalog', () => {
  it('PLOT_COUNT is 24 (4×6 isometric grid)', () => {
    expect(PLOT_COUNT).toBe(24)
  })
})
