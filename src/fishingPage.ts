import { getBaitCatalogEntry } from '../electron/fishing/baitCatalog'
import { getFishCatalogEntry, getFishIds, fishRarityLabel } from '../electron/fishing/fishCatalog'
import type { BaitId } from '../electron/fishing/fishingTypes'
import type { GameViewState } from '../electron/game/gameTypes'
import { getCurrentPage, onPageChange } from './appNavigation'
import { openBackpackTab } from './backpackPage'
import { FISHING_ASSETS, getBaitImagePath, getFishImagePath } from './fishingAssets'
import {
  reduceFishingState,
  type FishingUiEvent,
  type FishingUiState,
} from './fishingStateMachine'
import { escapeHtml } from './gamePageShared'

const PHASE_COPY: Record<FishingUiState['phase'], string> = {
  idle: '选择鱼饵后，点击水面抛竿',
  casting: '抛竿中…',
  waiting: '浮漂静静地等着鱼儿…',
  biting: '鱼儿咬钩了！快收杆！',
  resolving: '正在收杆…',
  caught: '钓到了！',
  failed: '这次没钓到',
}

function activeToken(state: FishingUiState): string | null {
  return state.phase === 'waiting' || state.phase === 'biting' || state.phase === 'resolving'
    ? state.token
    : null
}

export function nextTimedEvent(
  state: FishingUiState,
  now: number,
): FishingUiEvent | null {
  if (state.phase === 'waiting' && now >= state.biteAt) return { type: 'BITE_STARTED' }
  if (state.phase === 'biting' && now > state.deadline) return { type: 'BITE_EXPIRED' }
  return null
}

export type PondPoint = { x: number; y: number }

const FISHING_VISUALS = {
  castDurationMs: 1_200,
  lineWidthPx: 2.5,
  bobberSizePx: 44,
} as const

export function normalizePondPoint(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): PondPoint {
  const x = ((clientX - rect.left) / rect.width) * 100
  const y = ((clientY - rect.top) / rect.height) * 100
  return {
    x: Math.round(Math.min(94, Math.max(6, x))),
    y: Math.round(Math.min(90, Math.max(10, y))),
  }
}

export function isFishingReelShortcut(code: string, repeat: boolean): boolean {
  return code === 'Space' && !repeat
}

