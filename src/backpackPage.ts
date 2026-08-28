import type { GameViewState } from '../electron/game/gameTypes'
import { getCurrentPage, onPageChange } from './appNavigation'
import {
  DEFAULT_GAME_TAB,
  escapeHtml,
  isGameTab,
  switchGameTab,
  type GameTab,
} from './gamePageShared'

export function hasInventoryItems(record: Record<string, number>): boolean {
  return Object.values(record).some((count) => count > 0)
}

function renderSeedItems(state: GameViewState): string {
  return state.seedOffers
    .filter((offer) => (state.inventory.seeds[offer.cropId] ?? 0) > 0)
    .map(
      (offer) => `
      <article class="backpack-item-card">
        <span class="backpack-item-icon" aria-hidden="true">🌱</span>
        <div>
          <h2>${escapeHtml(offer.name)}</h2>
          <strong>× ${state.inventory.seeds[offer.cropId] ?? 0}</strong>
        </div>
      </article>
    `,
    )
    .join('')
}

function renderFoodItems(food: Record<string, number>): string {
  return Object.entries(food)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `
      <article class="backpack-item-card">
        <span class="backpack-item-icon" aria-hidden="true">🍪</span>
        <div>
          <h2>${escapeHtml(name)}</h2>
          <strong>× ${count}</strong>
        </div>
      </article>
    `)
    .join('')
}

export function renderBackpackPage(
  state: GameViewState,
  activeTab: GameTab,
  error: string | null,
): string {
  const hasFood = hasInventoryItems(state.inventory.food)
  const hasSeeds = hasInventoryItems(state.inventory.seeds)

  return `
    <div class="game-page-shell">
      <div class="game-page-topbar">
        <div class="game-tabs" role="tablist" aria-label="背包分类">
          <button class="game-tab${activeTab === 'seeds' ? ' active' : ''}" type="button"
            role="tab" aria-selected="${activeTab === 'seeds'}" data-game-tab="seeds">种子</button>
          <button class="game-tab${activeTab === 'food' ? ' active' : ''}" type="button"
            role="tab" aria-selected="${activeTab === 'food'}" data-game-tab="food">食物</button>
        </div>
        <div class="game-wallet" aria-label="当前余额">
          <span aria-hidden="true">●</span>
          <strong>${state.wallet.coins} 金币</strong>
        </div>
      </div>
      ${error ? `<p class="game-inline-error" role="alert">${escapeHtml(error)}</p>` : ''}
      <section class="game-pane${activeTab === 'seeds' ? '' : ' hidden'}" data-game-pane="seeds">
        ${hasSeeds
          ? `<div class="backpack-item-grid">${renderSeedItems(state)}</div>`
          : `
            <div class="game-empty">
              <span aria-hidden="true">🌱</span>
              <strong>暂无种子</strong>
            </div>
          `}
      </section>
      <section class="game-pane${activeTab === 'food' ? '' : ' hidden'}" data-game-pane="food">
        ${hasFood
          ? `<div class="backpack-item-grid">${renderFoodItems(state.inventory.food)}</div>`
          : `
            <div class="game-empty">
              <span aria-hidden="true">🍪</span>
              <strong>暂无食物</strong>
            </div>
          `}
      </section>
    </div>
  `
}

let mounted = false

export function mountBackpackPage(): void {
  if (mounted) return
  const root = document.querySelector<HTMLElement>('#backpack-root')
  if (!root) return
  mounted = true

  let state: GameViewState | null = null
  let activeTab = DEFAULT_GAME_TAB
  let error: string | null = null
  let loading = false
  let stateGeneration = 0
  let visible = getCurrentPage() === 'backpack-page'

  const render = () => {
    if (loading) {
      root.innerHTML = '<div class="game-empty"><strong>正在加载背包…</strong></div>'
      return
    }
    if (!state) {
      root.innerHTML = error
        ? `
        <div class="game-empty">
          <strong>加载失败</strong>
          <p>${escapeHtml(error)}</p>
          <button class="secondary-button" type="button" data-backpack-retry>重试</button>
        </div>
      `
        : '<div class="game-empty" data-backpack-idle></div>'
      return
    }
    root.innerHTML = renderBackpackPage(state, activeTab, error)
  }

  const refresh = async () => {
    const requestGeneration = ++stateGeneration
    const hadState = state !== null
    if (!hadState) {
      loading = true
      error = null
      render()
    }
    try {
      const nextState = await window.electronAPI.gameGetState()
      if (requestGeneration !== stateGeneration) return
      state = nextState
      error = null
    } catch {
      if (requestGeneration !== stateGeneration) return
      if (!hadState) state = null
      error = '请检查应用状态后重试。'
    } finally {
      if (requestGeneration === stateGeneration) {
        loading = false
        render()
      }
    }
  }

  root.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const tabButton = target.closest<HTMLElement>('[data-game-tab]')
    if (tabButton && isGameTab(tabButton.dataset.gameTab)) {
      activeTab = tabButton.dataset.gameTab
      switchGameTab(root, activeTab)
      return
    }

    if (target.closest('[data-backpack-retry]')) void refresh()
  })

  onPageChange((pageId) => {
    visible = pageId === 'backpack-page'
    if (visible) void refresh()
  })

  window.electronAPI.onGameStateChanged((nextState) => {
    if (!visible) return
    stateGeneration += 1
    loading = false
    state = nextState
    error = null
    render()
  })

  if (visible) void refresh()
  else render()
}
