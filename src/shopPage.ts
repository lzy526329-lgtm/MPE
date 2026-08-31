import type { GameViewState } from '../electron/game/gameTypes'
import type { CropId } from '../electron/farm/farmTypes'
import { getCurrentPage, onPageChange } from './appNavigation'
import {
  DEFAULT_GAME_TAB,
  escapeHtml,
  gameErrorMessage,
  isGameTab,
  switchGameTab,
  type GameTab,
} from './gamePageShared'

export type ShopRenderOptions = {
  activeTab: GameTab
  busyCropId: CropId | null
  error: string | null
}

export { gameErrorMessage }

export function canBuySeed(coins: number, price: number): boolean {
  return coins >= price
}

function renderOffer(
  state: GameViewState,
  offer: GameViewState['seedOffers'][number],
  busyCropId: CropId | null,
): string {
  const buying = busyCropId === offer.cropId
  const affordable = canBuySeed(state.wallet.coins, offer.price)
  const disabled = busyCropId !== null || !affordable
  const owned = state.inventory.seeds[offer.cropId] ?? 0

  return `
    <article class="shop-offer-card">
      <div class="shop-offer-heading">
        <span class="shop-offer-icon" aria-hidden="true">🌱</span>
        <div>
          <h2>${escapeHtml(offer.name)}</h2>
          <p>拥有 ${owned}</p>
        </div>
      </div>
      <div class="shop-offer-action">
        <strong>${offer.price} 金币</strong>
        ${!affordable ? '<span class="shop-offer-warning">金币不足</span>' : ''}
        <button
          class="primary-button shop-buy-button"
          type="button"
          data-buy-seed="${escapeHtml(offer.cropId)}"${disabled ? ' disabled' : ''}
        >${buying ? '购买中…' : '购买 1 颗'}</button>
      </div>
    </article>
  `
}

export function renderShopPage(
  state: GameViewState,
  options: ShopRenderOptions,
): string {
  const { activeTab, busyCropId, error } = options
  const seedOffers = state.seedOffers
    .map((offer) => renderOffer(state, offer, busyCropId))
    .join('')

  return `
    <div class="game-page-shell">
      <div class="game-page-topbar">
        <div class="game-tabs" role="tablist" aria-label="商店分类">
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
        <div class="shop-offer-grid">${seedOffers}</div>
      </section>
      <section class="game-pane${activeTab === 'food' ? '' : ' hidden'}" data-game-pane="food">
        <div class="game-empty">
          <span aria-hidden="true">🍪</span>
          <strong>更多食物即将上架</strong>
          <p>新的宠物零食正在准备中。</p>
        </div>
      </section>
    </div>
  `
}

let mounted = false

export function mountShopPage(): void {
  if (mounted) return
  const root = document.querySelector<HTMLElement>('#shop-root')
  if (!root) return
  mounted = true

  let state: GameViewState | null = null
  let activeTab = DEFAULT_GAME_TAB
  let busyCropId: CropId | null = null
  let error: string | null = null
  let loading = false
  let stateGeneration = 0
  let visible = getCurrentPage() === 'shop-page'

  const render = () => {
    if (loading) {
      root.innerHTML = '<div class="game-empty"><strong>正在加载商店…</strong></div>'
      return
    }
    if (!state) {
      root.innerHTML = error
        ? `
        <div class="game-empty">
          <strong>加载失败</strong>
          <p>${escapeHtml(error)}</p>
          <button class="secondary-button" type="button" data-shop-retry>重试</button>
        </div>
      `
        : '<div class="game-empty" data-shop-idle></div>'
      return
    }
    root.innerHTML = renderShopPage(state, { activeTab, busyCropId, error })
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

  const buySeed = async (cropId: CropId) => {
    if (!state || busyCropId !== null) return
    const offer = state.seedOffers.find((item) => item.cropId === cropId)
    if (!offer || !canBuySeed(state.wallet.coins, offer.price)) return

    busyCropId = cropId
    error = null
    render()
    try {
      const result = await window.electronAPI.gameBuySeed(cropId)
      state = result.state
      if (!result.ok) error = gameErrorMessage(result.code)
    } catch {
      error = '购买失败，请重试。'
    } finally {
      // A purchase result is newer than any request already in flight, so it also
      // invalidates that request and clears its loading state.
      stateGeneration += 1
      loading = false
      busyCropId = null
      render()
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

    if (target.closest('[data-shop-retry]')) {
      void refresh()
      return
    }

    const buyButton = target.closest<HTMLButtonElement>('[data-buy-seed]')
    if (!buyButton || buyButton.disabled) return
    const cropId = buyButton.dataset.buySeed
    if (!state?.seedOffers.some((offer) => offer.cropId === cropId)) return
    void buySeed(cropId as CropId)
  })

  onPageChange((pageId) => {
    visible = pageId === 'shop-page'
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
