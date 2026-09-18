import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentPage, navigateToPage, setupAppNavigation } from '../appNavigation'

function makeButton(pageId: string) {
  const classes = new Set<string>()
  return {
    hidden: true,
    textContent: pageId,
    dataset: { page: pageId },
    classList: {
      toggle: (name: string, active: boolean) => active ? classes.add(name) : classes.delete(name),
      contains: (name: string) => classes.has(name),
    },
    attributes: new Map<string, string>(),
    setAttribute(this: { attributes: Map<string, string> }, name: string, value: string) { this.attributes.set(name, value) },
    removeAttribute(this: { attributes: Map<string, string> }, name: string) { this.attributes.delete(name) },
    closest() { return this },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('global navigation', () => {
  it('keeps every menu entry visible and marks only the current page active', () => {
    const elements: Record<string, any> = {}
    for (const id of ['workspace-toolbar', 'workspace-title', 'workspace-eyebrow', 'pet-settings-nav']) {
      elements[`#${id}`] = { hidden: true, textContent: '', setAttribute() {}, removeAttribute() {}, addEventListener() {} }
    }
    const buttons = ['pet-settings-page', 'farm-page', 'image-page', 'account-page'].map(makeButton)
    const pages = ['pet-settings-page', 'pet-home-page', 'farm-page', 'image-page', 'account-page'].map((id) => ({ id, hidden: true }))
    vi.stubGlobal('document', {
      querySelector: (selector: string) => elements[selector] ?? null,
      querySelectorAll: (selector: string) => selector === '[data-page]' ? buttons : pages,
    })
    vi.stubGlobal('window', { electronAPI: {} })

    setupAppNavigation()
    expect(buttons.every((button) => button.hidden === false)).toBe(true)
    navigateToPage('farm-page')
    expect(buttons.every((button) => button.hidden === false)).toBe(true)
    expect(buttons.find((button) => button.dataset.page === 'farm-page')?.classList.contains('active')).toBe(true)
    expect(buttons.filter((button) => button.dataset.page !== 'farm-page').every((button) => !button.classList.contains('active'))).toBe(true)
    expect(elements['#pet-settings-nav'].hidden).toBe(false)
    navigateToPage('pet-home-page')
    expect(pages.find((page) => page.id === 'pet-home-page')?.hidden).toBe(false)
    expect(pages.find((page) => page.id === 'farm-page')?.hidden).toBe(true)
    expect(elements['#workspace-title'].textContent).toBe('个人小屋')
    navigateToPage('pet-settings-page')
    expect(getCurrentPage()).toBe('pet-settings-page')
  })

  it('opens the account page from the shared workspace navigation', () => {
    const elements: Record<string, any> = {}
    for (const id of ['workspace-toolbar', 'workspace-title', 'workspace-eyebrow', 'pet-settings-nav']) {
      elements[`#${id}`] = { hidden: true, textContent: '', setAttribute() {}, removeAttribute() {}, addEventListener() {} }
    }
    const pages = ['pet-settings-page', 'account-page'].map((id) => ({ id, hidden: true }))
    vi.stubGlobal('document', {
      querySelector: (selector: string) => elements[selector] ?? null,
      querySelectorAll: (selector: string) => selector === '[data-page]' ? [] : pages,
    })

    navigateToPage('account-page')

    expect(pages.find((page) => page.id === 'account-page')?.hidden).toBe(false)
    expect(elements['#workspace-title'].textContent).toBe('账号与同步')
  })

  it('ignores invalid page ids without changing the current page', () => {
    const pages = ['pet-settings-page', 'farm-page'].map((id) => ({ id, hidden: true }))
    vi.stubGlobal('document', {
      querySelector: () => null,
      querySelectorAll: (selector: string) => selector === '[data-page]' ? [] : pages,
    })
    navigateToPage('pet-settings-page')
    navigateToPage('not-a-page' as never)
    expect(getCurrentPage()).toBe('pet-settings-page')
  })

  it('delegates menu clicks and falls back for invalid main-process navigation', () => {
    let clickHandler: ((event: { target: unknown }) => void) | undefined
    let mainNavigateHandler: ((pageId: string) => void) | undefined
    const buttons = ['pet-settings-page', 'farm-page'].map(makeButton)
    const globalNav = {
      addEventListener: (_type: string, handler: (event: { target: unknown }) => void) => {
        clickHandler = handler
      },
    }
    const pages = ['pet-settings-page', 'farm-page'].map((id) => ({ id, hidden: true }))
    vi.stubGlobal('document', {
      querySelector: (selector: string) => selector === '#global-nav' ? globalNav : null,
      querySelectorAll: (selector: string) => selector === '[data-page]' ? buttons : pages,
    })
    vi.stubGlobal('window', {
      electronAPI: {
        onMainNavigate: (handler: (pageId: string) => void) => { mainNavigateHandler = handler },
      },
    })

    setupAppNavigation()
    clickHandler?.({ target: buttons[1] })
    expect(getCurrentPage()).toBe('farm-page')
    mainNavigateHandler?.('unknown-page')
    expect(getCurrentPage()).toBe('pet-settings-page')
  })
})
