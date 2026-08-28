import { CROPS, plotUnlockRequirement } from '../electron/farm/farmCatalog'
import type { CropId, FarmPageContext, FarmState, PlotState, Weather } from '../electron/farm/farmTypes'
import {
  cropGrowthStage,
  cropSpriteStyle,
  FARM_ASSETS,
  findPlotIndexAtClientPoint,
  plotSoilSrc,
  syncFarmPlotLayout,
  toolbarIconStyle,
} from './farmAssets'
import { onPageChange } from './appNavigation'

type PlotDisplayStatus = 'empty' | 'growing' | 'dry' | 'bug' | 'ready' | 'locked'

const DEFAULT_FARM_CONTEXT: FarmPageContext = { playerLevel: 0, walletCoins: 0 }

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

function formatRecordSummary(record: Record<string, number>, nameMap: Record<string, string>): string {
  const entries = Object.entries(record).filter(([, count]) => count > 0)
  if (entries.length === 0) return '无'
  return entries.map(([id, count]) => `${nameMap[id] ?? id}×${count}`).join(' ')
}

function cropNameMap(): Record<string, string> {
  return Object.fromEntries(Object.values(CROPS).map((c) => [c.id, c.name]))
}

function itemNameMap(): Record<string, string> {
  return Object.fromEntries(Object.values(CROPS).map((c) => [c.yieldItemId, c.name]))
}

function renderPlot(
  plot: PlotState,
  index: number,
  state: FarmState,
  now: number,
  context: FarmPageContext,
): string {
  const display = getPlotDisplayStatus(plot, state.weather, now)
  const crop = plot.status !== 'empty' && plot.status !== 'locked' ? CROPS[plot.cropId] : null
  const ready = plot.status === 'ready'
  const progress =
    crop && plot.status !== 'empty'
      ? Math.min(100, Math.round((plot.progressMs / crop.growMs) * 100))
      : 0
  const stage = crop && plot.status !== 'empty' ? cropGrowthStage(progress / 100, ready) : 0
  const soil = plotSoilSrc(display)

  const cropLayer =
    crop && plot.status !== 'empty'
      ? `<div class="farm-crop-sprite" style="${cropSpriteStyle(plot.cropId, stage)}" title="${escapeHtml(crop.name)}"></div>`
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
  return (Object.keys(CROPS) as CropId[])
    .map((id) => {
      const count = seeds[id] ?? 0
      const active = id === selected ? ' farm-seed-chip--active' : ''
      const disabled = count < 1 ? ' disabled' : ''
      return `
        <button class="farm-seed-chip${active}" type="button" data-crop="${id}"${disabled}>
          ${escapeHtml(CROPS[id].name)} <em>${count}</em>
        </button>
      `
    })
    .join('')
}

function renderFarm(
  state: FarmState,
  selectedCrop: CropId,
  now: number,
  toast: string,
  context: FarmPageContext,
): string {
  const seedNames = cropNameMap()
  const invNames = itemNameMap()
  const todayClaimed = state.lastDailySeedClaimAt === localDateKey(now)
  const readyCount = state.plots.filter((p) => p.status === 'ready').length
  const dryCount = state.plots.filter((p) => {
    const d = getPlotDisplayStatus(p, state.weather, now)
    return d === 'dry'
  }).length

  return `
    <div class="farm-scene">
      <div class="farm-hud">
        <div class="farm-hud-pill">⭐ Lv.${context.playerLevel}</div>
        <div class="farm-hud-pill">🪙 ${context.walletCoins}</div>
        <div class="farm-hud-pill">${WEATHER_LABEL[state.weather]}</div>
        <div class="farm-hud-pill">🌱 ${escapeHtml(formatRecordSummary(state.seeds, seedNames))}</div>
        <div class="farm-hud-pill">🧺 ${escapeHtml(formatRecordSummary(state.inventory, invNames))}</div>
      </div>

      ${toast ? `<p class="farm-toast" role="status">${escapeHtml(toast)}</p>` : ''}

      <div class="farm-stage" style="background-image:url('${FARM_ASSETS.bg}')">
        ${state.plots.map((plot, i) => renderPlot(plot, i, state, now, context)).join('')}
      </div>

      <div class="farm-toolbar">
        <button class="farm-tool" type="button" data-tool="water-all" title="一键浇水">
          <span class="farm-tool-icon" style="${toolbarIconStyle(0)}"></span>
          <span>一键浇水${dryCount > 0 ? ` (${dryCount})` : ''}</span>
        </button>
        <button class="farm-tool" type="button" data-tool="harvest-all" title="一键收割">
          <span class="farm-tool-icon" style="${toolbarIconStyle(1)}"></span>
          <span>一键收割${readyCount > 0 ? ` (${readyCount})` : ''}</span>
        </button>
        <button class="farm-tool" type="button" data-tool="claim" title="领取种子" ${todayClaimed ? 'disabled' : ''}>
          <span class="farm-tool-icon" style="${toolbarIconStyle(2)}"></span>
          <span>${todayClaimed ? '已领取' : '领种子'}</span>
        </button>
      </div>

      <div class="farm-seed-bar" role="toolbar" aria-label="选择种子">
        <span class="farm-seed-label">种子</span>
        ${renderSeedPicker(state.seeds, selectedCrop)}
      </div>
    </div>
  `
}

