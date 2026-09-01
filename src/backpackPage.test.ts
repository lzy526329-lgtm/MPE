import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameViewState } from '../electron/game/gameTypes'
import {
  canSellProduce,
  hasInventoryItems,
  renderBackpackPage,
} from './backpackPage'

const navigation = vi.hoisted(() => ({
  pageListener: null as ((pageId: string) => void) | null,
}))

vi.mock('./appNavigation', () => ({
  getCurrentPage: () => 'pet-settings-page',
  onPageChange: (listener: (pageId: string) => void) => {
    navigation.pageListener = listener
    return () => undefined
  },
}))

const defaultOptions = {
  activeTab: 'seeds' as const,
  busyProduceId: null,
  error: null,
}

const state: GameViewState = {
  wallet: { coins: 100 },
  inventory: {
    food: {},
    seeds: { wheat: 5 },
    produce: {},
  },
  seedOffers: [{ cropId: 'wheat', name: '小麦种子', price: 5 }],
  produceOffers: [{ produceId: 'wheat', name: '小麦', price: 4 }],
  foodOffers: [{ foodId: 'cookie', name: '饼干', price: 3, satiety: 12 }],
}

describe('backpack page rendering', () => {
  it('renders only seeds with a positive count', () => {
    const html = renderBackpackPage(state, defaultOptions)

    expect(html).toContain('100 金币')
    expect(html).toContain('小麦种子')
    expect(html).toContain('× 5')
    expect(html).toContain('shopImg-cutout.png')
    expect(html).not.toContain('× 0')
    expect(html).not.toContain('data-buy-seed')
    expect(html).not.toMatch(/<input|<select|contenteditable/)
  })

  it('renders the empty seed state when every seed count is zero', () => {
    const emptySeeds: GameViewState = {
      ...state,
      inventory: { ...state.inventory, seeds: { wheat: 0 } },
    }

    const html = renderBackpackPage(emptySeeds, defaultOptions)

    expect(html).toContain('<strong>暂无种子</strong>')
    expect(html).not.toContain('小麦种子')
    expect(html).not.toContain('backpack-item-card')
  })

  it('renders owned food and a feed picker entry in the food tab', () => {
    const withFood: GameViewState = {
      ...state,
      inventory: { ...state.inventory, food: { cookie: 2, chocolate: 0, creamBread: 0, strawberryMilk: 0 } },
    }

    const html = renderBackpackPage(withFood, { ...defaultOptions, activeTab: 'food' })

    expect(html).toContain('饼干')
    expect(html).toContain('× 2')
    expect(html).toContain('./foods/%E9%A5%BC%E5%B9%B2.png')
    expect(html).toContain('+12 饱食度')
    expect(html).toContain('data-open-feed-picker')
    expect(html).toContain('喂食宠物')
    expect(html).not.toContain('data-use-food')
  })

  it('disables feed picker when there is no food', () => {
    const html = renderBackpackPage(state, { ...defaultOptions, activeTab: 'food' })

    expect(html).toContain('data-open-feed-picker disabled')
  })

  it('renders the exact empty food state', () => {
    const html = renderBackpackPage(state, { ...defaultOptions, activeTab: 'food' })

    expect(html).toContain('<strong>暂无食物</strong>')
  })

  it('renders harvested produce with a sell action in the produce tab', () => {
    const withProduce: GameViewState = {
      ...state,
      inventory: { ...state.inventory, produce: { wheat: 3 } },
    }

    const html = renderBackpackPage(withProduce, { ...defaultOptions, activeTab: 'produce' })

    expect(html).toContain('农产品')
    expect(html).toContain('小麦')
    expect(html).toContain('× 3')
    expect(html).toContain('shopImg-cutout.png')
    expect(html).toContain('4 金币')
    expect(html).toContain('data-sell-produce="wheat"')
    expect(html).toContain('出售 1 个')
  })

  it('disables the sell button while a sale is in progress', () => {
    const withProduce: GameViewState = {
      ...state,
      inventory: { ...state.inventory, produce: { wheat: 3 } },
    }

    const html = renderBackpackPage(withProduce, {
      activeTab: 'produce',
      busyProduceId: 'wheat',
      error: null,
    })

    expect(html).toContain('data-sell-produce="wheat" disabled')
    expect(html).toContain('出售中…')
  })

  it('renders the empty produce state when there is no harvest', () => {
    const html = renderBackpackPage(state, { ...defaultOptions, activeTab: 'produce' })

    expect(html).toContain('<strong>暂无农产品</strong>')
    expect(html).not.toContain('× 3')
  })

  it('escapes seed names before inserting them into markup', () => {
    const unsafeState: GameViewState = {
      ...state,
      seedOffers: [
        { cropId: 'wheat', name: '<img src=x onerror=alert(1)>', price: 5 },
      ],
    }

    const html = renderBackpackPage(unsafeState, defaultOptions)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('backpack inventory rules', () => {
  it('ignores zero-count inventory entries', () => {
    expect(hasInventoryItems({ apple: 0 })).toBe(false)
  })

  it('detects a positive inventory entry', () => {
    expect(hasInventoryItems({ apple: 0, biscuit: 1 })).toBe(true)
  })

  it('allows selling when at least one item is owned', () => {
    expect(canSellProduce(1)).toBe(true)
    expect(canSellProduce(0)).toBe(false)
  })
})

describe('backpack live synchronization', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    navigation.pageListener = null
  })

  it('mounts once, loads on entry, and redraws visible game state changes', async () => {
    const root = {
      innerHTML: '',
      addEventListener: vi.fn(),
    }
    const gameEvents: {
      stateListener: ((nextState: GameViewState) => void) | null
    } = { stateListener: null }
    const gameGetState = vi.fn().mockResolvedValue(state)
    const onGameStateChanged = vi.fn((listener: (nextState: GameViewState) => void) => {
      gameEvents.stateListener = listener
      return () => undefined
    })
    vi.stubGlobal('document', {
      querySelector: (selector: string) => selector === '#backpack-root' ? root : null,
    })
    vi.stubGlobal('window', {
      electronAPI: {
        gameGetState,
        onGameStateChanged,
      },
    })

    const { mountBackpackPage } = await import('./backpackPage')
    mountBackpackPage()
    mountBackpackPage()

    expect(onGameStateChanged).toHaveBeenCalledTimes(1)
    expect(navigation.pageListener).not.toBeNull()
    navigation.pageListener?.('backpack-page')
    await vi.waitFor(() => expect(root.innerHTML).toContain('100 金币'))
    expect(gameGetState).toHaveBeenCalledTimes(1)

    gameEvents.stateListener?.({ ...state, wallet: { coins: 77 } })
    expect(root.innerHTML).toContain('77 金币')
  })

  it('renders a neutral placeholder instead of a load failure while hidden', async () => {
    const root = { innerHTML: '', addEventListener: vi.fn() }
    const gameGetState = vi.fn().mockResolvedValue(state)
    vi.stubGlobal('document', {
      querySelector: (selector: string) => (selector === '#backpack-root' ? root : null),
    })
    vi.stubGlobal('window', {
      electronAPI: { gameGetState, onGameStateChanged: () => () => undefined },
    })

    const { mountBackpackPage } = await import('./backpackPage')
    mountBackpackPage()

    expect(gameGetState).not.toHaveBeenCalled()
    expect(root.innerHTML).not.toContain('加载失败')
    expect(root.innerHTML).not.toContain('重试')
    expect(root.innerHTML).toContain('data-backpack-idle')
  })

  it('keeps a visible broadcast when an older state request resolves later', async () => {
    const root = {
      innerHTML: '',
      addEventListener: vi.fn(),
    }
    const gameEvents: {
      stateListener: ((nextState: GameViewState) => void) | null
    } = { stateListener: null }
    const requestControl: {
      resolve: ((value: GameViewState) => void) | null
    } = { resolve: null }
    const pendingRequest = new Promise<GameViewState>((resolve) => {
      requestControl.resolve = resolve
    })
    const gameGetState = vi.fn(() => pendingRequest)
    vi.stubGlobal('document', {
      querySelector: (selector: string) => selector === '#backpack-root' ? root : null,
    })
    vi.stubGlobal('window', {
      electronAPI: {
        gameGetState,
        onGameStateChanged: (listener: (nextState: GameViewState) => void) => {
          gameEvents.stateListener = listener
          return () => undefined
        },
      },
    })

    const { mountBackpackPage } = await import('./backpackPage')
    mountBackpackPage()
    navigation.pageListener?.('backpack-page')
    expect(gameGetState).toHaveBeenCalledTimes(1)

    const broadcastState: GameViewState = {
      ...state,
      wallet: { coins: 77 },
      inventory: {
        ...state.inventory,
        seeds: { ...state.inventory.seeds, wheat: 9 },
      },
    }
    gameEvents.stateListener?.(broadcastState)
    expect(root.innerHTML).toContain('77 金币')
    expect(root.innerHTML).toContain('× 9')

    requestControl.resolve?.(state)
    await pendingRequest
    await vi.waitFor(() => expect(root.innerHTML).not.toContain('正在加载背包…'))
    expect(root.innerHTML).toContain('77 金币')
    expect(root.innerHTML).toContain('× 9')
  })
})
