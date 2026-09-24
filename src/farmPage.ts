import { CROPS, plotUnlockRequirement } from '../electron/farm/farmCatalog'
import { getCropShopImgPath } from '../electron/farm/cropCatalog'
import { farmXpProgress, xpRemainingToLevel } from '../electron/farm/farmLevel'
import type { CropId, FarmPageContext, FarmState, PlotState, Weather } from '../electron/farm/farmTypes'
import type { FarmVisitLog, FriendFarm, FriendUser } from '../electron/gameAccount/types'
import {
  cropGrowthStage,
  cropSpriteStyle,
  farmCatalogIconHtml,
  FARM_ASSETS,
  findPlotIndexAtClientPoint,
  plotSoilSrc,
  syncFarmPlotLayout,
} from './farmAssets'
import { navigateToPage, onPageChange, getCurrentPage } from './appNavigation'
import { openFarmLevelGuide } from './farmLevelGuide'
import type { DecorId } from '../electron/game/gameTypes'
import { getDecorFarmClick } from '../electron/game/decorCatalog'
import { playFarmPesticideEffect, playFarmWaterEffect, preloadFarmPlotEffect } from './farmPlotWaterEffect'
import { createFarmPollen, type FarmPollenHandle } from './farmPollenEffect'
import { placedDecorsToFarmDecors, farmDecorsToPlaced, renderFarmDecorHtml, syncFarmDecorDom, type FarmDecorDef } from './farmSceneDecor'
import { mountFarmSceneEditor, type FarmSceneEditorHandle } from './farmSceneEditor'

type PlotDisplayStatus = 'empty' | 'growing' | 'dry' | 'bug' | 'ready' | 'locked'

const DEFAULT_FARM_CONTEXT: FarmPageContext = {
  walletCoins: 0,
  farmLevel: 0,
  farmTotalXp: 0,
  farmXpProgress: { current: 0, required: 500, isMaxLevel: false },
  ownedDecors: {},
}

const WEATHER_LABEL: Record<Weather, string> = {
  clear: '☀️ 晴天',
  rain: '🌧️ 雨天（自动浇水）',
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]!)
}

function showFarmDialog(title: string, message: string): void {
  document.querySelector('.farm-action-dialog')?.remove()
  const modal = document.createElement('div')
  modal.className = 'farm-action-dialog'
  modal.setAttribute('role', 'presentation')
  modal.innerHTML = `<section class="farm-action-dialog__panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p><button class="primary-button" type="button" data-farm-dialog-close>知道了</button></section>`
  const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
  const close = () => { document.removeEventListener('keydown', onKeyDown); modal.remove() }
  modal.addEventListener('click', event => {
    if (event.target === modal || (event.target as Element).closest('[data-farm-dialog-close]')) close()
  })
  document.addEventListener('keydown', onKeyDown)
  document.body.appendChild(modal)
  modal.querySelector<HTMLButtonElement>('[data-farm-dialog-close]')?.focus()
}

export type FarmFriendPickerState = {
  friends: FriendUser[]
  onlineUserIds: Array<number | string>
  loading: boolean
  message: string | null
  query?: string
}

export function renderFarmFriendPicker(state: FarmFriendPickerState): string {
  const query = (state.query ?? '').trim().toLocaleLowerCase()
  const friends = [...state.friends]
    .sort((a, b) => Number(state.onlineUserIds.some(id => String(id) === String(b.id))) - Number(state.onlineUserIds.some(id => String(id) === String(a.id))))
    .filter(friend => !query || [friend.nickname, friend.remark, friend.uid].filter(Boolean).some(value => String(value).toLocaleLowerCase().includes(query)))
  const rows = state.loading
    ? '<li class="farm-friend-picker-empty">加载好友中…</li>'
    : friends.length
      ? friends.map(friend => {
        const online = state.onlineUserIds.some(id => String(id) === String(friend.id))
        return `<li class="farm-friend-picker-row"><span class="farm-friend-picker-identity"><strong>${escapeHtml(friend.remark || friend.nickname || '未命名玩家')}</strong>${friend.remark && friend.nickname ? `<small>昵称：${escapeHtml(friend.nickname)}</small>` : ''}<small>UID：${escapeHtml(friend.uid)}</small><small class="account-friend-presence ${online ? 'is-online' : 'is-offline'}">${online ? '好友在线' : '好友离线'}</small></span><button class="secondary-button" type="button" data-farm-friend-id="${escapeHtml(friend.id)}">进入农场</button></li>`
      }).join('')
      : `<li class="farm-friend-picker-empty">${query ? '没有匹配的好友。' : '还没有好友，先去好友页添加好友。'}</li>`
  return `<aside class="farm-friend-picker" aria-label="好友农场列表"><div class="farm-friend-picker-heading"><div><strong>好友农场</strong><p>在线好友优先显示。</p></div><button class="text-button" type="button" data-farm-action="close-friends">关闭</button></div><input class="farm-friend-picker-search" type="search" data-farm-friend-search value="${escapeHtml(state.query ?? '')}" placeholder="搜索昵称、备注或 UID" aria-label="搜索好友" />${state.message ? `<p class="account-message account-message--info">${escapeHtml(state.message)}</p>` : ''}<ul>${rows}</ul></aside>`
}

