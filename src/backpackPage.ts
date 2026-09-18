import type { GameViewState, SupplyId } from '../electron/game/gameTypes'
import type { CropId } from '../electron/farm/farmTypes'
import { getCropShopImgPath } from '../electron/farm/cropCatalog'
import { getFoodImagePath } from '../electron/game/foodCatalog'
import { getSupplyImagePath } from '../electron/game/supplyCatalog'
import { getCurrentPage, navigateToPage, onPageChange } from './appNavigation'
import { farmCatalogIconHtml } from './farmAssets'
import { foodCatalogIconHtml, formatFoodSatietyLabel } from './foodAssets'
import { supplyCatalogIconHtml, formatSupplyHygieneLabel } from './supplyAssets'
import { decorCatalogIconHtml } from './decorAssets'
import { openFeedFoodPicker } from './feedFoodPicker'
import { getFishCatalogEntry, fishRarityLabel } from '../electron/fishing/fishCatalog'
import { FISH_QUALITY_CONFIG } from '../electron/fishing/fishQuality'
import { getFishImagePath } from './fishingAssets'
import {
  escapeHtml,
  gameErrorMessage,
  type GameTab,
} from './gamePageShared'

export type BackpackTab = Exclude<GameTab, 'baits'> | 'produce' | 'fish'

export type BackpackRenderOptions = {
  activeTab: BackpackTab
  busyProduceId: string | null
  busySupplyId: string | null
  busyCatchId: string | null
  sellingAllFish: boolean
  error: string | null
}

export function isBackpackTab(value: string | undefined): value is BackpackTab {
  return value === 'food' || value === 'seeds' || value === 'produce' || value === 'supplies' || value === 'decors' || value === 'fish'
}

let requestedBackpackTab: BackpackTab | null = null

