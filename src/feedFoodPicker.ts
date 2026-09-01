import type { FoodId, GameViewState } from '../electron/game/gameTypes'
import { getFoodImagePath } from '../electron/game/foodCatalog'
import { foodCatalogIconHtml, formatFoodSatietyLabel } from './foodAssets'
import { escapeHtml, gameErrorMessage } from './gamePageShared'

export type FeedFoodPickerResult =
  | { ok: true; foodId: FoodId }
  | { ok: false; reason: 'cancelled' | 'empty' | 'failed'; message?: string }

export function ownedFoodOffers(state: GameViewState): GameViewState['foodOffers'] {
  return state.foodOffers.filter((offer) => (state.inventory.food[offer.foodId] ?? 0) > 0)
}

export function renderFeedFoodPicker(
  state: GameViewState,
  options: { error?: string | null; busyFoodId?: FoodId | null } = {},
): string {
  const { error = null, busyFoodId = null } = options
  const items = ownedFoodOffers(state)

  const list = items
    .map((offer) => {
      const owned = state.inventory.food[offer.foodId] ?? 0
      const feeding = busyFoodId === offer.foodId
      const disabled = busyFoodId !== null

      return `
        <button
          type="button"
          class="feed-food-picker-item"
          data-feed-food-id="${escapeHtml(offer.foodId)}"${disabled ? ' disabled' : ''}
        >
          ${foodCatalogIconHtml(getFoodImagePath(offer.foodId), 'feed-food-picker-icon')}
          <span class="feed-food-picker-meta">
            <strong>${escapeHtml(offer.name)}</strong>
            <em>× ${owned} · ${escapeHtml(formatFoodSatietyLabel(offer.satiety))}</em>
          </span>
          <span class="feed-food-picker-action">${feeding ? '喂食中…' : '选择'}</span>
        </button>
      `
    })
    .join('')

  const body =
    items.length > 0
      ? `<div class="feed-food-picker-list">${list}</div>`
      : `
        <div class="game-empty feed-food-picker-empty">
          <span aria-hidden="true">🍪</span>
          <strong>暂无食物</strong>
          <p>请先去商店购买，再回来喂食。</p>
        </div>
      `

  return `
    <div class="feed-food-picker-backdrop" data-feed-food-cancel></div>
    <div class="feed-food-picker-panel" role="dialog" aria-modal="true" aria-label="选择食物">
      <header class="feed-food-picker-header">
        <h2>选择食物</h2>
        <button type="button" class="text-button feed-food-picker-close" data-feed-food-cancel aria-label="关闭">×</button>
      </header>
      ${error ? `<p class="game-inline-error feed-food-picker-error" role="alert">${escapeHtml(error)}</p>` : ''}
      ${body}
      <footer class="feed-food-picker-footer">
        <button type="button" class="secondary-button" data-feed-food-cancel>取消</button>
      </footer>
    </div>
  `
}

export async function openFeedFoodPicker(): Promise<FeedFoodPickerResult> {
  if (!window.electronAPI?.gameGetState || !window.electronAPI?.gameUseFood) {
    return { ok: false, reason: 'failed', message: '当前环境无法喂食。' }
  }

  const host = document.createElement('div')
  host.className = 'feed-food-picker-host'
  document.body.appendChild(host)

  let state: GameViewState
  try {
    state = await window.electronAPI.gameGetState()
  } catch {
    host.remove()
    return { ok: false, reason: 'failed', message: '加载背包失败，请重试。' }
  }

  if (ownedFoodOffers(state).length === 0) {
    host.innerHTML = renderFeedFoodPicker(state)
    return await new Promise((resolve) => {
      const finish = (result: FeedFoodPickerResult) => {
        host.remove()
        resolve(result)
      }
      host.addEventListener('click', (event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        if (target.closest('[data-feed-food-cancel]')) {
          finish({ ok: false, reason: 'empty', message: '暂无食物，无法喂食。' })
        }
      })
    })
  }

  let busyFoodId: FoodId | null = null
  let error: string | null = null
  let settled = false

  const render = () => {
    host.innerHTML = renderFeedFoodPicker(state, { error, busyFoodId })
  }

  render()

  return new Promise((resolve) => {
    const finish = (result: FeedFoodPickerResult) => {
      if (settled) return
      settled = true
      host.remove()
      resolve(result)
    }

    host.addEventListener('click', async (event) => {
      const target = event.target
      if (!(target instanceof Element)) return

      if (target.closest('[data-feed-food-cancel]')) {
        finish({ ok: false, reason: 'cancelled' })
        return
      }

      const item = target.closest<HTMLButtonElement>('[data-feed-food-id]')
      if (!item || item.disabled || busyFoodId !== null) return

      const foodId = item.dataset.feedFoodId as FoodId | undefined
      if (!foodId || !ownedFoodOffers(state).some((offer) => offer.foodId === foodId)) return

      busyFoodId = foodId
      error = null
      render()

      try {
        const result = await window.electronAPI.gameUseFood(foodId)
        state = result.state
        if (result.ok) {
          finish({ ok: true, foodId })
          return
        }
        error = gameErrorMessage(result.code)
      } catch {
        error = '喂食失败，请重试。'
      }

      busyFoodId = null
      render()
    })
  })
}
