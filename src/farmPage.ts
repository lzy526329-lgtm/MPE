import { CROPS, plotUnlockRequirement } from '../electron/farm/farmCatalog'
import { getCropShopImgPath } from '../electron/farm/cropCatalog'
import { xpRemainingToLevel } from '../electron/farm/farmLevel'
import type { CropId, FarmPageContext, FarmState, PlotState, Weather } from '../electron/farm/farmTypes'
import {
  cropGrowthStage,
  cropSpriteStyle,
  farmCatalogIconHtml,
  FARM_ASSETS,
  findPlotIndexAtClientPoint,
  plotSoilSrc,
  syncFarmPlotLayout,
} from './farmAssets'
import { onPageChange } from './appNavigation'
import { openFarmLevelGuide } from './farmLevelGuide'
import type { DecorId } from '../electron/game/gameTypes'
import { playFarmPesticideEffect, playFarmWaterEffect, preloadFarmPlotEffect } from './farmPlotWaterEffect'
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

function escapeHtml(value: string) {
  const element = document.createElement('span')
  element.textContent = value
  return element.innerHTML
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

function renderPlot(
  plot: PlotState,
  index: number,
  state: FarmState,
  now: number,
  context: FarmPageContext,
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

  const badges: string[] = []
  if (display === 'bug') badges.push('<span class="farm-plot-badge farm-plot-badge--bug">虫</span>')
  if (display === 'ready') badges.push('<span class="farm-plot-badge farm-plot-badge--ready">熟</span>')
  if (display === 'dry') badges.push('<span class="farm-plot-badge farm-plot-badge--dry">旱</span>')

  const soilLayer = soil
    ? `<img class="farm-plot-soil" src="${soil}" alt="" draggable="false" />`
    : ''
  const unlockLabel = display === 'locked' ? '<span class="farm-plot-unlock-label">解锁</span>' : ''

  return `
    <button class="farm-plot-tile farm-plot-tile--${display}" type="button" data-plot="${index}" aria-label="地块 ${index + 1}${display === 'locked' ? ' 解锁' : ''}">
      ${soilLayer}
      ${cropLayer}
      <div class="farm-plot-badges">${badges.join('')}</div>
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
): string {
  return `
    <div class="farm-scene">
      <div class="farm-hud">
        ${renderFarmLevelHud(context)}
        <div class="farm-hud-pill">🪙 ${context.walletCoins}</div>
        <div class="farm-hud-pill">${WEATHER_LABEL[state.weather]}</div>
      </div>

      ${toast ? `<p class="farm-toast" role="status">${escapeHtml(toast)}</p>` : ''}

      <div class="farm-stage" style="background-image:url('${FARM_ASSETS.bg}')">
        ${renderFarmDecorHtml(decors)}
        ${state.plots.map((plot, i) => renderPlot(plot, i, state, now, context)).join('')}
      </div>

      <div class="farm-seed-bar" role="toolbar" aria-label="选择种子">
        <span class="farm-seed-label">种子</span>
        <div class="farm-seed-scroll">${renderSeedPicker(state.seeds, selectedCrop)}</div>
      </div>
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

    const badges: string[] = []
    if (display === 'bug') badges.push('<span class="farm-plot-badge farm-plot-badge--bug">虫</span>')
    if (display === 'ready') badges.push('<span class="farm-plot-badge farm-plot-badge--ready">熟</span>')
    if (display === 'dry') badges.push('<span class="farm-plot-badge farm-plot-badge--dry">旱</span>')
    const badgesEl = btn.querySelector<HTMLElement>('.farm-plot-badges')
    if (badgesEl) badgesEl.innerHTML = badges.join('')

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
    farmRoot.innerHTML = renderFarm(farmState, selectedCrop, Date.now(), toast, farmContext, farmDecors)
    bindEvents()
    syncPlotLayout()
    ensurePlotLayoutResizeObserver()
    ensureSceneEditor()
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

  function bindEvents() {
    const stage = farmRoot.querySelector<HTMLElement>('.farm-stage')
    stage?.addEventListener('click', (event) => {
      if (!stage) return
      if (sceneEditor?.isActive()) return
      const plotIndex = findPlotIndexAtClientPoint(stage, event.clientX, event.clientY)
      if (plotIndex === null) return
      handlePlotClick(plotIndex)
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
    if (pageId === 'farm-page') void refresh()
  })

  void refresh()
  void preloadFarmPlotEffect('water')
  void preloadFarmPlotEffect('pesticide')
  window.setInterval(tickPlots, 5000)
}