function waterIntervalMs(cropId: CropId, weather: Weather): number {
  const base = CROPS[cropId].waterIntervalMs
  return weather === 'rain' ? base * 2 : base
}

function getPlotDisplayStatus(plot: PlotState, weather: Weather, now: number): PlotDisplayStatus {
  if (plot.status === 'locked') return 'locked'
  if (plot.status === 'empty') return 'empty'
  if (plot.status === 'ready') return 'ready'
  if (weather === 'rain') return plot.hasBug ? 'bug' : 'growing'
  if (plot.hasBug) return 'bug'
  if (now > plot.lastWateredAt + waterIntervalMs(plot.cropId, weather)) return 'dry'
  return 'growing'
}

export function renderFarmPlotBadges(display: PlotDisplayStatus, visitMode: boolean, stolen: boolean): string {
  const badges: string[] = []
  const stealable = visitMode && display === 'ready' && !stolen
  if (stealable) badges.push('<span class="farm-plot-badge farm-plot-badge--steal">偷取</span>')
  if (display === 'bug') badges.push('<span class="farm-plot-badge farm-plot-badge--bug">虫</span>')
  if (display === 'ready') badges.push('<span class="farm-plot-badge farm-plot-badge--ready">熟</span>')
  if (display === 'dry') badges.push('<span class="farm-plot-badge farm-plot-badge--dry">旱</span>')
  return badges.join('')
}

type FarmVisitContext = { owner: FriendUser; farm: FriendFarm }
let pendingFarmVisit: FarmVisitContext | null = null
let farmVisitListener: ((event: Event) => void) | undefined

export function openFriendFarm(visit: FarmVisitContext): void {
  pendingFarmVisit = visit
  window.dispatchEvent(new CustomEvent('farm:visit'))
}

function renderPlot(
  plot: PlotState,
  index: number,
  state: FarmState,
  now: number,
  context: FarmPageContext,
  visitMode = false,
): string {
  const display = getPlotDisplayStatus(plot, state.weather, now)
  const planted = plot.status === 'growing' || plot.status === 'ready' ? plot : null
  const crop = planted ? CROPS[planted.cropId] : null
  const ready = plot.status === 'ready'
  const progress =
    planted && crop
      ? Math.min(100, Math.round((planted.progressMs / crop.growMs) * 100))
      : 0
  const stage = planted && crop ? cropGrowthStage(progress / 100, ready) : 0
  const soil = plotSoilSrc(display)

  const cropLayer =
    planted && crop
      ? `<div class="farm-crop-sprite" style="${cropSpriteStyle(planted.cropId, stage)}" title="${escapeHtml(crop.name)}"></div>`
      : ''

  const soilLayer = soil
    ? `<img class="farm-plot-soil" src="${soil}" alt="" draggable="false" />`
    : ''
  const unlockLabel = display === 'locked' ? '<span class="farm-plot-unlock-label">解锁</span>' : ''

  const plantedStolen = planted?.stolen === true
  const visitStealable = visitMode && display === 'ready' && !plantedStolen
  return `
    <button class="farm-plot-tile farm-plot-tile--${display}" type="button" data-plot="${index}" ${visitStealable ? 'data-visit-stealable="true"' : ''} aria-label="地块 ${index + 1}${display === 'locked' ? ' 解锁' : ''}">
      ${soilLayer}
      ${cropLayer}
      <div class="farm-plot-badges${visitStealable ? ' farm-plot-badges--stealable' : ''}">${renderFarmPlotBadges(display, visitMode, plantedStolen)}</div>
      ${unlockLabel}
    </button>
  `
}

function renderSeedPicker(seeds: Record<string, number>, selected: CropId): string {
  const owned = (Object.keys(CROPS) as CropId[]).filter((id) => (seeds[id] ?? 0) > 0)
  if (owned.length === 0) {
    return '<p class="farm-seed-empty">暂无种子</p>'
  }

  return owned
    .map((id) => {
      const count = seeds[id] ?? 0
      const active = id === selected ? ' farm-seed-card--active' : ''
      return `
        <button class="farm-seed-card${active}" type="button" data-crop="${id}" aria-pressed="${id === selected}">
          ${farmCatalogIconHtml(getCropShopImgPath(id), 'farm-seed-card-icon')}
          <span class="farm-seed-card-name">${escapeHtml(CROPS[id].name)}</span>
          <span class="farm-seed-card-count">×${count}</span>
        </button>
      `
    })
    .join('')
}

