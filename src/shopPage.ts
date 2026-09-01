import type { GameViewState, FoodId, SupplyId } from '../electron/game/gameTypes'
import type { CropId } from '../electron/farm/farmTypes'
import { formatCropGrowLabel, getCropCatalogEntry, getCropShopImgPath } from '../electron/farm/cropCatalog'
import { getFoodImagePath } from '../electron/game/foodCatalog'
import { getSupplyImagePath } from '../electron/game/supplyCatalog'
import { farmCatalogIconHtml } from './farmAssets'
import { foodCatalogIconHtml, formatFoodSatietyLabel } from './foodAssets'
import { supplyCatalogIconHtml, formatSupplyHygieneLabel } from './supplyAssets'
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
  busyFoodId: string | null
  busySupplyId: string | null
  error: string | null
}

export { gameErrorMessage }

/** @deprecated 使用 cropCatalog.json 中的 growMinutes */
export function formatGrowDuration(growMs: number): string {
  const totalMinutes = Math.max(1, Math.round(growMs / 60_000))
  if (totalMinutes < 60) return `成熟约 ${totalMinutes} 分钟`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `成熟约 ${hours} 小时`
  return `成熟约 ${hours} 小时 ${minutes} 分钟`
}

function seedGrowLabel(cropId: CropId): string | null {
  try {
    getCropCatalogEntry(cropId)
    return formatCropGrowLabel(cropId)
  } catch {
    return null
  }
}

export function canBuySeed(coins: number, price: number): boolean {
  return coins >= price
}

function renderSupplyOffer(
  state: GameViewState,
  offer: GameViewState['supplyOffers'][number],
  busySupplyId: string | null,
): string {
  const buying = busySupplyId === offer.supplyId
  const affordable = canBuySeed(state.wallet.coins, offer.price)
  const disabled = busySupplyId !== null || !affordable
  const owned = state.inventory.supplies[offer.supplyId] ?? 0
  const shopIcon = supplyCatalogIconHtml(getSupplyImagePath(offer.supplyId), 'shop-offer-icon')

  return `
    <article class="shop-offer-card">
      <div class="shop-offer-heading">
        ${shopIcon}
        <div>
          <h2>${escapeHtml(offer.name)}</h2>
          <p class="shop-offer-grow">${escapeHtml(formatSupplyHygieneLabel(offer.hygiene))}</p>
          <p>拥有 ${owned}</p>
        </div>
      </div>
      <div class="shop-offer-action">
        <strong>${offer.price} 金币</strong>
        ${!affordable ? '<span class="shop-offer-warning">金币不足</span>' : ''}
        <button
          class="primary-button shop-buy-button"
          type="button"
          data-buy-supply="${escapeHtml(offer.supplyId)}"${disabled ? ' disabled' : ''}
        >${buying ? '购买中…' : '购买 1 份'}</button>
      </div>
    </article>
  `
}

