import { afterEach, expect, it, vi } from 'vitest'
import { TOOL_PAGES } from '../appPages'
import { getCurrentPage } from '../appNavigation'
import { mountToolboxPage } from '../toolboxPage'

afterEach(() => vi.unstubAllGlobals())

it('provides a working card for every existing tool', () => {
  let click: (event: Event) => void = () => {}
  const root = {
    innerHTML: '',
    addEventListener: (_type: string, listener: typeof click) => { click = listener },
  }
  const pages = ['toolbox-page', ...TOOL_PAGES].map(id => ({ id, hidden: true }))
  vi.stubGlobal('document', {
    querySelector: (selector: string) => selector === '#toolbox-root' ? root : null,
    querySelectorAll: (selector: string) => selector === '.tool-page' ? pages : [],
  })
  mountToolboxPage()
  const renderedIds = [...root.innerHTML.matchAll(/data-tool-page="([^"]+)"/g)].map(match => match[1])
  expect(renderedIds.sort()).toEqual([...TOOL_PAGES].sort())
  for (const toolPage of renderedIds) {
    click({ target: { closest: () => ({ dataset: { toolPage } }) } } as unknown as Event)
    expect(getCurrentPage()).toBe(toolPage)
    expect(pages.filter(page => !page.hidden).map(page => page.id)).toEqual([toolPage])
  }
})
