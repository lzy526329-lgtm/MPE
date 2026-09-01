import type { GameViewState, SupplyId } from '../electron/game/gameTypes'
import { getSupplyImagePath } from '../electron/game/supplyCatalog'
import { supplyCatalogIconHtml, formatSupplyHygieneLabel } from './supplyAssets'
import { escapeHtml, gameErrorMessage } from './gamePageShared'

export type CleanSupplyPickerResult =
  | { ok: true; supplyId: SupplyId }
  | { ok: false; reason: 'cancelled' | 'empty' | 'failed'; message?: string }

export function ownedSupplyOffers(state: GameViewState): GameViewState['supplyOffers'] {
  return state.supplyOffers.filter((offer) => (state.inventory.supplies[offer.supplyId] ?? 0) > 0)
}

export function renderCleanSupplyPicker(
  state: GameViewState,
  options: { error?: string | null; busySupplyId?: SupplyId | null } = {},
): string {
  const { error = null, busySupplyId = null } = options
  const items = ownedSupplyOffers(state)

  const list = items
    .map((offer) => {
      const owned = state.inventory.supplies[offer.supplyId] ?? 0
      const using = busySupplyId === offer.supplyId
      const disabled = busySupplyId !== null

      return `
        <button
          type="button"
          class="feed-food-picker-item"
          data-clean-supply-id="${escapeHtml(offer.supplyId)}"${disabled ? ' disabled' : ''}
        >
          ${supplyCatalogIconHtml(getSupplyImagePath(offer.supplyId), 'feed-food-picker-icon')}
          <span class="feed-food-picker-meta">
            <strong>${escapeHtml(offer.name)}</strong>
            <em>× ${owned} · ${escapeHtml(formatSupplyHygieneLabel(offer.hygiene))}</em>
          </span>
          <span class="feed-food-picker-action">${using ? '洗澡中…' : '选择'}</span>
        </button>
      `
    })
    .join('')

  const body =
    items.length > 0
      ? `<div class="feed-food-picker-list">${list}</div>`
      : `
        <div class="game-empty feed-food-picker-empty">
          <span aria-hidden="true">🧴</span>
          <strong>暂无沐浴露</strong>
          <p>请先去商店购买，再回来给宠物洗澡。</p>
        </div>
      `

  return `
    <div class="feed-food-picker-backdrop" data-clean-supply-cancel></div>
    <div class="feed-food-picker-panel" role="dialog" aria-modal="true" aria-label="选择沐浴露">
      <header class="feed-food-picker-header">
        <h2>选择沐浴露</h2>
        <button type="button" class="text-button feed-food-picker-close" data-clean-supply-cancel aria-label="关闭">×</button>
      </header>
      ${error ? `<p class="game-inline-error feed-food-picker-error" role="alert">${escapeHtml(error)}</p>` : ''}
      ${body}
      <footer class="feed-food-picker-footer">
        <button type="button" class="secondary-button" data-clean-supply-cancel>取消</button>
      </footer>
    </div>
  `
}

export async function openCleanSupplyPicker(): Promise<CleanSupplyPickerResult> {
  if (!window.electronAPI?.gameGetState || !window.electronAPI?.gameUseSupply) {
    return { ok: false, reason: 'failed', message: '当前环境无法给宠物洗澡。' }
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

  if (ownedSupplyOffers(state).length === 0) {
    host.innerHTML = renderCleanSupplyPicker(state)
    return await new Promise((resolve) => {
      const finish = (result: CleanSupplyPickerResult) => {
        host.remove()
        resolve(result)
      }
      host.addEventListener('click', (event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        if (target.closest('[data-clean-supply-cancel]')) {
          finish({ ok: false, reason: 'empty', message: '暂无沐浴露，无法洗澡。' })
        }
      })
    })
  }

  let busySupplyId: SupplyId | null = null
  let error: string | null = null
  let settled = false

  const render = () => {
    host.innerHTML = renderCleanSupplyPicker(state, { error, busySupplyId })
  }

  render()

  return new Promise((resolve) => {
    const finish = (result: CleanSupplyPickerResult) => {
      if (settled) return
      settled = true
      host.remove()
      resolve(result)
    }

    host.addEventListener('click', async (event) => {
      const target = event.target
      if (!(target instanceof Element)) return

      if (target.closest('[data-clean-supply-cancel]')) {
        finish({ ok: false, reason: 'cancelled' })
        return
      }

      const item = target.closest<HTMLButtonElement>('[data-clean-supply-id]')
      if (!item || item.disabled || busySupplyId !== null) return

      const supplyId = item.dataset.cleanSupplyId as SupplyId | undefined
      if (!supplyId || !ownedSupplyOffers(state).some((offer) => offer.supplyId === supplyId)) return

      busySupplyId = supplyId
      error = null
      render()

      try {
        const result = await window.electronAPI.gameUseSupply(supplyId)
        state = result.state
        if (result.ok) {
          finish({ ok: true, supplyId })
          return
        }
        error = gameErrorMessage(result.code)
      } catch {
        error = '洗澡失败，请重试。'
      }

      busySupplyId = null
      render()
    })
  })
}