export function renderFishingPage(
  view: GameViewState,
  state: FishingUiState,
  selectedBait: BaitId,
  message: string,
  catalogOpen = false,
  castPoint: PondPoint = { x: 55, y: 55 },
): string {
  const fishCount = view.inventory.fish.length
  const status = message || PHASE_COPY[state.phase]
  const discovered = new Set(view.fishing.discoveredFish)
  const catchModal = state.phase === 'caught'
    ? (() => {
        const fish = getFishCatalogEntry(state.catch.fishId)
        return `
          <div class="fishing-catch-backdrop" role="presentation">
            <section class="fishing-catch-card" role="dialog" aria-modal="true" aria-label="钓获结果">
              <p class="eyebrow">NEW CATCH</p>
              <img src="${getFishImagePath(state.catch.fishId)}" alt="${escapeHtml(fish.name)}" />
              <h2>${escapeHtml(fish.name)}</h2>
              <span class="fishing-rarity fishing-rarity--${fish.rarity}">${fishRarityLabel(fish.rarity)}</span>
              <dl>
                <div><dt>重量</dt><dd>${state.catch.weightKg.toFixed(2)} kg</dd></div>
                <div><dt>售价</dt><dd>${state.catch.sellPrice} 金币</dd></div>
              </dl>
              <button class="primary-button" type="button" data-fishing-result-close>收入背包</button>
            </section>
          </div>
        `
      })()
    : ''
  const catalogModal = catalogOpen
    ? `
      <div class="fishing-catalog-backdrop">
        <section class="fishing-catalog-panel" role="dialog" aria-modal="true" aria-label="鱼类图鉴">
          <header>
            <div>
              <p class="eyebrow">POND COLLECTION</p>
              <h2>鱼类图鉴</h2>
              <p>已发现 ${discovered.size} / ${getFishIds().length} 种</p>
            </div>
            <button class="fishing-catalog-close" type="button" data-fishing-catalog-close aria-label="关闭图鉴">×</button>
          </header>
          <div class="fishing-catalog-grid">
            ${getFishIds().map((fishId) => {
              const fish = getFishCatalogEntry(fishId)
              const unlocked = discovered.has(fishId)
              return `
                <article class="fishing-catalog-card${unlocked ? '' : ' fishing-catalog-card--locked'}">
                  <img src="${getFishImagePath(fishId)}" alt="${unlocked ? escapeHtml(fish.name) : ''}" />
                  ${unlocked
                    ? `
                      <div>
                        <span class="fishing-rarity fishing-rarity--${fish.rarity}">${fishRarityLabel(fish.rarity)}</span>
                        <h3>${escapeHtml(fish.name)}</h3>
                        <p>${fish.weightMin.toFixed(1)}～${fish.weightMax.toFixed(1)} kg · 基础售价 ${fish.basePrice}</p>
                      </div>
                    `
                    : '<div><h3>？？？</h3><p>尚未发现</p></div>'}
                </article>
              `
            }).join('')}
          </div>
        </section>
      </div>
    `
    : ''

  return `
    <div class="fishing-scene fishing-scene--${state.phase}">
      <div class="fishing-hud">
        <span>🪙 <strong>${view.wallet.coins}</strong></span>
        <button type="button" data-fishing-backpack-open>🎒 鱼获 <strong>${fishCount}/100</strong></button>
        <button type="button" data-fishing-catalog-open>📖 <strong>图鉴 ${discovered.size} / ${getFishIds().length}</strong></button>
      </div>
      <div class="fishing-pond" style="background-image:url('${FISHING_ASSETS.pond}');--fishing-cast-x:${castPoint.x}%;--fishing-cast-y:${castPoint.y}%;--fishing-cast-duration:${FISHING_VISUALS.castDurationMs}ms;--fishing-line-width:${FISHING_VISUALS.lineWidthPx}px;--fishing-bobber-size:${FISHING_VISUALS.bobberSizePx}px" data-fishing-pond>
        <div class="fishing-water-shimmer" aria-hidden="true"></div>
        <div class="fishing-fish-shadows" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <svg class="fishing-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="8" y1="100" x2="${castPoint.x}" y2="${castPoint.y}"></line>
        </svg>
        <img class="fishing-bobber" src="${FISHING_ASSETS.bobber}" alt="" />
        <div class="fishing-ripple" aria-hidden="true"></div>
        <div class="fishing-splash" aria-hidden="true"><i></i><i></i><i></i></div>
      </div>
      <p class="fishing-status" role="status">${escapeHtml(status)}</p>
      <div class="fishing-controls">
        <div class="fishing-bait-list" role="radiogroup" aria-label="选择鱼饵">
          ${view.baitOffers.map((offer) => {
            const selected = offer.baitId === selectedBait
            return `
              <button class="fishing-bait${selected ? ' fishing-bait--selected' : ''}" type="button"
                role="radio" aria-checked="${selected}" data-fishing-bait="${offer.baitId}"
                ${state.phase === 'idle' ? '' : 'disabled'}>
                <img src="${getBaitImagePath(offer.baitId)}" alt="" />
                <span><strong>${escapeHtml(offer.name)}</strong><small>${escapeHtml(getBaitCatalogEntry(offer.baitId).description)}</small></span>
                <em>×${view.inventory.baits[offer.baitId] ?? 0}</em>
              </button>
            `
          }).join('')}
        </div>
      </div>
      ${fishCount >= 100 ? '<p class="fishing-capacity-warning">鱼获背包已满，请先出售。</p>' : ''}
      ${catchModal}
      ${catalogModal}
    </div>
  `
}

