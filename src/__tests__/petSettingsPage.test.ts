import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountPetSettingsPage } from '../petSettingsPage'

afterEach(() => vi.unstubAllGlobals())

describe('pet settings shell', () => {
  it('renders an internal settings layout and preserves all six panels', () => {
    const root = {
      innerHTML: '',
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    }
    vi.stubGlobal('document', {
      querySelector: (selector: string) => selector === '#pet-settings-root' ? root : null,
      querySelectorAll: () => [],
      activeElement: null,
    })
    vi.stubGlobal('window', { electronAPI: { getPetCharacters: async () => [] } })

    mountPetSettingsPage()

    expect(root.innerHTML).toContain('pet-settings-layout')
    expect(root.innerHTML).toContain('pet-settings-tabs')
    expect(root.innerHTML.match(/data-pet-tab=/g)).toHaveLength(6)
    expect(root.innerHTML.match(/data-pet-panel=/g)).toHaveLength(6)
  })
})
