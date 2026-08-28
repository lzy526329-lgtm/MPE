import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameViewState } from '../electron/game/gameTypes'
import { hasInventoryItems, renderBackpackPage } from './backpackPage'

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

const state: GameViewState = {
  wallet: { coins: 100 },
  inventory: {
    food: {},
    seeds: { wheat: 5 },
    produce: {},
  },
  seedOffers: [{ cropId: 'wheat', name: '小麦种子', price: 5 }],
}

describe('backpack page rendering', () => {
  it('renders only seeds with a positive count', () => {
    const html = renderBackpackPage(state, 'seeds', null)

    expect(html).toContain('100 金币')
    expect(html).toContain('小麦种子')
    expect(html).toContain('× 5')
    expect(html).not.toContain('× 0')
    expect(html).not.toContain('data-buy-seed')
    expect(html).not.toMatch(/<input|<select|contenteditable/)
  })

  it('renders the empty seed state when every seed count is zero', () => {
    const emptySeeds: GameViewState = {
      ...state,
      inventory: { ...state.inventory, seeds: { wheat: 0 } },
    }

    const html = renderBackpackPage(emptySeeds, 'seeds', null)

    expect(html).toContain('<strong>暂无种子</strong>')
    expect(html).not.toContain('小麦种子')
    expect(html).not.toContain('backpack-item-card')
  })

  it('renders the exact empty food state', () => {
    const html = renderBackpackPage(state, 'food', null)

    expect(html).toContain('<strong>暂无食物</strong>')
  })

  it('escapes seed names before inserting them into markup', () => {
    const unsafeState: GameViewState = {
      ...state,
      seedOffers: [
        { cropId: 'wheat', name: '<img src=x onerror=alert(1)>', price: 5 },
      ],
    }

    const html = renderBackpackPage(unsafeState, 'seeds', null)
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
