import { afterEach, describe, expect, it, vi } from 'vitest'
import { navigateToPage, setupAppNavigation } from './appNavigation'

afterEach(() => vi.unstubAllGlobals())

describe('personal house navigation', () => {
  it('keeps the house entry hidden at startup and after switching pages', () => {
    const elements: Record<string, { hidden: boolean; textContent: string }> = {}
    for (const id of ['workspace-toolbar', 'workspace-title', 'pet-settings-nav', 'open-pet-chat', 'open-pet-home']) {
      elements[`#${id}`] = { hidden: true, textContent: '' }
    }
    const pages = ['pet-settings-page', 'pet-home-page', 'farm-page'].map((id) => ({ id, hidden: true }))
    vi.stubGlobal('document', {
      querySelector: (selector: string) => elements[selector] ?? null,
      querySelectorAll: () => pages,
    })
    vi.stubGlobal('window', { electronAPI: {} })

    setupAppNavigation()
    expect(elements['#open-pet-home'].hidden).toBe(true)
    navigateToPage('farm-page')
    expect(elements['#open-pet-home'].hidden).toBe(true)
    navigateToPage('pet-home-page')
    expect(pages.find((page) => page.id === 'pet-home-page')?.hidden).toBe(false)
    expect(pages.find((page) => page.id === 'farm-page')?.hidden).toBe(true)
    expect(elements['#workspace-title'].textContent).toBe('个人小屋')
    navigateToPage('pet-settings-page')
    expect(elements['#open-pet-home'].hidden).toBe(true)
  })
})