function renderFarmLevelHud(context: FarmPageContext): string {
  const { farmLevel, farmXpProgress } = context
  if (farmXpProgress.isMaxLevel) {
    return `
      <button type="button" class="farm-hud-level" data-farm-level-guide aria-label="查看农场等级奖励">
        <span class="farm-hud-level-label">🌾 农 Lv.${farmLevel}</span>
        <div class="farm-xp-bar farm-xp-bar--max" aria-hidden="true"><span class="farm-xp-bar-fill"></span></div>
        <span class="farm-xp-text">MAX</span>
      </button>
    `
  }

  const pct = farmXpProgress.required > 0
    ? Math.min(100, Math.round((farmXpProgress.current / farmXpProgress.required) * 100))
    : 0

  return `
    <button type="button" class="farm-hud-level" data-farm-level-guide aria-label="查看农场等级奖励">
      <span class="farm-hud-level-label">🌾 农 Lv.${farmLevel}</span>
      <div class="farm-xp-bar" aria-hidden="true">
        <span class="farm-xp-bar-fill" style="width:${pct}%"></span>
      </div>
      <span class="farm-xp-text">${farmXpProgress.current}/${farmXpProgress.required}</span>
    </button>
  `
}

function renderFarm(
  state: FarmState,
  selectedCrop: CropId,
  now: number,
  toast: string,
  context: FarmPageContext,
  decors: FarmDecorDef[],
  visit?: FarmVisitContext,
  friendPickerOpen = false,
  friendPicker?: FarmFriendPickerState,
  friendFarmRefreshing = false,
): string {
  return `
    <div class="farm-page-actions" role="toolbar" aria-label="农场操作">
        ${visit ? '<button class="secondary-button" type="button" data-farm-action="back">返回我的农场</button><button class="secondary-button" type="button" data-farm-action="refresh-friend"' + (friendFarmRefreshing ? ' disabled' : '') + '>' + (friendFarmRefreshing ? '刷新中…' : '刷新农场') + '</button>' : ''}<button class="secondary-button" type="button" data-farm-action="friends">好友农场</button><button class="secondary-button farm-log-button" type="button" data-farm-action="logs">农场日志</button>
      ${friendPickerOpen && friendPicker ? renderFarmFriendPicker(friendPicker) : ''}
    </div>
    <div class="farm-scene">
      <div class="farm-hud">
        ${renderFarmLevelHud(context)}
        ${visit ? `<div class="farm-hud-pill">正在访问：${escapeHtml(visit.owner.remark || visit.owner.nickname || '好友')}的农场</div>` : `<div class="farm-hud-pill">🪙 ${context.walletCoins}</div>`}
        <div class="farm-hud-pill">${WEATHER_LABEL[state.weather]}</div>
      </div>

      ${toast ? `<p class="farm-toast" role="status">${escapeHtml(toast)}</p>` : ''}

      <div class="farm-stage${visit ? ' farm-stage--visiting' : ''}" style="background-image:url('${FARM_ASSETS.bg}')">
        ${renderFarmDecorHtml(decors)}
        ${state.plots.map((plot, i) => renderPlot(plot, i, state, now, context, Boolean(visit))).join('')}
      </div>

      ${visit ? '' : `<div class="farm-seed-bar" role="toolbar" aria-label="选择种子">
        <span class="farm-seed-label">种子</span>
        <div class="farm-seed-scroll">${renderSeedPicker(state.seeds, selectedCrop)}</div>
      </div>`}
    </div>
  `
}

function totalSeeds(seeds: Record<string, number>): number {
  return Object.values(seeds).reduce((sum, n) => sum + (n > 0 ? n : 0), 0)
}

function defaultSelectedCrop(seeds: Record<string, number>): CropId {
  for (const id of Object.keys(CROPS) as CropId[]) {
    if ((seeds[id] ?? 0) > 0) return id
  }
  return 'wheat'
}

function resolveSelectedCrop(seeds: Record<string, number>, current: CropId): CropId {
  if ((seeds[current] ?? 0) > 0) return current
  return defaultSelectedCrop(seeds)
}

export function mountFarmPage() {
  const farmRoot = document.querySelector<HTMLElement>('#farm-root')
  if (!farmRoot) return
  setupFarmPage(farmRoot)
}

