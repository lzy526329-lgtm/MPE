import { CROPS } from '../electron/farm/farmCatalog'
import type { CropId, FarmState, PlotState, Weather } from '../electron/farm/farmTypes'
import { onPageChange } from './appNavigation'

type PlotDisplayStatus = 'empty' | 'growing' | 'dry' | 'bug' | 'ready' | 'withered'

const WEATHER_LABEL: Record<Weather, string> = {
  clear: '晴天',
  rain: '雨天',
}

const STATUS_LABEL: Record<PlotDisplayStatus, string> = {
  empty: '空地',
  growing: '生长中',
  dry: '缺水',
  bug: '生虫',
  ready: '可收割',
  withered: '已枯萎',
}

function escapeHtml(value: string) {
  const element = document.createElement('span')
  element.textContent = value
  return element.innerHTML
}

function waterIntervalMs(cropId: CropId, weather: Weather): number {
  const base = CROPS[cropId].waterIntervalMs
  return weather === 'rain' ? base * 1.5 : base
}

function getPlotDisplayStatus(plot: PlotState, weather: Weather, now: number): PlotDisplayStatus {
  if (plot.status === 'empty') return 'empty'
  if (plot.status === 'withered') return 'withered'
  if (plot.status === 'ready') return 'ready'
  if (plot.hasBug) return 'bug'
  if (now > plot.lastWateredAt + waterIntervalMs(plot.cropId, weather)) return 'dry'
  return 'growing'
}

function formatRecordSummary(record: Record<string, number>, nameMap: Record<string, string>): string {
  const entries = Object.entries(record).filter(([, count]) => count > 0)
  if (entries.length === 0) return '无'
  return entries.map(([id, count]) => `${nameMap[id] ?? id}×${count}`).join('、')
}

function cropNameMap(): Record<string, string> {
  return Object.fromEntries(Object.values(CROPS).map((c) => [c.id, c.name]))
}

function itemNameMap(): Record<string, string> {
  return Object.fromEntries(Object.values(CROPS).map((c) => [c.yieldItemId, c.name]))
}

function renderPlot(plot: PlotState, index: number, state: FarmState, now: number): string {
  const display = getPlotDisplayStatus(plot, state.weather, now)
  const crop =
    plot.status !== 'empty'
      ? CROPS[plot.cropId]
      : null
  const progress =
    plot.status === 'growing' || plot.status === 'ready'
      ? Math.min(100, Math.round((plot.progressMs / crop!.growMs) * 100))
      : plot.status === 'withered' && crop
        ? Math.min(100, Math.round((plot.progressMs / crop.growMs) * 100))
        : 0

  const actions: string[] = []
  if (plot.status === 'empty') {
    actions.push(`<button class="secondary-button farm-action" type="button" data-action="plant" data-plot="${index}">播种</button>`)
  } else if (plot.status === 'growing' || plot.status === 'ready') {
    actions.push(`<button class="secondary-button farm-action" type="button" data-action="water" data-plot="${index}">浇水</button>`)
    if (plot.hasBug) {
      actions.push(`<button class="secondary-button farm-action" type="button" data-action="debug" data-plot="${index}">赶虫</button>`)
    }
    if (plot.status === 'ready') {
      actions.push(`<button class="primary-button farm-action" type="button" data-action="harvest" data-plot="${index}">收割</button>`)
    }
  } else if (plot.status === 'withered') {
    actions.push(`<button class="secondary-button farm-action" type="button" data-action="clear" data-plot="${index}">清理</button>`)
  }

  return `
    <article class="farm-plot farm-plot--${display}" data-plot="${index}">
      <div class="farm-plot-head">
        <span class="farm-plot-index">#${index + 1}</span>
        <span class="farm-plot-status">${STATUS_LABEL[display]}</span>
      </div>
      <p class="farm-plot-crop">${crop ? escapeHtml(crop.name) : '—'}</p>
      ${crop && plot.status !== 'empty' ? `
        <div class="farm-progress" aria-hidden="true">
          <span class="farm-progress-bar" style="width: ${progress}%"></span>
        </div>
        <span class="farm-progress-label">${progress}%</span>
      ` : ''}
      <div class="farm-plot-actions">${actions.join('')}</div>
    </article>
  `
}

function renderSeedPicker(seeds: Record<string, number>, selected: CropId): string {
  const options = (Object.keys(CROPS) as CropId[])
    .map((id) => {
      const count = seeds[id] ?? 0
      const selectedAttr = id === selected ? 'checked' : ''
      const disabled = count < 1 ? 'disabled' : ''
      return `
        <label class="farm-seed-option">
          <input type="radio" name="farm-seed" value="${id}" ${selectedAttr} ${disabled} />
          <span>${escapeHtml(CROPS[id].name)} (${count})</span>
        </label>
      `
    })
    .join('')
  return `<div class="farm-seed-picker" role="radiogroup" aria-label="选择种子">${options}</div>`
}

