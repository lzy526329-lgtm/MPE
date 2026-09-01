import type { GameViewState } from '../electron/game/gameTypes'
import type { CropId } from '../electron/farm/farmTypes'
import { getCropShopImgPath } from '../electron/farm/cropCatalog'
import { getFoodImagePath } from '../electron/game/foodCatalog'
import { getCurrentPage, onPageChange } from './appNavigation'
import { farmCatalogIconHtml } from './farmAssets'
import { foodCatalogIconHtml, formatFoodSatietyLabel } from './foodAssets'
import { openFeedFoodPicker } from './feedFoodPicker'
import {
  DEFAULT_GAME_TAB,
  escapeHtml,
  gameErrorMessage,
  type GameTab,
} from './gamePageShared'

export type BackpackTab = GameTab | 'produce'

export type BackpackRenderOptions = {
  activeTab: BackpackTab
  busyProduceId: string | null
  error: string | null
}

export function isBackpackTab(value: string | undefined): value is BackpackTab {
  return value === 'food' || value === 'seeds' || value === 'produce'
}

export function canSellProduce(owned: number): boolean {
  return owned >= 1
}

function switchBackpackTab(root: HTMLElement, tab: BackpackTab): void {
  root.querySelectorAll<HTMLElement>('.game-tab').forEach((button) => {
    const active = button.dataset.gameTab === tab
    button.classList.toggle('active', active)
    button.setAttribute('aria-selected', String(active))
  })
  root.querySelectorAll<HTMLElement>('.game-pane').forEach((pane) => {
    pane.classList.toggle('hidden', pane.dataset.gamePane !== tab)
  })
}

export function hasInventoryItems(record: Record<string, number>): boolean {
  return Object.values(record).some((count) => count > 0)
}

function renderSeedItems(state: GameViewState): string {
  return state.seedOffers
    .filter((offer) => (state.inventory.seeds[offer.cropId] ?? 0) > 0)
    .map(
      (offer) => `
      <article class="backpack-item-card">
        ${farmCatalogIconHtml(getCropShopImgPath(offer.cropId), 'backpack-item-icon')}
        <div>
          <h2>${escapeHtml(offer.name)}</h2>
          <strong>× ${state.inventory.seeds[offer.cropId] ?? 0}</strong>
        </div>
      </article>
    `,
    )
    .join('')
}

function renderFoodItems(state: GameViewState): string {
  return state.foodOffers
    .filter((offer) => (state.inventory.food[offer.foodId] ?? 0) > 0)
    .map((offer) => {
      const owned = state.inventory.food[offer.foodId] ?? 0

      return `
      <article class="backpack-item-card">
        ${foodCatalogIconHtml(getFoodImagePath(offer.foodId), 'backpack-item-icon')}
        <div class="backpack-item-body">
          <h2>${escapeHtml(offer.name)}</h2>
          <strong>× ${owned}</strong>
          <span class="backpack-item-satiety">${escapeHtml(formatFoodSatietyLabel(offer.satiety))}</span>
        </div>
      </article>
    `
    })
    .join('')
}

function renderProduceOffer(
  state: GameViewState,
  offer: GameViewState['produceOffers'][number],
  busyProduceId: string | null,
): string {
  const owned = state.inventory.produce[offer.produceId] ?? 0
  if (owned < 1) return ''
  const selling = busyProduceId === offer.produceId
  const disabled = busyProduceId !== null || !canSellProduce(owned)

  return `
    <article class="backpack-item-card backpack-item-card--sellable">
      ${farmCatalogIconHtml(getCropShopImgPath(offer.produceId as CropId), 'backpack-item-icon')}
      <div class="backpack-item-body">
        <h2>${escapeHtml(offer.name)}</h2>
        <strong>× ${owned}</strong>
      </div>
      <div class="backpack-item-action">
        <span class="backpack-item-price">${offer.price} 金币</span>
        <button
          class="primary-button backpack-sell-button"
          type="button"
          data-sell-produce="${escapeHtml(offer.produceId)}"${disabled ? ' disabled' : ''}
        >${selling ? '出售中…' : '出售 1 个'}</button>
      </div>
    </article>
  `
}

