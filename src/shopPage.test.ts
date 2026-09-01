import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameErrorCode, GameViewState } from '../electron/game/gameTypes'
import { withFoodCounts } from '../electron/game/foodCatalog'
import { withSupplyCounts } from '../electron/game/supplyCatalog'
import { withSeedCounts } from '../electron/farm/cropCatalog'
import { canBuySeed, formatGrowDuration, gameErrorMessage, renderShopPage } from './shopPage'

const navigation = vi.hoisted(() => ({
  currentPage: 'pet-settings-page',
  pageListener: null as ((pageId: string) => void) | null,
}))

vi.mock('./appNavigation', () => ({
  getCurrentPage: () => navigation.currentPage,
  onPageChange: (listener: (pageId: string) => void) => {
    navigation.pageListener = listener
    return () => undefined
  },
}))

const state: GameViewState = {
  wallet: { coins: 100 },
  inventory: {
    food: withFoodCounts({}),
    supplies: withSupplyCounts({}),
    seeds: withSeedCounts({ wheat: 5 }),
    produce: {},
  },
  seedOffers: [{ cropId: 'wheat', name: '小麦种子', price: 5 }],
  produceOffers: [{ produceId: 'wheat', name: '小麦', price: 4 }],
  foodOffers: [{ foodId: 'cookie', name: '饼干', price: 3, satiety: 12 }],
  supplyOffers: [{ supplyId: 'bodyWash', name: '沐浴露', price: 5, hygiene: 40 }],
}

const defaultOptions = {
  activeTab: 'seeds' as const,
  busyCropId: null,
  busyFoodId: null,
  busySupplyId: null,
  error: null,
}

