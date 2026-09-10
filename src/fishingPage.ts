import { getBaitCatalogEntry } from '../electron/fishing/baitCatalog'
import { getFishCatalogEntry, getFishIds, fishRarityLabel } from '../electron/fishing/fishCatalog'
import {
  LINE_TENSION_WARNING,
  TENSION_RECOVERY_MS,
  lineStatusForTension,
} from '../electron/fishing/fishingSession'
import type { BaitId } from '../electron/fishing/fishingTypes'
import type { GameViewState } from '../electron/game/gameTypes'
import { getCurrentPage, onPageChange } from './appNavigation'
import { openBackpackTab } from './backpackPage'
import { FISHING_ASSETS, getBaitImagePath, getFishImagePath } from './fishingAssets'
import {
  reduceFishingState,
  type FishingUiEvent,
  type FishingFailureReason,
  type FishingUiState,
} from './fishingStateMachine'
import { escapeHtml } from './gamePageShared'

const PHASE_COPY: Record<FishingUiState['phase'], string> = {
  idle: '选择鱼饵后，点击水面抛竿',
  casting: '抛竿中…',
  waiting: '浮漂静静地等着鱼儿…',
  biting: '鱼儿咬钩了！长按空格收线',
  resolving: '正在收线…',
  caught: '钓到了！',
  failed: '这次没钓到',
}

const LINE_RED_COPY = '鱼线变红了！松开空格'
const FISHING_REEL_TICK_MS = 220

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

export function getDisplayedFishingTension(
  state: FishingUiState,
  now = Date.now(),
): number {
  const fight = state.phase === 'biting' || state.phase === 'resolving' ? state.fight : undefined
  if (!fight) return 0
  const elapsed = Math.max(0, now - fight.tensionAt)
  return Math.min(1, Math.max(0, fight.tension - elapsed / TENSION_RECOVERY_MS))
}

export function getDisplayedFishingLineStatus(
  state: FishingUiState,
  now = Date.now(),
): 'safe' | 'warning' | 'danger' {
  const fight = state.phase === 'biting' || state.phase === 'resolving' ? state.fight : undefined
  if (fight?.lineDangerUntil && fight.lineDangerUntil > now) return 'danger'
  if (fight?.lineRecoveryUntil && fight.lineRecoveryUntil > now) {
    return fight.lineRecoveryStatus
  }
  const tensionStatus = lineStatusForTension(getDisplayedFishingTension(state, now))
  return tensionStatus === 'danger' ? 'warning' : tensionStatus
}

function mixColor(start: [number, number, number], end: [number, number, number], amount: number): string {
  const ratio = Math.min(1, Math.max(0, amount))
  const channels = start.map((channel, index) =>
    Math.round(channel + (end[index] - channel) * ratio))
  return `rgb(${channels.join(', ')})`
}

export function getDisplayedFishingLineColor(
  state: FishingUiState,
  now = Date.now(),
): string {
  const fight = state.phase === 'biting' || state.phase === 'resolving' ? state.fight : undefined
  const lineStatus = getDisplayedFishingLineStatus(state, now)
  if (lineStatus === 'danger') return '#ef4141'
  if (fight?.lineRecoveryUntil && fight.lineRecoveryUntil > now) {
    return fight.lineRecoveryStatus === 'warning' ? '#f0c63f' : '#161c1c'
  }

  const tension = getDisplayedFishingTension(state, now)
  return mixColor(
    [22, 28, 28],
    [238, 198, 55],
    Math.min(1, tension / LINE_TENSION_WARNING),
  )
}

function getFightState(state: FishingUiState) {
  return state.phase === 'biting' || state.phase === 'resolving' ? state.fight : undefined
}