function renderProduceItems(state: GameViewState, busyProduceId: string | null): string {
  return state.produceOffers
    .map((offer) => renderProduceOffer(state, offer, busyProduceId))
    .join('')
}

export function renderBackpackPage(
  state: GameViewState,
  options: BackpackRenderOptions,
): string {
  const { activeTab, busyProduceId, error } = options
  const hasFood = hasInventoryItems(state.inventory.food)
  const hasSeeds = hasInventoryItems(state.inventory.seeds)
  const hasProduce = hasInventoryItems(state.inventory.produce)

  return `
    <div class="game-page-shell">
      <div class="game-page-topbar">
        <div class="game-tabs" role="tablist" aria-label="背包分类">
          <button class="game-tab${activeTab === 'seeds' ? ' active' : ''}" type="button"
            role="tab" aria-selected="${activeTab === 'seeds'}" data-game-tab="seeds">种子</button>
          <button class="game-tab${activeTab === 'produce' ? ' active' : ''}" type="button"
            role="tab" aria-selected="${activeTab === 'produce'}" data-game-tab="produce">农产品</button>
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
      <section class="game-pane${activeTab === 'produce' ? '' : ' hidden'}" data-game-pane="produce">
        ${hasProduce
          ? `<div class="backpack-item-grid">${renderProduceItems(state, busyProduceId)}</div>`
          : `
            <div class="game-empty">
              <span aria-hidden="true">🌾</span>
              <strong>暂无农产品</strong>
            </div>
          `}
      </section>
      <section class="game-pane${activeTab === 'food' ? '' : ' hidden'}" data-game-pane="food">
        <div class="backpack-food-toolbar">
          <button
            class="primary-button backpack-feed-open-button"
            type="button"
            data-open-feed-picker${hasFood ? '' : ' disabled'}
          >喂食宠物</button>
        </div>
        ${hasFood
          ? `<div class="backpack-item-grid">${renderFoodItems(state)}</div>`
          : `
            <div class="game-empty">
              <span aria-hidden="true">🍪</span>
              <strong>暂无食物</strong>
              <p>请先去商店购买。</p>
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
  let activeTab: BackpackTab = DEFAULT_GAME_TAB
  let busyProduceId: string | null = null
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
    root.innerHTML = renderBackpackPage(state, { activeTab, busyProduceId, error })
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

  const sellProduce = async (produceId: string) => {
    if (!state || busyProduceId !== null) return
    const offer = state.produceOffers.find((item) => item.produceId === produceId)
    const owned = state.inventory.produce[produceId] ?? 0
    if (!offer || !canSellProduce(owned)) return

    busyProduceId = produceId
    error = null
    render()
    try {
      const result = await window.electronAPI.gameSellProduce(produceId)
      state = result.state
      if (!result.ok) error = gameErrorMessage(result.code)
    } catch {
      error = '出售失败，请重试。'
    } finally {
      stateGeneration += 1
      loading = false
      busyProduceId = null
      render()
    }
  }

  const openFeedPicker = async () => {
    const result = await openFeedFoodPicker()
    if (result.ok) {
      try {
        state = await window.electronAPI.gameGetState()
        error = null
        render()
      } catch {
        error = '刷新背包失败，请重试。'
        render()
      }
      return
    }
    if (result.reason === 'failed' && result.message) {
      error = result.message
      render()
    }
  }

  root.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const tabButton = target.closest<HTMLElement>('[data-game-tab]')
    if (tabButton && isBackpackTab(tabButton.dataset.gameTab)) {
      activeTab = tabButton.dataset.gameTab
      switchBackpackTab(root, activeTab)
      return
    }

    if (target.closest('[data-backpack-retry]')) {
      void refresh()
      return
    }

    if (target.closest<HTMLButtonElement>('[data-open-feed-picker]:not([disabled])')) {
      void openFeedPicker()
      return
    }

    const sellButton = target.closest<HTMLButtonElement>('[data-sell-produce]')
    if (!sellButton || sellButton.disabled) return
    const produceId = sellButton.dataset.sellProduce
    if (!produceId || !state?.produceOffers.some((offer) => offer.produceId === produceId)) return
    void sellProduce(produceId)
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