function localDateKey(now: number): string {
  const date = new Date(now)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
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
    const crop = plot.status !== 'empty' && plot.status !== 'locked' ? CROPS[plot.cropId] : null
    const ready = plot.status === 'ready'
    const progress =
      crop && plot.status !== 'empty'
        ? Math.min(100, Math.round((plot.progressMs / crop.growMs) * 100))
        : 0
    const stage = crop && plot.status !== 'empty' ? cropGrowthStage(progress / 100, ready) : 0

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
    if (crop && plot.status !== 'empty') {
      if (!cropEl) {
        btn.querySelector('.farm-plot-badges')?.insertAdjacentHTML(
          'beforebegin',
          `<div class="farm-crop-sprite" title="${escapeHtml(crop.name)}"></div>`,
        )
        cropEl = btn.querySelector<HTMLElement>('.farm-crop-sprite')
      }
      if (cropEl) {
        cropEl.setAttribute('title', crop.name)
        cropEl.setAttribute('style', cropSpriteStyle(plot.cropId, stage))
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
    farmRoot.innerHTML = renderFarm(farmState, selectedCrop, Date.now(), toast, farmContext)
    bindEvents()
    syncPlotLayout()
    ensurePlotLayoutResizeObserver()
  }

  async function refresh() {
    try {
      const result = await window.electronAPI.farmGetState()
      farmState = result.state
      farmContext = result.context ?? DEFAULT_FARM_CONTEXT
      if (!result.ok) showToast(result.error ?? '读取失败')
      selectedCrop = defaultSelectedCrop(farmState.seeds)
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
      if (farmContext.playerLevel < req.level) {
        showToast(`需要等级 ${req.level} 才能解锁（${req.coins} 金币）`)
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
        const todayClaimed = farmState.lastDailySeedClaimAt === localDateKey(Date.now())
        const message =
          count === 0 && totalSeeds(farmState.seeds) === 0
            ? todayClaimed
              ? '种子都用完了，明天可以再来领'
              : '种子不够了，请先点下方「领种子」'
            : `${CROPS[selectedCrop].name}种子不够，请换别的种子或领取`
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
      void runAction(() => window.electronAPI.farmWater({ plotIndex }), '浇水完成')
      return
    }
    if (display === 'bug') {
      void runAction(() => window.electronAPI.farmDebug({ plotIndex }), '除虫完成')
    }
  }

  function bindEvents() {
    const stage = farmRoot.querySelector<HTMLElement>('.farm-stage')
    stage?.addEventListener('click', (event) => {
      if (!stage) return
      const plotIndex = findPlotIndexAtClientPoint(stage, event.clientX, event.clientY)
      if (plotIndex === null) return
      handlePlotClick(plotIndex)
    })

    farmRoot.querySelectorAll<HTMLButtonElement>('.farm-seed-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return
        selectedCrop = btn.dataset.crop as CropId
        farmRoot.querySelectorAll<HTMLButtonElement>('.farm-seed-chip').forEach((chip) => {
          chip.classList.toggle('farm-seed-chip--active', chip.dataset.crop === selectedCrop)
        })
        showToast(`已选 ${CROPS[selectedCrop].name}`)
      })
    })

    farmRoot.querySelector<HTMLButtonElement>('[data-tool="water-all"]')?.addEventListener('click', () => {
      void runAction(() => window.electronAPI.farmWaterAll(), '全部浇好了')
    })

    farmRoot.querySelector<HTMLButtonElement>('[data-tool="harvest-all"]')?.addEventListener('click', () => {
      void runAction(() => window.electronAPI.farmHarvestAll(), '全部收割完成')
    })

    farmRoot.querySelector<HTMLButtonElement>('[data-tool="claim"]')?.addEventListener('click', () => {
      void runAction(() => window.electronAPI.farmClaimDailySeeds(), '种子已领取')
    })
  }

  onPageChange((pageId) => {
    if (pageId === 'farm-page') void refresh()
  })

  void refresh()
  window.setInterval(tickPlots, 5000)
}