export function renderFishingPage(
  view: GameViewState,
  state: FishingUiState,
  selectedBait: BaitId,
  message: string,
  catalogOpen = false,
  castPoint: PondPoint = { x: 55, y: 55 },
  bobberPoint: PondPoint = castPoint,
): string {
  const fishCount = view.inventory.fish.length
  const fight = getFightState(state)
  const tension = getDisplayedFishingTension(state)
  const tensionStatus = lineStatusForTension(tension)
  const lineStatus = getDisplayedFishingLineStatus(state)
  const lineColor = getDisplayedFishingLineColor(state)
  const progress = Math.min(1, Math.max(0, fight?.progress ?? 0))
  const isFighting = state.phase === 'biting' || state.phase === 'resolving'
  const status = message || (
    lineStatus === 'danger' && isFighting
      ? LINE_RED_COPY
      : PHASE_COPY[state.phase]
  )
  const lineStatusLabel = {
    safe: '安全',
    warning: '绷紧',
    danger: '危险',
  }[tensionStatus]
  const fightPanel = isFighting
    ? `
      <section class="fishing-fight-panel" aria-label="钓鱼对抗状态">
        <div class="fishing-fight-meter">
          <div class="fishing-fight-meter__label"><span>收线进度</span><strong>${Math.round(progress * 100)}%</strong></div>
          <div class="fishing-meter-track"><i data-fishing-progress-fill style="width:${Math.round(progress * 100)}%"></i></div>
        </div>
        <div class="fishing-fight-meter fishing-fight-meter--tension fishing-fight-meter--${tensionStatus}" data-fishing-tension-meter>
          <div class="fishing-fight-meter__label"><span>鱼线张力</span><strong data-fishing-tension-label>${lineStatusLabel}</strong></div>
          <div class="fishing-meter-track"><i data-fishing-tension-fill style="width:${Math.round(tension * 100)}%"></i></div>
        </div>
        <span class="fishing-fish-pull">鱼的反拉 ${Math.round((fight?.fishPull ?? 0) * 100)}%</span>
      </section>
    `
    : ''
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
      <div class="fishing-pond" style="background-image:url('${FISHING_ASSETS.pond}');--fishing-cast-x:${bobberPoint.x}%;--fishing-cast-y:${bobberPoint.y}%;--fishing-cast-duration:${FISHING_VISUALS.castDurationMs}ms;--fishing-line-width:${FISHING_VISUALS.lineWidthPx}px;--fishing-bobber-size:${FISHING_VISUALS.bobberSizePx}px;--fishing-line-tension:${tension};--fishing-line-color:${lineColor}" data-fishing-pond>
        <div class="fishing-water-shimmer" aria-hidden="true"></div>
        <div class="fishing-fish-shadows" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <svg class="fishing-line" data-fishing-line-status="${lineStatus}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="8" y1="100" x2="${bobberPoint.x}" y2="${bobberPoint.y}"></line>
        </svg>
        <img class="fishing-bobber" src="${FISHING_ASSETS.bobber}" alt="" />
        <div class="fishing-ripple" aria-hidden="true"></div>
        <div class="fishing-splash" aria-hidden="true"><i></i><i></i><i></i></div>
      </div>
      <p class="fishing-status" role="status">${escapeHtml(status)}</p>
      ${fightPanel}
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
  let resetTimer: ReturnType<typeof setTimeout> | undefined
  let tensionTimer: ReturnType<typeof setInterval> | undefined
  let reelTicker: ReturnType<typeof setInterval> | undefined
  let reelInFlight = false
  let spaceHeld = false
  let bobberPoint: PondPoint = castPoint
  let bobberTarget: PondPoint = castPoint
  let nextBobberWanderAt = 0
  let visible = getCurrentPage() === 'fishing-page'

  const stopReeling = () => {
    spaceHeld = false
    if (reelTicker) clearInterval(reelTicker)
    reelTicker = undefined
  }

  const clearTimers = () => {
    if (biteTimer) clearTimeout(biteTimer)
    if (resetTimer) clearTimeout(resetTimer)
    if (tensionTimer) clearInterval(tensionTimer)
    stopReeling()
    biteTimer = resetTimer = tensionTimer = undefined
  }

  const updateBobberVisuals = (now: number) => {
    if (uiState.phase !== 'biting' && uiState.phase !== 'resolving') return
    if (spaceHeld && now >= nextBobberWanderAt) {
      bobberTarget = {
        x: Math.min(90, Math.max(10, castPoint.x + (Math.random() * 2 - 1) * 15)),
        y: Math.min(88, Math.max(12, castPoint.y + 4 + Math.random() * 12)),
      }
      nextBobberWanderAt = now + 280 + Math.random() * 520
    } else if (!spaceHeld) {
      bobberTarget = castPoint
    }

    const easing = spaceHeld ? 0.18 : 0.1
    bobberPoint = {
      x: bobberPoint.x + (bobberTarget.x - bobberPoint.x) * easing,
      y: bobberPoint.y + (bobberTarget.y - bobberPoint.y) * easing,
    }
    const pond = root.querySelector<HTMLElement>('[data-fishing-pond]')
    const line = root.querySelector<SVGLineElement>('.fishing-line line')
    if (pond) {
      pond.style.setProperty('--fishing-cast-x', `${bobberPoint.x}%`)
      pond.style.setProperty('--fishing-cast-y', `${bobberPoint.y}%`)
    }
    if (line) {
      line.setAttribute('x2', bobberPoint.x.toFixed(2))
      line.setAttribute('y2', bobberPoint.y.toFixed(2))
    }
  }

  const updateFightVisuals = () => {
    if (uiState.phase !== 'biting' && uiState.phase !== 'resolving') return
    const now = Date.now()
    updateBobberVisuals(now)
    const tension = getDisplayedFishingTension(uiState, now)
    const tensionStatus = lineStatusForTension(tension)
    const lineStatus = getDisplayedFishingLineStatus(uiState, now)
    const lineColor = getDisplayedFishingLineColor(uiState, now)
    const percent = `${Math.round(tension * 100)}%`
    const pond = root.querySelector<HTMLElement>('[data-fishing-pond]')
    const line = root.querySelector<SVGElement>('.fishing-line')
    const tensionMeter = root.querySelector<HTMLElement>('[data-fishing-tension-meter]')
    const tensionFill = root.querySelector<HTMLElement>('[data-fishing-tension-fill]')
    const tensionLabel = root.querySelector<HTMLElement>('[data-fishing-tension-label]')
    if (pond) {
      pond.style.setProperty('--fishing-line-tension', String(tension))
      pond.style.setProperty('--fishing-line-color', lineColor)
    }
    if (line) line.setAttribute('data-fishing-line-status', lineStatus)
    if (tensionMeter) tensionMeter.className = `fishing-fight-meter fishing-fight-meter--tension fishing-fight-meter--${tensionStatus}`
    if (tensionFill) tensionFill.style.width = percent
    if (tensionLabel) tensionLabel.textContent = { safe: '安全', warning: '绷紧', danger: '危险' }[tensionStatus]
    if (!message) {
      const status = root.querySelector<HTMLElement>('.fishing-status')
      if (status) status.textContent = lineStatus === 'danger' ? LINE_RED_COPY : PHASE_COPY.biting
    }
  }

  const startTensionTicker = () => {
    if (tensionTimer) return
    tensionTimer = setInterval(() => {
      if (nextTimedEvent(uiState, Date.now())?.type === 'BITE_EXPIRED') {
        fail('too-late', '鱼儿挣脱了，收线太慢')
        return
      }
      if (uiState.phase === 'biting' || uiState.phase === 'resolving') {
        updateFightVisuals()
      } else {
        clearTimers()
      }
    }, 100)
  }

  const paint = () => {
    root.innerHTML = view
      ? renderFishingPage(view, uiState, selectedBait, message, catalogOpen, castPoint, bobberPoint)
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

  const fail = (reason: FishingFailureReason, copy: string) => {
    clearTimers()
    reelInFlight = false
    message = copy
    dispatch({ type: 'REEL_FAILED', reason })
    resetSoon()
  }

  const reel = async () => {
    const token = activeToken(uiState)
    if (!token || uiState.phase !== 'biting' || reelInFlight) return
    reelInFlight = true
    dispatch({ type: 'REEL_REQUESTED' })
    try {
      const result = await window.electronAPI.fishingReel(token)
      view = result.state
      if (result.ok) {
        reelInFlight = false
        if (result.status === 'caught') {
          clearTimers()
          message = ''
          dispatch({ type: 'REEL_CAUGHT', catch: result.catch })
          return
        }
        message = ''
        dispatch({
          type: 'REEL_CONTINUED',
          deadline: result.fight.deadline,
          fight: result.fight,
        })
        startTensionTicker()
      } else {
        reelInFlight = false
        const reason = result.status === 'too-early' || result.status === 'too-late'
          ? result.status
          : result.status === 'line-broken'
            ? 'line-broken'
          : 'error'
        fail(reason, result.message)
      }
    } catch {
      fail('error', '收杆失败，请重新尝试。')
    }
  }

  const startReeling = () => {
    if (spaceHeld || uiState.phase !== 'biting') return
    spaceHeld = true
    nextBobberWanderAt = 0
    void reel()
    reelTicker = setInterval(() => {
      if (!spaceHeld || uiState.phase !== 'biting') {
        stopReeling()
        return
      }
      void reel()
    }, FISHING_REEL_TICK_MS)
  }

  const scheduleSession = () => {
    if (uiState.phase !== 'waiting') return
    const biteDelay = Math.max(0, uiState.biteAt - Date.now())
    biteTimer = setTimeout(() => {
      if (uiState.phase !== 'waiting') return
      dispatch({ type: 'BITE_STARTED' })
      startTensionTicker()
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
      bobberPoint = castPoint
      bobberTarget = castPoint
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
    if (!visible || catalogOpen || !isFishingReelShortcut(event.code, event.repeat)) return
    if (uiState.phase !== 'biting') return
    event.preventDefault()
    startReeling()
  })

  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Space') return
    stopReeling()
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
    bobberPoint = castPoint
    bobberTarget = castPoint
  })

  window.addEventListener('blur', stopReeling)

  window.addEventListener('beforeunload', () => {
    stopReeling()
    const token = activeToken(uiState)
    if (token) void window.electronAPI.fishingCancel(token)
  })

  if (visible) void refresh()
  else paint()
}