export function mountFishingPage(): void {
  const root = document.querySelector<HTMLElement>('#fishing-root')
  if (!root) return
  let view: GameViewState | null = null
  let uiState: FishingUiState = { phase: 'idle' }
  let selectedBait: BaitId = 'basic'
  let message = ''
  let catalogOpen = false
  let castPoint: PondPoint = { x: 55, y: 55 }
  let biteTimer: ReturnType<typeof setTimeout> | undefined
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined
  let resetTimer: ReturnType<typeof setTimeout> | undefined
  let visible = getCurrentPage() === 'fishing-page'

  const clearTimers = () => {
    if (biteTimer) clearTimeout(biteTimer)
    if (deadlineTimer) clearTimeout(deadlineTimer)
    if (resetTimer) clearTimeout(resetTimer)
    biteTimer = deadlineTimer = resetTimer = undefined
  }

  const paint = () => {
    root.innerHTML = view
      ? renderFishingPage(view, uiState, selectedBait, message, catalogOpen, castPoint)
      : '<p class="sysinfo-loading">正在加载鱼塘…</p>'
  }

  const dispatch = (event: FishingUiEvent) => {
    uiState = reduceFishingState(uiState, event)
    paint()
  }

  const resetSoon = () => {
    resetTimer = setTimeout(() => {
      message = ''
      dispatch({ type: 'RESET' })
    }, 1_800)
  }

  const fail = (reason: 'too-early' | 'too-late' | 'cancelled' | 'error', copy: string) => {
    clearTimers()
    message = copy
    dispatch({ type: 'REEL_FAILED', reason })
    resetSoon()
  }

  const reel = async () => {
    const token = activeToken(uiState)
    if (!token || (uiState.phase !== 'waiting' && uiState.phase !== 'biting')) return
    clearTimers()
    dispatch({ type: 'REEL_REQUESTED' })
    try {
      const result = await window.electronAPI.fishingReel(token)
      view = result.state
      if (result.ok) {
        message = ''
        dispatch({ type: 'REEL_CAUGHT', catch: result.catch })
      } else {
        const reason = result.status === 'too-early' || result.status === 'too-late'
          ? result.status
          : 'error'
        fail(reason, result.message)
      }
    } catch {
      fail('error', '收杆失败，请重新尝试。')
    }
  }

  const scheduleSession = () => {
    if (uiState.phase !== 'waiting') return
    const biteDelay = Math.max(0, uiState.biteAt - Date.now())
    const deadline = uiState.deadline
    biteTimer = setTimeout(() => {
      if (uiState.phase !== 'waiting') return
      dispatch({ type: 'BITE_STARTED' })
      deadlineTimer = setTimeout(() => void reel(), Math.max(0, deadline - Date.now() + 1))
    }, biteDelay)
  }

  const cast = async () => {
    if (!view || uiState.phase !== 'idle') return
    if ((view.inventory.baits[selectedBait] ?? 0) < 1) {
      message = '鱼饵不足，请先去商店购买。'
      paint()
      return
    }
    if (view.inventory.fish.length >= 100) {
      message = '鱼获背包已满，请先出售。'
      paint()
      return
    }
    message = ''
    dispatch({ type: 'CAST_REQUESTED', baitId: selectedBait })
    try {
      const [result] = await Promise.all([
        window.electronAPI.fishingCast(selectedBait),
        new Promise<void>((resolve) => setTimeout(resolve, FISHING_VISUALS.castDurationMs)),
      ])
      view = result.state
      if (!result.ok) {
        fail('error', result.message)
        return
      }
      if (!visible) {
        void window.electronAPI.fishingCancel(result.session.token)
        return
      }
      dispatch({
        type: 'CAST_ACCEPTED',
        token: result.session.token,
        biteAt: result.session.biteAt,
        deadline: result.session.deadline,
      })
      scheduleSession()
    } catch {
      fail('error', '抛竿失败，请重试。')
    }
  }

  const refresh = async () => {
    try {
      view = await window.electronAPI.fishingGetState()
      message = ''
    } catch {
      message = '鱼塘加载失败，请稍后重试。'
    }
    paint()
  }

  root.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const bait = target.closest<HTMLElement>('[data-fishing-bait]')?.dataset.fishingBait
    if ((bait === 'basic' || bait === 'premium') && uiState.phase === 'idle') {
      selectedBait = bait
      paint()
      return
    }
    const pond = target.closest<HTMLElement>('[data-fishing-pond]')
    if (pond && uiState.phase === 'idle') {
      castPoint = normalizePondPoint(event.clientX, event.clientY, pond.getBoundingClientRect())
      void cast()
      return
    }
    if (target.closest('[data-fishing-backpack-open]')) openBackpackTab('fish')
    else if (target.closest('[data-fishing-catalog-open]')) {
      catalogOpen = true
      paint()
    } else if (target.closest('[data-fishing-catalog-close]')) {
      catalogOpen = false
      paint()
    }
    else if (target.closest('[data-fishing-result-close]')) {
      message = ''
      dispatch({ type: 'RESET' })
    }
  })

  window.addEventListener('keydown', (event) => {
    if (!visible || !isFishingReelShortcut(event.code, event.repeat)) return
    if (uiState.phase !== 'waiting' && uiState.phase !== 'biting') return
    event.preventDefault()
    void reel()
  })

  onPageChange((pageId) => {
    visible = pageId === 'fishing-page'
    if (visible) {
      void refresh()
      return
    }
    const token = activeToken(uiState)
    if (token) void window.electronAPI.fishingCancel(token)
    clearTimers()
    catalogOpen = false
    uiState = { phase: 'idle' }
  })

  window.addEventListener('beforeunload', () => {
    const token = activeToken(uiState)
    if (token) void window.electronAPI.fishingCancel(token)
  })

  if (visible) void refresh()
  else paint()
}
