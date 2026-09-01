import { describe, expect, it } from 'vitest'

import { FARM_LEVEL_CAP } from './farmLevelCatalog'
import { INITIAL_UNLOCKED_PLOTS, PLOT_COUNT, plotUnlockRequirement } from './farmCatalog'

describe('farmCatalog', () => {
  it('PLOT_COUNT is 24 (4×6 isometric grid)', () => {
    expect(PLOT_COUNT).toBe(24)
  })

  it('starts with 6 unlocked plots and 18 level-gated plots', () => {
    expect(INITIAL_UNLOCKED_PLOTS).toBe(6)
    expect(PLOT_COUNT - INITIAL_UNLOCKED_PLOTS).toBe(18)
    expect(FARM_LEVEL_CAP).toBe(18)
  })

  it('requires farm level 1 through 18 for each locked plot in order', () => {
    expect(plotUnlockRequirement(5)).toBeNull()
    expect(plotUnlockRequirement(6)?.level).toBe(1)
    expect(plotUnlockRequirement(11)?.level).toBe(6)
    expect(plotUnlockRequirement(23)?.level).toBe(18)
  })
})