describe('shop page rendering', () => {
  it('renders coins, the wheat offer and owned seed counts', () => {
    const html = renderShopPage(state, defaultOptions)

    expect(html).toContain('100 金币')
    expect(html).toContain('小麦种子')
    expect(html).toContain('5 金币')
    expect(html).toContain('拥有 5')
    expect(html).toContain('成熟约 20 分钟')
    expect(html).toContain('shopImg-cutout.png')
  })

  it('formats grow duration for minutes and hours', () => {
    expect(formatGrowDuration(20 * 60_000)).toBe('成熟约 20 分钟')
    expect(formatGrowDuration(60 * 60_000)).toBe('成熟约 1 小时')
    expect(formatGrowDuration(90 * 60_000)).toBe('成熟约 1 小时 30 分钟')
  })

  it('renders the confirmed normal purchase label on every offer', () => {
    const html = renderShopPage(state, defaultOptions)

    expect(html.match(/>购买 1 颗<\/button>/g) ?? []).toHaveLength(1)
  })

  it('disables an offer when coins are insufficient', () => {
    const lowCoinState = { ...state, wallet: { coins: 4 } }

    expect(renderShopPage(lowCoinState, defaultOptions)).toContain(
      'data-buy-seed="wheat" disabled',
    )
    expect(renderShopPage(lowCoinState, defaultOptions)).toContain('金币不足')
  })

  it('disables every offer and marks the selected offer while buying', () => {
    const html = renderShopPage(state, { ...defaultOptions, busyCropId: 'wheat' })

    expect(html.match(/data-buy-seed="[^"]+" disabled/g)).toHaveLength(1)
    expect(html).toContain('购买中…')
  })

  it('renders food offers with price and satiety in the food tab', () => {
    const html = renderShopPage(state, { ...defaultOptions, activeTab: 'food' })

    expect(html).toContain('饼干')
    expect(html).toContain('3 金币')
    expect(html).toContain('+12 饱食度')
    expect(html).toContain('./foods/%E9%A5%BC%E5%B9%B2.png')
    expect(html).toContain('data-buy-food="cookie"')
    expect(html).toContain('购买 1 份')
  })

  it('renders supply offers with price and hygiene in the supplies tab', () => {
    const html = renderShopPage(state, { ...defaultOptions, activeTab: 'supplies' })

    expect(html).toContain('沐浴露')
    expect(html).toContain('5 金币')
    expect(html).toContain('+40 卫生')
    expect(html).toContain('%E6%B2%90%E6%B5%B4%E9%9C%B2-cutout.png')
    expect(html).toContain('data-buy-supply="bodyWash"')
    expect(html).toContain('购买 1 份')
  })

  it('disables a food offer while buying', () => {
    const html = renderShopPage(state, {
      ...defaultOptions,
      activeTab: 'food',
      busyFoodId: 'cookie',
    })

    expect(html).toContain('data-buy-food="cookie" disabled')
    expect(html).toContain('购买中…')
  })

  it('escapes offer names before inserting them into markup', () => {
    const unsafeState: GameViewState = {
      ...state,
      seedOffers: [{ cropId: 'wheat', name: '<img src=x onerror=alert(1)>', price: 5 }],
    }

    const html = renderShopPage(unsafeState, defaultOptions)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('shop purchase rules', () => {
  it('allows a purchase when coins equal the price', () => {
    expect(canBuySeed(10, 10)).toBe(true)
  })

  it('rejects a purchase when coins are below the price', () => {
    expect(canBuySeed(9, 10)).toBe(false)
  })
})

describe('shop error messages', () => {
  it.each<[GameErrorCode, string]>([
    ['UNKNOWN_ITEM', '商品不存在，请刷新后重试。'],
    ['INSUFFICIENT_COINS', '金币不足，无法购买。'],
    ['INSUFFICIENT_STOCK', '库存不足，无法出售。'],
    ['INVALID_STATE', '游戏数据异常，请重试。'],
    ['PERSISTENCE_FAILED', '保存失败，请重试。'],
  ])('maps %s to a safe Chinese message', (code, expected) => {
    expect(gameErrorMessage(code)).toBe(expected)
  })
})

type FakeElement = {
  dataset: Record<string, string>
  classList: { toggle: (token: string, force: boolean) => void; tokens: Set<string> }
  setAttribute: (name: string, value: string) => void
  attributes: Record<string, string>
  disabled?: boolean
  closest: (selector: string) => FakeElement | null
}

function fakeElement(dataset: Record<string, string>): FakeElement {
  const tokens = new Set<string>()
  const attributes: Record<string, string> = {}
  const element: FakeElement = {
    dataset,
    attributes,
    classList: {
      tokens,
      toggle: (token, force) => {
        if (force) tokens.add(token)
        else tokens.delete(token)
      },
    },
    setAttribute: (name, value) => {
      attributes[name] = value
    },
    closest: () => null,
  }
  return element
}

type FakeRoot = {
  root: Record<string, unknown>
  writes: string[]
  tabs: FakeElement[]
  panes: FakeElement[]
  clickHandler: () => ((event: unknown) => void) | undefined
}

function fakeRoot(): FakeRoot {
  const writes: string[] = []
  const tabs = ['seeds', 'food'].map((name) => fakeElement({ gameTab: name }))
  const panes = ['seeds', 'food'].map((name) => fakeElement({ gamePane: name }))
  const listeners: ((event: unknown) => void)[] = []
  const root = {
    get innerHTML() {
      return writes.length ? writes[writes.length - 1] : ''
    },
    set innerHTML(value: string) {
      writes.push(value)
    },
    addEventListener: (_type: string, listener: (event: unknown) => void) => {
      listeners.push(listener)
    },
    querySelectorAll: (selector: string) => (selector === '.game-tab' ? tabs : panes),
  }
  return { root, writes, tabs, panes, clickHandler: () => listeners[0] }
}

class ElementStub {
  closest: (selector: string) => unknown

  constructor(closest: (selector: string) => unknown) {
    this.closest = closest
  }
}

async function mountShop(options: {
  currentPage?: string
  gameGetState?: () => Promise<GameViewState>
  gameBuySeed?: () => Promise<unknown>
} = {}) {
  navigation.currentPage = options.currentPage ?? 'pet-settings-page'
  const dom = fakeRoot()
  const gameGetState = vi.fn(options.gameGetState ?? (() => Promise.resolve(state)))
  const gameBuySeed = vi.fn(options.gameBuySeed ?? (() => Promise.resolve({ ok: true, state })))
  const events: { stateListener: ((next: GameViewState) => void) | null } = {
    stateListener: null,
  }
  const onGameStateChanged = vi.fn((listener: (next: GameViewState) => void) => {
    events.stateListener = listener
    return () => undefined
  })

  vi.stubGlobal('Element', ElementStub)
  vi.stubGlobal('document', {
    querySelector: (selector: string) => (selector === '#shop-root' ? dom.root : null),
  })
  vi.stubGlobal('window', {
    electronAPI: { gameGetState, gameBuySeed, onGameStateChanged },
  })

  const { mountShopPage } = await import('./shopPage')
  mountShopPage()

  return { dom, gameGetState, gameBuySeed, onGameStateChanged, events }
}

describe('shop live synchronization', () => {
  beforeEach(() => {
    vi.resetModules()
    navigation.pageListener = null
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    navigation.pageListener = null
    navigation.currentPage = 'pet-settings-page'
  })

  it('renders a neutral placeholder instead of a load failure before the first request', async () => {
    const { dom, gameGetState } = await mountShop()

    expect(gameGetState).not.toHaveBeenCalled()
    expect(dom.root.innerHTML).not.toContain('加载失败')
    expect(dom.root.innerHTML).not.toContain('重试')
    expect(dom.root.innerHTML).toContain('data-shop-idle')
  })

  it('loads immediately when the shop is already visible at mount', async () => {
    const { dom, gameGetState, onGameStateChanged } = await mountShop({
      currentPage: 'shop-page',
    })

    expect(gameGetState).toHaveBeenCalledTimes(1)
    expect(onGameStateChanged).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(dom.root.innerHTML).toContain('100 金币'))
  })

  it('keeps a visible broadcast when an older state request resolves later', async () => {
    const control: { resolve: ((value: GameViewState) => void) | null } = { resolve: null }
    const pending = new Promise<GameViewState>((resolve) => {
      control.resolve = resolve
    })
    const { dom, gameGetState, events } = await mountShop({
      currentPage: 'shop-page',
      gameGetState: () => pending,
    })

    expect(gameGetState).toHaveBeenCalledTimes(1)
    expect(dom.root.innerHTML).toContain('正在加载商店…')

    events.stateListener?.({
      ...state,
      wallet: { coins: 77 },
      inventory: { ...state.inventory, seeds: { ...state.inventory.seeds, wheat: 9 } },
    })

    expect(dom.root.innerHTML).toContain('77 金币')
    expect(dom.root.innerHTML).toContain('拥有 9')
    expect(dom.root.innerHTML).not.toContain('正在加载商店…')

    control.resolve?.(state)
    await pending
    await vi.waitFor(() => expect(dom.root.innerHTML).not.toContain('正在加载商店…'))
    expect(dom.root.innerHTML).toContain('77 金币')
    expect(dom.root.innerHTML).toContain('拥有 9')
  })

  it('ignores a stale rejected request after a broadcast', async () => {
    const control: { reject: ((reason: unknown) => void) | null } = { reject: null }
    const pending = new Promise<GameViewState>((_resolve, reject) => {
      control.reject = reject
    })
    const { dom, events } = await mountShop({
      currentPage: 'shop-page',
      gameGetState: () => pending,
    })

    events.stateListener?.({ ...state, wallet: { coins: 77 } })
    expect(dom.root.innerHTML).toContain('77 金币')

    control.reject?.(new Error('ipc gone'))
    await pending.catch(() => undefined)
    await vi.waitFor(() => expect(dom.root.innerHTML).toContain('77 金币'))
    expect(dom.root.innerHTML).not.toContain('加载失败')
  })

  it('shows the retry affordance only after a real request failure', async () => {
    const { dom } = await mountShop({
      currentPage: 'shop-page',
      gameGetState: () => Promise.reject(new Error('ipc gone')),
    })

    await vi.waitFor(() => expect(dom.root.innerHTML).toContain('加载失败'))
    expect(dom.root.innerHTML).toContain('data-shop-retry')
  })

  it('keeps a purchase result when an older state request resolves later', async () => {
    const control: { resolve: ((value: GameViewState) => void) | null } = { resolve: null }
    let calls = 0
    const { dom, gameBuySeed } = await mountShop({
      currentPage: 'shop-page',
      gameGetState: () => {
        calls += 1
        if (calls === 1) return Promise.resolve(state)
        return new Promise<GameViewState>((resolve) => {
          control.resolve = resolve
        })
      },
      gameBuySeed: () =>
        Promise.resolve({
          ok: true,
          state: { ...state, wallet: { coins: 95 }, inventory: { ...state.inventory, seeds: { ...state.inventory.seeds, wheat: 6 } } },
        }),
    })
    await vi.waitFor(() => expect(dom.root.innerHTML).toContain('100 金币'))

    navigation.pageListener?.('shop-page')
    dom.clickHandler()?.({
      target: new ElementStub((selector) =>
        selector === '[data-buy-seed]'
          ? { disabled: false, dataset: { buySeed: 'wheat' } }
          : null,
      ),
    })

    await vi.waitFor(() => expect(dom.root.innerHTML).toContain('95 金币'))
    expect(gameBuySeed).toHaveBeenCalledWith('wheat')

    control.resolve?.(state)
    await vi.waitFor(() => expect(dom.root.innerHTML).toContain('95 金币'))
    expect(dom.root.innerHTML).not.toContain('正在加载商店…')
    expect(dom.root.innerHTML).toContain('拥有 6')
  })

  it('switches tabs in place without redrawing the shop', async () => {
    const { dom } = await mountShop({ currentPage: 'shop-page' })
    await vi.waitFor(() => expect(dom.root.innerHTML).toContain('100 金币'))
    const writesBefore = dom.writes.length
    const tabButton = fakeElement({ gameTab: 'food' })

    dom.clickHandler()?.({
      target: new ElementStub((selector) =>
        selector === '[data-game-tab]' ? tabButton : null,
      ),
    })

    expect(dom.writes).toHaveLength(writesBefore)
    expect(dom.panes[0].classList.tokens.has('hidden')).toBe(true)
    expect(dom.panes[1].classList.tokens.has('hidden')).toBe(false)
    expect(dom.tabs[1].classList.tokens.has('active')).toBe(true)
    expect(dom.tabs[1].attributes['aria-selected']).toBe('true')
    expect(dom.tabs[0].attributes['aria-selected']).toBe('false')
  })
})