function renderFarm(state: FarmState, selectedCrop: CropId, now: number, error: string): string {
  const seedNames = cropNameMap()
  const invNames = itemNameMap()
  const todayClaimed = state.lastDailySeedClaimAt === localDateKey(now)

  return `
    <div class="farm-top-bar">
      <div class="farm-stat">
        <span class="farm-stat-label">天气</span>
        <strong>${WEATHER_LABEL[state.weather]}</strong>
      </div>
      <div class="farm-stat">
        <span class="farm-stat-label">种子</span>
        <strong>${escapeHtml(formatRecordSummary(state.seeds, seedNames))}</strong>
      </div>
      <div class="farm-stat">
        <span class="farm-stat-label">背包</span>
        <strong>${escapeHtml(formatRecordSummary(state.inventory, invNames))}</strong>
      </div>
    </div>

    ${renderSeedPicker(state.seeds, selectedCrop)}

    <div class="farm-grid">
      ${state.plots.map((plot, i) => renderPlot(plot, i, state, now)).join('')}
    </div>

    <div class="farm-footer">
      <button class="primary-button" id="farm-claim-daily" type="button" ${todayClaimed ? 'disabled' : ''}>
        ${todayClaimed ? '今日种子已领取' : '领取今日种子'}
      </button>
    </div>

    <p class="error-message" id="farm-message" role="alert">${error ? escapeHtml(error) : ''}</p>
  `
}

function localDateKey(now: number): string {
  const date = new Date(now)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function defaultSelectedCrop(seeds: Record<string, number>): CropId {
  for (const id of Object.keys(CROPS) as CropId[]) {
    if ((seeds[id] ?? 0) > 0) return id
  }
  return 'lettuce'
}

export function mountFarmPage() {
  const farmRoot = document.querySelector<HTMLElement>('#farm-root')
  if (!farmRoot) return

  let farmState: FarmState | null = null
  let selectedCrop: CropId = 'lettuce'
  let busy = false
  let lastError = ''

  function paint() {
    if (!farmState) {
      farmRoot.innerHTML = '<p class="sysinfo-loading">加载农场…</p>'
      return
    }
    farmRoot.innerHTML = renderFarm(farmState, selectedCrop, Date.now(), lastError)
    bindEvents()
  }

  async function refresh() {
    lastError = ''
    try {
      const result = await window.electronAPI.farmGetState()
      farmState = result.state
      if (!result.ok) lastError = result.error
      selectedCrop = defaultSelectedCrop(farmState.seeds)
      paint()
    } catch {
      lastError = '无法读取农场状态，请重试。'
      paint()
    }
  }

  async function runAction(
    fn: () => Promise<{ ok: boolean; error?: string; state: FarmState }>,
  ) {
    if (busy) return
    busy = true
    lastError = ''
    try {
      const result = await fn()
      farmState = result.state
      if (!result.ok) lastError = result.error ?? '操作失败'
      paint()
    } catch {
      lastError = '操作失败，请重试。'
      paint()
    } finally {
      busy = false
    }
  }

  function bindEvents() {
    farmRoot.querySelectorAll<HTMLInputElement>('input[name="farm-seed"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) selectedCrop = input.value as CropId
      })
    })

    farmRoot.querySelectorAll<HTMLButtonElement>('.farm-action').forEach((btn) => {
      btn.addEventListener('click', () => {
        const plotIndex = Number(btn.dataset.plot)
        const action = btn.dataset.action
        if (!Number.isInteger(plotIndex) || !action) return

        if (action === 'plant') {
          void runAction(() => window.electronAPI.farmPlant({ plotIndex, cropId: selectedCrop }))
        } else if (action === 'water') {
          void runAction(() => window.electronAPI.farmWater({ plotIndex }))
        } else if (action === 'debug') {
          void runAction(() => window.electronAPI.farmDebug({ plotIndex }))
        } else if (action === 'harvest') {
          void runAction(() => window.electronAPI.farmHarvest({ plotIndex }))
        } else if (action === 'clear') {
          void runAction(() => window.electronAPI.farmClearWithered({ plotIndex }))
        }
      })
    })

    farmRoot.querySelector<HTMLButtonElement>('#farm-claim-daily')?.addEventListener('click', () => {
      void runAction(() => window.electronAPI.farmClaimDailySeeds())
    })
  }

  onPageChange((pageId) => {
    if (pageId === 'farm-page') void refresh()
  })

  void refresh()
}
