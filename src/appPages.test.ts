import { describe, expect, it } from 'vitest'
import { APP_PAGE_TITLES, TOOL_PAGES } from './appPages'

describe('game pages', () => {
  it('registers shop and backpack outside the tools submenu', () => {
    expect(APP_PAGE_TITLES['shop-page']).toBe('商店')
    expect(APP_PAGE_TITLES['backpack-page']).toBe('背包')
    expect(TOOL_PAGES).not.toContain('shop-page')
    expect(TOOL_PAGES).not.toContain('backpack-page')
  })
})
