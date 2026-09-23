import { describe, expect, it } from 'vitest'

import { PET_GAME_MENU } from './appPages'

describe('pet context gameplay menu', () => {
  it('shows farm and fishing pond entries in order', () => {
    expect(PET_GAME_MENU).toEqual([
      { id: 'farm-page', label: '农场' },
      { id: 'fishing-page', label: '鱼塘' },
      { id: 'animal-flip-page', label: '象狮虎豹' },
    ])
  })
})