function setupFarmPage(farmRoot: HTMLElement) {
  let farmState: FarmState | null = null
  let farmContext: FarmPageContext = DEFAULT_FARM_CONTEXT
  let selectedCrop: CropId = 'wheat'
  let busy = false
  let toast = ''
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let closeLevelGuide: (() => void) | undefined
  let farmDecors: FarmDecorDef[] = []
  let sceneEditor: FarmSceneEditorHandle | undefined
  let visit: FarmVisitContext | null = null
  let friendFarmRefreshing = false
  let friendFarmRefreshTimer: ReturnType<typeof setInterval> | undefined
  let visitLogs: FarmVisitLog[] = []
  let onlineUserIds: Array<number | string> = []
  let friendPickerOpen = false
  let friendPicker: FarmFriendPickerState = { friends: [], onlineUserIds: [], loading: false, message: null }
  const pollen: FarmPollenHandle = createFarmPollen()

  function syncDecorsFromState(state: FarmState) {
    farmDecors = placedDecorsToFarmDecors(state.placedDecors ?? [])
  }

  function updateToastDom() {
    const scene = farmRoot.querySelector<HTMLElement>('.farm-scene')
    if (!scene) return
    let toastEl = scene.querySelector<HTMLElement>('.farm-toast')
    if (!toast) {
      toastEl?.remove()
      return
    }
    if (!toastEl) {
      const hud = scene.querySelector('.farm-hud')
      hud?.insertAdjacentHTML('afterend', `<p class="farm-toast" role="status">${escapeHtml(toast)}</p>`)
      return
    }
    toastEl.textContent = toast
  }

  function updatePlotTile(btn: HTMLButtonElement, plotIndex: number, now: number) {
    if (!farmState) return
    const plot = farmState.plots[plotIndex]
    if (!plot) return

    const display = getPlotDisplayStatus(plot, farmState.weather, now)
    const planted = plot.status === 'growing' || plot.status === 'ready' ? plot : null
    const crop = planted ? CROPS[planted.cropId] : null
    const ready = plot.status === 'ready'
    const progress =
      planted && crop
        ? Math.min(100, Math.round((planted.progressMs / crop.growMs) * 100))
        : 0
    const stage = planted && crop ? cropGrowthStage(progress / 100, ready) : 0

    const stolen = planted?.stolen === true
    const stealable = Boolean(visit && display === 'ready' && !stolen)
    btn.className = `farm-plot-tile farm-plot-tile--${display}`
    btn.setAttribute('aria-label', `地块 ${plotIndex + 1}${display === 'locked' ? ' 解锁' : ''}`)

    const soilSrc = plotSoilSrc(display)
    let soil = btn.querySelector<HTMLImageElement>('.farm-plot-soil')
    if (soilSrc) {
      if (!soil) {
        btn.insertAdjacentHTML('afterbegin', `<img class="farm-plot-soil" alt="" draggable="false" />`)
        soil = btn.querySelector<HTMLImageElement>('.farm-plot-soil')
      }
      if (soil) soil.src = soilSrc
    } else {
      soil?.remove()
    }

    const badgesEl = btn.querySelector<HTMLElement>('.farm-plot-badges')
    if (badgesEl) {
      badgesEl.innerHTML = renderFarmPlotBadges(display, Boolean(visit), stolen)
      badgesEl.classList.toggle('farm-plot-badges--stealable', stealable)
    }

    let unlockEl = btn.querySelector<HTMLElement>('.farm-plot-unlock-label')
    if (display === 'locked') {
      if (!unlockEl) {
        btn.insertAdjacentHTML('beforeend', '<span class="farm-plot-unlock-label">解锁</span>')
        unlockEl = btn.querySelector<HTMLElement>('.farm-plot-unlock-label')
      }
    } else {
      unlockEl?.remove()
    }

    let cropEl = btn.querySelector<HTMLElement>('.farm-crop-sprite')
    if (planted && crop) {
      if (!cropEl) {
        btn.querySelector('.farm-plot-badges')?.insertAdjacentHTML(
          'beforebegin',
          `<div class="farm-crop-sprite" title="${escapeHtml(crop.name)}"></div>`,
        )
        cropEl = btn.querySelector<HTMLElement>('.farm-crop-sprite')
      }
      if (cropEl) {
        cropEl.setAttribute('title', crop.name)
        cropEl.setAttribute('style', cropSpriteStyle(planted.cropId, stage))
      }
    } else {
      cropEl?.remove()
    }
  }

  function tickPlots() {
    if (!farmState || busy) return
    const now = Date.now()
    farmRoot.querySelectorAll<HTMLButtonElement>('.farm-plot-tile').forEach((btn) => {
      const plotIndex = Number(btn.dataset.plot)
      if (!Number.isInteger(plotIndex)) return
      updatePlotTile(btn, plotIndex, now)
    })
  }

  function showToast(message: string) {
    toast = message
    updateToastDom()
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toast = ''
      updateToastDom()
    }, 2200)
  }

  let plotLayoutResizeStage: HTMLElement | null = null
  let plotLayoutResizeObserver: ResizeObserver | null = null

  function syncPlotLayout() {
    syncFarmPlotLayout(farmRoot)
    // 首次 paint 时 stage 可能尚未完成布局，补一帧确保 24 块坐标一致
    requestAnimationFrame(() => syncFarmPlotLayout(farmRoot))
  }

  function ensurePlotLayoutResizeObserver() {
    const stage = farmRoot.querySelector<HTMLElement>('.farm-stage')
    if (!stage || plotLayoutResizeStage === stage) return
    plotLayoutResizeObserver?.disconnect()
    plotLayoutResizeStage = stage
    plotLayoutResizeObserver = new ResizeObserver(() => syncPlotLayout())
    plotLayoutResizeObserver.observe(stage)
  }

  function paint() {
    if (!farmState) {
      farmRoot.innerHTML = '<p class="sysinfo-loading">加载农场…</p>'
      return
    }
    const existingEditorToggle = document.querySelector<HTMLButtonElement>('#farm-page .farm-scene-editor-toggle')
    farmRoot.innerHTML = renderFarm(farmState, selectedCrop, Date.now(), toast, farmContext, farmDecors, visit || undefined, friendPickerOpen, { ...friendPicker, onlineUserIds }, friendFarmRefreshing)
    bindEvents()
    syncPlotLayout()
    ensurePlotLayoutResizeObserver()
    ensureSceneEditor()
    const editorToggle = existingEditorToggle ?? document.querySelector<HTMLButtonElement>('#farm-page .farm-scene-editor-toggle')
    if (editorToggle) farmRoot.querySelector('.farm-page-actions')?.appendChild(editorToggle)
    const stage = farmRoot.querySelector<HTMLElement>('.farm-stage')
    if (stage) {
      pollen.attach(stage)
      pollen.setWeather(farmState.weather)
    }
  }

  function ensureSceneEditor() {
    const host = document.querySelector<HTMLElement>('#farm-page')
    if (!host) return
    if (!sceneEditor) {
      sceneEditor = mountFarmSceneEditor(host, {
        mode: 'player',
        getStage: () => farmRoot.querySelector<HTMLElement>('.farm-stage'),
        getDecors: () => farmDecors,
        setDecors: (decors) => {
          farmDecors = decors
        },
        getOwnedDecors: () => farmContext.ownedDecors ?? {},
        onDecorsChange: () => {},
        onPlaceDecor: async (decorId) => {
          if (busy) return
          busy = true
          try {
            const result = await window.electronAPI.farmPlaceDecor({ decorId: decorId as DecorId })
            farmState = result.state
            if (result.context) farmContext = result.context
            if (!result.ok) {
              showToast(result.error ?? '放置失败')
              return
            }
            syncDecorsFromState(result.state)
            const stage = farmRoot.querySelector<HTMLElement>('.farm-stage')
            if (stage) syncFarmDecorDom(stage, farmDecors)
          } catch {
            showToast('放置失败，请重试。')
          } finally {
            busy = false
          }
        },
        onRemoveDecor: async (instanceId) => {
          if (busy) return
          busy = true
          try {
            const result = await window.electronAPI.farmRemoveDecor({ instanceId })
            farmState = result.state
            if (result.context) farmContext = result.context
            if (!result.ok) {
              showToast(result.error ?? '收回失败')
              return
            }
            syncDecorsFromState(result.state)
            const stage = farmRoot.querySelector<HTMLElement>('.farm-stage')
            if (stage) syncFarmDecorDom(stage, farmDecors)
          } catch {
            showToast('收回失败，请重试。')
          } finally {
            busy = false
          }
        },
        onPersistLayout: async (decors) => {
          try {
            const result = await window.electronAPI.farmSavePlacedDecors({
              placedDecors: farmDecorsToPlaced(decors),
            })
            if (!result.ok) {
              showToast(result.error ?? '保存布局失败')
              return
            }
            farmState = result.state
            if (result.context) farmContext = result.context
            syncDecorsFromState(result.state)
          } catch {
            showToast('保存布局失败，请重试。')
          }
        },
      })
      return
    }
    sceneEditor.rebindStage()
  }

  async function refresh() {
    if (visit) return
    try {
      const result = await window.electronAPI.farmGetState()
      farmState = result.state
      farmContext = result.context ?? DEFAULT_FARM_CONTEXT
      if (!result.ok) showToast(result.error ?? '读取失败')
      selectedCrop = resolveSelectedCrop(farmState.seeds, selectedCrop)
      syncDecorsFromState(farmState)
      paint()
    } catch {
      showToast('无法读取农场状态，请重试。')
      paint()
    }
  }

  async function showLogs() {
    const result = await window.electronAPI.gameAccountListFarmVisits()
    if (!result.ok) { showToast(result.error.message); return }
    visitLogs = result.data.logs
    let filter: 'all' | 'viewed' | 'stolen' = 'all'
    const modal = document.createElement('div')
    modal.className = 'farm-log-modal'
    const renderRows = () => {
      const filtered = filter === 'all' ? visitLogs : visitLogs.filter(log => log.action === filter)
      return filtered.length ? filtered.map(log => `<li class="farm-log-entry farm-log-entry--${log.action}"><strong>${escapeHtml(log.action === 'stolen' ? '收获' : '访问')}</strong> · ${escapeHtml(log.visitorNickname || '玩家')}（UID：${escapeHtml(log.visitorUid || String(log.visitorUserId))}） · ${escapeHtml(log.cropId || '未收获')}${log.quantity ? ` ×${log.quantity}` : ''}<time>${escapeHtml(new Date(log.createdAt).toLocaleString())}</time></li>`).join('') : '<li class="farm-log-empty">当前筛选暂无记录。</li>'
    }
    const close = () => { document.removeEventListener('keydown', onKeyDown); modal.remove() }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    modal.innerHTML = `<div class="farm-log-dialog"><div class="farm-log-heading"><h3>农场日志</h3><button type="button" class="text-button" data-farm-action="close-logs">关闭</button></div><div class="farm-log-filters" role="tablist" aria-label="日志筛选"><button class="text-button is-active" type="button" data-farm-log-filter="all">全部</button><button class="text-button" type="button" data-farm-log-filter="viewed">访问</button><button class="text-button" type="button" data-farm-log-filter="stolen">收获</button></div><ul data-farm-log-list>${renderRows()}</ul></div>`
    modal.addEventListener('click', event => {
      const target = event.target as Element
      if (target.closest('[data-farm-action="close-logs"]') || event.target === modal) { close(); return }
      const filterButton = target.closest<HTMLButtonElement>('[data-farm-log-filter]')
      if (!filterButton) return
      filter = filterButton.dataset.farmLogFilter as typeof filter
      modal.querySelectorAll<HTMLButtonElement>('[data-farm-log-filter]').forEach(button => button.classList.toggle('is-active', button === filterButton))
      const list = modal.querySelector<HTMLElement>('[data-farm-log-list]')
      if (list) list.innerHTML = renderRows()
    })
    document.addEventListener('keydown', onKeyDown)
    document.body.appendChild(modal)
  }

  async function showFriendPicker() {
    friendPickerOpen = true
    friendPicker = { ...friendPicker, loading: true, message: null }
    paint()
    try {
      const result = await window.electronAPI.gameAccountListFriends()
      friendPicker = result.ok
        ? { friends: result.data.friends, onlineUserIds, loading: false, message: null, query: friendPicker.query }
        : { ...friendPicker, loading: false, message: result.error.message }
    } catch {
      friendPicker = { ...friendPicker, loading: false, message: '好友列表暂时不可用，请稍后重试。' }
    }
    paint()
  }

  function closeFriendPicker() {
    friendPickerOpen = false
    paint()
  }

  async function enterFriendFarm(friendId: string) {
    friendPicker = { ...friendPicker, loading: true, message: null }
    paint()
    const result = await window.electronAPI.gameAccountGetFriendFarm(friendId)
    if (!result.ok) {
      friendPicker = { ...friendPicker, loading: false, message: result.error.message }
      paint()
      return
    }
    friendPickerOpen = false
    openFriendFarm(result.data)
  }

  function applyFriendFarmSnapshot(nextVisit: FarmVisitContext) {
    visit = nextVisit
    const remote = nextVisit.farm
    farmDecors = placedDecorsToFarmDecors(remote.placedDecors ?? [])
    farmState = {
      version: 1, plotCount: 24, plots: remote.plots as FarmState['plots'], inventory: {}, seeds: {}, weather: remote.weather,
      lastSettledAt: Date.now(), totalXp: remote.totalXp, placedDecors: remote.placedDecors ?? [],
    }
    const remoteXp = farmXpProgress(remote.totalXp)
    farmContext = {
      ...DEFAULT_FARM_CONTEXT,
      farmLevel: remoteXp.level,
      farmTotalXp: Number.isFinite(remote.totalXp) ? Math.max(0, Math.floor(remote.totalXp)) : 0,
      farmXpProgress: { current: remoteXp.current, required: remoteXp.required, isMaxLevel: remoteXp.isMaxLevel },
    }
  }

  function stopFriendFarmRefresh() {
    if (friendFarmRefreshTimer !== undefined) clearInterval(friendFarmRefreshTimer)
    friendFarmRefreshTimer = undefined
  }

  async function refreshFriendFarm(showMessage = true) {
    if (!visit || friendFarmRefreshing) return
    friendFarmRefreshing = true
    paint()
    try {
      const result = await window.electronAPI.gameAccountGetFriendFarm(visit.owner.id, false)
      if (!result.ok) {
        if (showMessage) showToast(result.error.message)
        return
      }
      applyFriendFarmSnapshot(result.data)
      if (showMessage) showToast('好友农场已更新')
    } catch {
      if (showMessage) showToast('刷新好友农场失败，请稍后重试。')
    } finally {
      friendFarmRefreshing = false
      paint()
    }
  }

  function startFriendFarmRefresh() {
    stopFriendFarmRefresh()
    friendFarmRefreshTimer = setInterval(() => void refreshFriendFarm(false), 30_000)
  }

  function applyVisit() {
    if (!pendingFarmVisit) return
    const nextVisit = pendingFarmVisit
    pendingFarmVisit = null
    applyFriendFarmSnapshot(nextVisit)
    startFriendFarmRefresh()
    paint()
  }

  async function runAction(
    fn: () => Promise<{ ok: boolean; error?: string; state: FarmState; context?: FarmPageContext }>,
    successMsg?: string,
  ) {
    if (busy) return
    busy = true
    try {
      const result = await fn()
      farmState = result.state
      if (result.context) farmContext = result.context
      if (!result.ok) {
        showToast(result.error ?? '操作失败')
      } else if (result.context?.levelUpMessage) {
        showToast(result.context.levelUpMessage)
      } else if (successMsg) {
        showToast(successMsg)
      }
      paint()
    } catch {
      showToast('操作失败，请重试。')
      paint()
    } finally {
      busy = false
    }
  }

  function handlePlotClick(plotIndex: number) {
    if (!farmState) return
    const plot = farmState.plots[plotIndex]
    const display = getPlotDisplayStatus(plot, farmState.weather, Date.now())

    if (display === 'locked') {
      const req = plotUnlockRequirement(plotIndex)
      if (!req) return
      if (farmContext.farmLevel < req.level) {
        const remaining = xpRemainingToLevel(farmContext.farmTotalXp, req.level)
        showToast(
          `需要农场 Lv.${req.level} 才能解锁（当前 Lv.${farmContext.farmLevel}，还差 ${remaining} 经验）`,
        )
        return
      }
      if (farmContext.walletCoins < req.coins) {
        showToast(`金币不足，解锁需要 ${req.coins} 金币`)
        return
      }
      void runAction(
        () => window.electronAPI.farmUnlockPlot({ plotIndex }),
        `已花费 ${req.coins} 金币解锁地块`,
      )
      return
    }

    if (plot.status === 'empty') {
      const count = farmState.seeds[selectedCrop] ?? 0
      if (count < 1) {
        const message =
          count === 0 && totalSeeds(farmState.seeds) === 0
            ? '种子都用完了'
            : `${CROPS[selectedCrop].name}种子不够，请换别的种子`
        showToast(message)
        return
      }
      void runAction(
        () => window.electronAPI.farmPlant({ plotIndex, cropId: selectedCrop }),
        `已种下${CROPS[selectedCrop].name}`,
      )
      return
    }
    if (plot.status === 'ready') {
      void runAction(() => window.electronAPI.farmHarvest({ plotIndex }), '收割成功')
      return
    }
    if (display === 'dry') {
      const tile = farmRoot.querySelector<HTMLElement>(`.farm-plot-tile[data-plot="${plotIndex}"]`)
      if (tile) playFarmWaterEffect(tile)
      void runAction(() => window.electronAPI.farmWater({ plotIndex }), '浇水完成')
      return
    }
    if (display === 'bug') {
      const tile = farmRoot.querySelector<HTMLElement>(`.farm-plot-tile[data-plot="${plotIndex}"]`)
      if (tile) playFarmPesticideEffect(tile)
      void runAction(() => window.electronAPI.farmDebug({ plotIndex }), '除虫完成')
    }
  }

  async function handleFriendFarmPlotClick(plotIndex: number) {
    if (!visit || !farmState || busy) return
    const localPlot = farmState.plots[plotIndex]
    if (!localPlot || localPlot.status === 'locked') {
      showFarmDialog('暂时无法收获', '这块地还没有解锁。')
      return
    }
    const localPlantedPlot = localPlot as PlotState & { stolen?: boolean }
    if (localPlot.status !== 'ready') {
      showFarmDialog('暂时无法收获', localPlantedPlot.stolen ? '这块地已经被偷过了。' : '这块地的作物还没有成熟。')
      return
    }
    if (localPlantedPlot.stolen) {
      showFarmDialog('暂时无法收获', '这块地已经被偷过了。')
      return
    }
    busy = true
    try {
      const result = await window.electronAPI.gameAccountStealFriendFarm(visit.owner.id, plotIndex)
      if (!result.ok) {
        showFarmDialog('暂时无法收获', result.error.message)
        return
      }
      const plot = farmState.plots[plotIndex] as PlotState & { stolen?: boolean; remainingYield?: number }
      if (plot) {
        plot.stolen = true
        plot.remainingYield = result.data.remainingYield
      }
      const cropName = CROPS[result.data.cropId as CropId]?.name ?? result.data.cropId
      showFarmDialog('收获成功', `获得 ${result.data.quantity} 个${cropName}。`)
      paint()
    } catch {
      showFarmDialog('收获失败', '服务暂时不可用，请稍后重试。')
    } finally {
      busy = false
    }
  }

  function bindEvents() {
    const stage = farmRoot.querySelector<HTMLElement>('.farm-stage')
    farmRoot.querySelector<HTMLButtonElement>('[data-farm-action="logs"]')?.addEventListener('click', () => void showLogs())
    farmRoot.querySelector<HTMLButtonElement>('[data-farm-action="refresh-friend"]')?.addEventListener('click', () => void refreshFriendFarm(true))
    farmRoot.querySelector<HTMLButtonElement>('[data-farm-action="friends"]')?.addEventListener('click', () => {
      if (friendPickerOpen) closeFriendPicker()
      else void showFriendPicker()
    })
    farmRoot.querySelector<HTMLButtonElement>('[data-farm-action="close-friends"]')?.addEventListener('click', closeFriendPicker)
    farmRoot.querySelectorAll<HTMLButtonElement>('[data-farm-friend-id]').forEach(btn => btn.addEventListener('click', () => {
      const friendId = btn.dataset.farmFriendId
      if (friendId) void enterFriendFarm(friendId)
    }))
    farmRoot.querySelector<HTMLButtonElement>('[data-farm-action="back"]')?.addEventListener('click', () => { visit = null; stopFriendFarmRefresh(); void refresh() })
    farmRoot.querySelector<HTMLInputElement>('[data-farm-friend-search]')?.addEventListener('input', (event) => {
      friendPicker = { ...friendPicker, query: (event.target as HTMLInputElement).value }
      const query = (friendPicker.query ?? '').trim().toLocaleLowerCase()
      farmRoot.querySelectorAll<HTMLElement>('.farm-friend-picker-row').forEach(row => {
        const text = row.textContent?.toLocaleLowerCase() ?? ''
        row.hidden = Boolean(query && !text.includes(query))
      })
    })
    stage?.addEventListener('click', (event) => {
      if (!stage) return
      if (sceneEditor?.isActive()) return
      if (visit) {
        // 等距地块的按钮外接矩形会互相重叠，按视觉坐标命中最近的菱形地块，
        // 避免事件目标落到相邻地块的透明区域。
        const plotIndex = findPlotIndexAtClientPoint(stage, event.clientX, event.clientY)
        const tile = plotIndex === null
          ? null
          : stage.querySelector<HTMLButtonElement>(`[data-plot="${plotIndex}"]`)
        if (plotIndex !== null && tile) {
          void handleFriendFarmPlotClick(plotIndex)
        }
        return
      }

      // 地块优先：小屋/货物大图透明区域会盖住地块，不能抢点击
      const plotIndex = findPlotIndexAtClientPoint(stage, event.clientX, event.clientY)
      if (plotIndex !== null) {
        handlePlotClick(plotIndex)
        return
      }

      const decorEl = (event.target as Element | null)?.closest?.('.farm-decor') as HTMLElement | null
      if (decorEl?.dataset.decorType) {
        const farmClick = getDecorFarmClick(decorEl.dataset.decorType)
        if (farmClick?.action === 'toast') {
          showToast(farmClick.message)
          return
        }
        if (farmClick?.action === 'openShop') {
          navigateToPage('shop-page')
          return
        }
      }
    })

    farmRoot.querySelectorAll<HTMLButtonElement>('.farm-seed-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedCrop = btn.dataset.crop as CropId
        farmRoot.querySelectorAll<HTMLButtonElement>('.farm-seed-card').forEach((card) => {
          const active = card.dataset.crop === selectedCrop
          card.classList.toggle('farm-seed-card--active', active)
          card.setAttribute('aria-pressed', String(active))
        })
        showToast(`已选 ${CROPS[selectedCrop].name}`)
      })
    })

    farmRoot.querySelector<HTMLButtonElement>('[data-farm-level-guide]')?.addEventListener('click', () => {
      closeLevelGuide?.()
      closeLevelGuide = openFarmLevelGuide(farmContext)
    })
  }

  onPageChange((pageId) => {
    closeLevelGuide?.()
    closeLevelGuide = undefined
    const onFarm = pageId === 'farm-page'
    pollen.setActive(onFarm)
    if (onFarm) { applyVisit(); if (!visit) void refresh() }
    else stopFriendFarmRefresh()
  })

  farmVisitListener = () => { if (getCurrentPage() === 'farm-page') applyVisit() }
  window.addEventListener('farm:visit', farmVisitListener)
  window.electronAPI.onGameAccountFarmVisit?.((event) => {
    if (visit) return
    showToast(event.action === 'stolen' ? '有好友偷走了你的作物，农场日志已更新。' : '有好友访问了你的农场，农场日志已更新。')
  })
  window.electronAPI.onGameAccountPresenceChanged?.((event) => {
    onlineUserIds = event.type === 'presence.snapshot'
      ? event.onlineUserIds
      : [...new Set([...onlineUserIds.filter(id => String(id) !== String(event.userId)), ...(event.online ? [event.userId] : [])])]
    if (friendPickerOpen) paint()
  })

  pollen.setActive(getCurrentPage() === 'farm-page')
  void refresh()
  void preloadFarmPlotEffect('water')
  void preloadFarmPlotEffect('pesticide')
  window.setInterval(tickPlots, 5000)
}
