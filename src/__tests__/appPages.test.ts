import { describe, expect, it } from 'vitest'
import {
  APP_PAGE_DEFINITIONS,
  APP_PAGE_TITLES,
  TOOL_PAGES,
  getAppPageDefinition,
} from '../appPages'

describe('game pages', () => {
  it('exposes one toolbox entry while keeping individual tools available as pages', () => {
    expect(Object.values(APP_PAGE_DEFINITIONS)
      .filter(page => page.group === 'tool' && page.showInGlobalNav)
      .map(page => page.id)).toEqual(['toolbox-page'])
    for (const id of TOOL_PAGES) expect(getAppPageDefinition(id)?.title).toBeTruthy()
  })

  it('registers shop and backpack outside the tools submenu', () => {
    expect(APP_PAGE_TITLES['shop-page']).toBe('商店')
    expect(APP_PAGE_TITLES['backpack-page']).toBe('背包')
    expect(APP_PAGE_TITLES['fishing-page']).toBe('鱼塘')
    expect(APP_PAGE_TITLES['animal-flip-page']).toBe('象狮虎豹')
    expect(TOOL_PAGES).not.toContain('shop-page')
    expect(TOOL_PAGES).not.toContain('backpack-page')
    expect(TOOL_PAGES).not.toContain('fishing-page')
    expect(TOOL_PAGES).not.toContain('animal-flip-page')
  })

  it('provides one definition for every page with stable groups', () => {
    const pageIds = Object.keys(APP_PAGE_TITLES)
    expect(Object.keys(APP_PAGE_DEFINITIONS)).toEqual(expect.arrayContaining(pageIds))
    expect(Object.keys(APP_PAGE_DEFINITIONS)).toHaveLength(pageIds.length)
    expect(getAppPageDefinition('farm-page')?.group).toBe('play')
    expect(getAppPageDefinition('animal-flip-page')?.group).toBe('play')
    expect(getAppPageDefinition('image-page')?.group).toBe('tool')
    expect(getAppPageDefinition('account-page')?.group).toBe('account')
    expect(getAppPageDefinition('friend-page')?.title).toBe('好友')
    expect(getAppPageDefinition('friend-page')?.group).toBe('account')
    expect(getAppPageDefinition('pet-settings-page')?.showInGlobalNav).toBe(true)
  })
})