function renderFoodOffer(
  state: GameViewState,
  offer: GameViewState['foodOffers'][number],
  busyFoodId: string | null,
): string {
  const buying = busyFoodId === offer.foodId
  const affordable = canBuySeed(state.wallet.coins, offer.price)
  const disabled = busyFoodId !== null || !affordable
  const owned = state.inventory.food[offer.foodId] ?? 0
  const shopIcon = foodCatalogIconHtml(getFoodImagePath(offer.foodId), 'shop-offer-icon')

  return `
    <article class="shop-offer-card">
      <div class="shop-offer-heading">
        ${shopIcon}
        <div>
          <h2>${escapeHtml(offer.name)}</h2>
          <p class="shop-offer-grow">${escapeHtml(formatFoodSatietyLabel(offer.satiety))}</p>
          <p>拥有 ${owned}</p>
        </div>
      </div>
      <div class="shop-offer-action">
        <strong>${offer.price} 金币</strong>
        ${!affordable ? '<span class="shop-offer-warning">金币不足</span>' : ''}
        <button
          class="primary-button shop-buy-button"
          type="button"
          data-buy-food="${escapeHtml(offer.foodId)}"${disabled ? ' disabled' : ''}
        >${buying ? '购买中…' : '购买 1 份'}</button>
      </div>
    </article>
  `
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
  const growLabel = seedGrowLabel(offer.cropId)
  const shopIcon = farmCatalogIconHtml(getCropShopImgPath(offer.cropId), 'shop-offer-icon')

  return `
    <article class="shop-offer-card">
      <div class="shop-offer-heading">
        ${shopIcon}
        <div>
          <h2>${escapeHtml(offer.name)}</h2>
          ${growLabel ? `<p class="shop-offer-grow">${escapeHtml(growLabel)}</p>` : ''}
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
  const { activeTab, busyCropId, busyFoodId, busySupplyId, error } = options
  const seedOffers = state.seedOffers
    .map((offer) => renderOffer(state, offer, busyCropId))
    .join('')
  const foodOffers = state.foodOffers
    .map((offer) => renderFoodOffer(state, offer, busyFoodId))
    .join('')
  const supplyOffers = state.supplyOffers
    .map((offer) => renderSupplyOffer(state, offer, busySupplyId))
    .join('')

  return `
    <div class="game-page-shell">
      <div class="game-page-topbar">
        <div class="game-tabs" role="tablist" aria-label="商店分类">
          <button class="game-tab${activeTab === 'seeds' ? ' active' : ''}" type="button"
            role="tab" aria-selected="${activeTab === 'seeds'}" data-game-tab="seeds">种子</button>
          <button class="game-tab${activeTab === 'food' ? ' active' : ''}" type="button"
            role="tab" aria-selected="${activeTab === 'food'}" data-game-tab="food">食物</button>
          <button class="game-tab${activeTab === 'supplies' ? ' active' : ''}" type="button"
            role="tab" aria-selected="${activeTab === 'supplies'}" data-game-tab="supplies">杂货</button>
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
        ${foodOffers.length > 0
          ? `<div class="shop-offer-grid">${foodOffers}</div>`
          : `
            <div class="game-empty">
              <span aria-hidden="true">🍪</span>
              <strong>暂无食物上架</strong>
            </div>
          `}
      </section>
      <section class="game-pane${activeTab === 'supplies' ? '' : ' hidden'}" data-game-pane="supplies">
        ${supplyOffers.length > 0
          ? `<div class="shop-offer-grid">${supplyOffers}</div>`
          : `
            <div class="game-empty">
              <span aria-hidden="true">🧴</span>
              <strong>暂无杂货上架</strong>
            </div>
          `}
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
  let busyFoodId: string | null = null
  let busySupplyId: string | null = null
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
    root.innerHTML = renderShopPage(state, { activeTab, busyCropId, busyFoodId, busySupplyId, error })
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

  const buyFoodItem = async (foodId: FoodId) => {
    if (!state || busyFoodId !== null) return
    const offer = state.foodOffers.find((item) => item.foodId === foodId)
    if (!offer || !canBuySeed(state.wallet.coins, offer.price)) return

    busyFoodId = foodId
    error = null
    render()
    try {
      const result = await window.electronAPI.gameBuyFood(foodId)
      state = result.state
      if (!result.ok) error = gameErrorMessage(result.code)
    } catch {
      error = '购买失败，请重试。'
    } finally {
      stateGeneration += 1
      loading = false
      busyFoodId = null
      render()
    }
  }

  const buySupplyItem = async (supplyId: SupplyId) => {
    if (!state || busySupplyId !== null) return
    const offer = state.supplyOffers.find((item) => item.supplyId === supplyId)
    if (!offer || !canBuySeed(state.wallet.coins, offer.price)) return

    busySupplyId = supplyId
    error = null
    render()
    try {
      const result = await window.electronAPI.gameBuySupply(supplyId)
      state = result.state
      if (!result.ok) error = gameErrorMessage(result.code)
    } catch {
      error = '购买失败，请重试。'
    } finally {
      stateGeneration += 1
      loading = false
      busySupplyId = null
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

    const buySupplyButton = target.closest<HTMLButtonElement>('[data-buy-supply]')
    if (buySupplyButton && !buySupplyButton.disabled) {
      const supplyId = buySupplyButton.dataset.buySupply
      if (supplyId && state?.supplyOffers.some((offer) => offer.supplyId === supplyId)) {
        void buySupplyItem(supplyId as SupplyId)
      }
      return
    }

    const buyFoodButton = target.closest<HTMLButtonElement>('[data-buy-food]')
    if (buyFoodButton && !buyFoodButton.disabled) {
      const foodId = buyFoodButton.dataset.buyFood
      if (foodId && state?.foodOffers.some((offer) => offer.foodId === foodId)) {
        void buyFoodItem(foodId as FoodId)
      }
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