export function openBackpackTab(tab: BackpackTab): void {
  requestedBackpackTab = tab
  navigateToPage('backpack-page')
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

function renderDecorItems(state: GameViewState): string {
  return state.decorOffers
    .filter((offer) => (state.inventory.decors[offer.decorId] ?? 0) > 0)
    .map((offer) => {
      const owned = state.inventory.decors[offer.decorId] ?? 0
      return `
      <article class="backpack-item-card">
        ${decorCatalogIconHtml(offer.src, 'backpack-item-icon')}
        <div class="backpack-item-body">
          <h2>${escapeHtml(offer.name)}</h2>
          <strong>× ${owned}</strong>
          <p class="backpack-item-satiety">去农场 → 装饰摆放</p>
        </div>
      </article>
    `
    })
    .join('')
}

function renderSupplyItems(state: GameViewState, _busySupplyId: string | null): string {
  return state.supplyOffers
    .filter((offer) => (state.inventory.supplies[offer.supplyId] ?? 0) > 0)
    .map((offer) => {
      const owned = state.inventory.supplies[offer.supplyId] ?? 0

      return `
      <article class="backpack-item-card">
        ${supplyCatalogIconHtml(getSupplyImagePath(offer.supplyId), 'backpack-item-icon')}
        <div class="backpack-item-body">
          <h2>${escapeHtml(offer.name)}</h2>
          <strong>× ${owned}</strong>
          <span class="backpack-item-satiety">${escapeHtml(formatSupplyHygieneLabel(offer.hygiene))}</span>
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

function renderFishItems(
  state: GameViewState,
  busyCatchId: string | null,
  sellingAllFish: boolean,
): string {
  return state.inventory.fish.map((item) => {
    const fish = getFishCatalogEntry(item.fishId)
    return `
      <article class="backpack-fish-card">
        <img src="${getFishImagePath(item.fishId)}" alt="${escapeHtml(fish.name)}" />
        <div class="backpack-fish-card-body">
          <span class="fishing-rarity fishing-rarity--${fish.rarity}">${fishRarityLabel(fish.rarity)}</span>
          <h2>${escapeHtml(fish.name)}</h2>
          <span class="fishing-quality fishing-quality--${item.quality}">${FISH_QUALITY_CONFIG[item.quality].label}品质</span>
          <dl>
            <div><dt>重量</dt><dd>${item.weightKg.toFixed(2)} kg</dd></div>
            <div><dt>售价</dt><dd>${item.sellPrice} 金币</dd></div>
          </dl>
        </div>
        <button class="secondary-button" type="button" data-sell-fish="${escapeHtml(item.id)}"
          ${busyCatchId !== null || sellingAllFish ? 'disabled' : ''}>${busyCatchId === item.id ? '出售中…' : '出售'}</button>
      </article>
    `
  }).join('')
}

export function renderBackpackPage(
  state: GameViewState,
  options: BackpackRenderOptions,
): string {
  const { activeTab, busyProduceId, busySupplyId, busyCatchId, sellingAllFish, error } = options
  const hasFood = hasInventoryItems(state.inventory.food)
  const hasSeeds = hasInventoryItems(state.inventory.seeds)
  const hasProduce = hasInventoryItems(state.inventory.produce)
  const hasSupplies = hasInventoryItems(state.inventory.supplies)
  const hasDecors = hasInventoryItems(state.inventory.decors)
  const hasFish = state.inventory.fish.length > 0
  const fishTotal = state.inventory.fish.reduce((sum, item) => sum + item.sellPrice, 0)

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
          <button class="game-tab${activeTab === 'supplies' ? ' active' : ''}" type="button"
            role="tab" aria-selected="${activeTab === 'supplies'}" data-game-tab="supplies">杂货</button>
          <button class="game-tab${activeTab === 'decors' ? ' active' : ''}" type="button"
            role="tab" aria-selected="${activeTab === 'decors'}" data-game-tab="decors">装饰</button>
          <button class="game-tab${activeTab === 'fish' ? ' active' : ''}" type="button"
            role="tab" aria-selected="${activeTab === 'fish'}" data-game-tab="fish">鱼获</button>
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
      <section class="game-pane${activeTab === 'supplies' ? '' : ' hidden'}" data-game-pane="supplies">
        ${hasSupplies
          ? `<div class="backpack-item-grid">${renderSupplyItems(state, busySupplyId)}</div>`
          : `
            <div class="game-empty">
              <span aria-hidden="true">🧴</span>
              <strong>暂无杂货</strong>
              <p>请先去商店购买。</p>
            </div>
          `}
      </section>
      <section class="game-pane${activeTab === 'decors' ? '' : ' hidden'}" data-game-pane="decors">
        ${hasDecors
          ? `<div class="backpack-item-grid">${renderDecorItems(state)}</div>`
          : `
            <div class="game-empty">
              <span aria-hidden="true">🏡</span>
              <strong>暂无装饰</strong>
              <p>请先去商店购买。</p>
            </div>
          `}
      </section>
      <section class="game-pane${activeTab === 'fish' ? '' : ' hidden'}" data-game-pane="fish">
        ${hasFish
          ? `
            <div class="backpack-fish-toolbar">
              <span>共 ${state.inventory.fish.length} / 100 条</span>
              <button class="primary-button" type="button" data-sell-all-fish
                ${busyCatchId !== null || sellingAllFish ? 'disabled' : ''}>${sellingAllFish ? '出售中…' : `全部出售 · ${fishTotal} 金币`}</button>
            </div>
            <div class="backpack-fish-grid">${renderFishItems(state, busyCatchId, sellingAllFish)}</div>
          `
          : `
            <div class="game-empty">
              <span aria-hidden="true">🎣</span>
              <strong>暂无鱼获</strong>
              <p>去鱼塘试试手气吧。</p>
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
  let activeTab: BackpackTab = 'seeds'
  let busyProduceId: string | null = null
  let busySupplyId: string | null = null
  let busyCatchId: string | null = null
  let sellingAllFish = false
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
    root.innerHTML = renderBackpackPage(state, {
      activeTab,
      busyProduceId,
      busySupplyId,
      busyCatchId,
      sellingAllFish,
      error,
    })
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

  const useSupplyItem = async (supplyId: SupplyId) => {
    if (!state || busySupplyId !== null) return
    const offer = state.supplyOffers.find((item) => item.supplyId === supplyId)
    const owned = state.inventory.supplies[supplyId] ?? 0
    if (!offer || owned < 1) return

    busySupplyId = supplyId
    error = null
    render()
    try {
      const result = await window.electronAPI.gameUseSupply(supplyId)
      state = result.state
      if (!result.ok) error = gameErrorMessage(result.code)
    } catch {
      error = '使用失败，请重试。'
    } finally {
      stateGeneration += 1
      loading = false
      busySupplyId = null
      render()
    }
  }

  const sellFishItem = async (catchId: string) => {
    if (!state || busyCatchId !== null || sellingAllFish) return
    if (!state.inventory.fish.some((item) => item.id === catchId)) return
    busyCatchId = catchId
    error = null
    render()
    try {
      const result = await window.electronAPI.gameSellFish(catchId)
      state = result.state
      if (!result.ok) error = gameErrorMessage(result.code)
    } catch {
      error = '出售失败，请重试。'
    } finally {
      busyCatchId = null
      stateGeneration += 1
      render()
    }
  }

  const sellAllFishItems = async () => {
    if (!state || state.inventory.fish.length === 0 || busyCatchId !== null || sellingAllFish) return
    sellingAllFish = true
    error = null
    render()
    try {
      const result = await window.electronAPI.gameSellAllFish()
      state = result.state
      if (!result.ok) error = gameErrorMessage(result.code)
    } catch {
      error = '出售失败，请重试。'
    } finally {
      sellingAllFish = false
      stateGeneration += 1
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

    if (target.closest<HTMLButtonElement>('[data-sell-all-fish]:not([disabled])')) {
      void sellAllFishItems()
      return
    }

    const sellFishButton = target.closest<HTMLButtonElement>('[data-sell-fish]')
    if (sellFishButton && !sellFishButton.disabled) {
      const catchId = sellFishButton.dataset.sellFish
      if (catchId) void sellFishItem(catchId)
      return
    }

    const useSupplyButton = target.closest<HTMLButtonElement>('[data-use-supply]')
    if (useSupplyButton && !useSupplyButton.disabled) {
      const supplyId = useSupplyButton.dataset.useSupply
      if (supplyId && state?.supplyOffers.some((offer) => offer.supplyId === supplyId)) {
        void useSupplyItem(supplyId as SupplyId)
      }
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
    if (visible) {
      if (requestedBackpackTab) {
        activeTab = requestedBackpackTab
        requestedBackpackTab = null
      }
      void refresh()
    }
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
