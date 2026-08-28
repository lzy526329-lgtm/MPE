import {
  getPlotHitMetricsFromTile,
  loadPlotLayoutDraft,
  plotHitPolygonPointsFromMetrics,
  plotRenderDepth,
} from './farmAssets'

const HIT_DEBUG_SESSION_KEY = 'farm-hit-debug'

let resizeObserver: ResizeObserver | null = null

export function isFarmHitDebugEnabled(): boolean {
  return sessionStorage.getItem(HIT_DEBUG_SESSION_KEY) === '1'
}

function setFarmHitDebugEnabled(enabled: boolean) {
  if (enabled) sessionStorage.setItem(HIT_DEBUG_SESSION_KEY, '1')
  else sessionStorage.removeItem(HIT_DEBUG_SESSION_KEY)
}

function renderHitOverlay(stage: HTMLElement) {
  const config = loadPlotLayoutDraft()
  const stageW = stage.clientWidth
  const stageH = stage.clientHeight
  if (stageW <= 0 || stageH <= 0) return

  const polygons = Array.from(stage.querySelectorAll<HTMLElement>('.farm-plot-tile'))
    .map((tile) => {
      const index = Number(tile.dataset.plot)
      if (!Number.isInteger(index)) return ''
      const metrics = getPlotHitMetricsFromTile(tile, index, config)
      const points = plotHitPolygonPointsFromMetrics(metrics)
      const depth = plotRenderDepth(index, config)
      return `<polygon data-plot="${index}" points="${points}" />`
    })
    .join('')

  let overlay = stage.querySelector<SVGElement>('.farm-hit-debug')
  if (!overlay) {
    overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    overlay.setAttribute('class', 'farm-hit-debug')
    overlay.setAttribute('aria-hidden', 'true')
    stage.append(overlay)
  }
  overlay.setAttribute('viewBox', `0 0 ${stageW} ${stageH}`)
  overlay.setAttribute('preserveAspectRatio', 'none')
  overlay.innerHTML = polygons
}

function bindResizeObserver(stage: HTMLElement) {
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(() => {
    if (isFarmHitDebugEnabled()) renderHitOverlay(stage)
  })
  resizeObserver.observe(stage)
}

export function syncFarmPlotHitDebug(farmRoot: HTMLElement): void {
  const scene = farmRoot.querySelector<HTMLElement>('.farm-scene')
  const stage = farmRoot.querySelector<HTMLElement>('.farm-stage')
  if (!scene || !stage) return

  let toggle = scene.querySelector<HTMLButtonElement>('.farm-hit-debug-toggle')
  if (!toggle) {
    toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'farm-hit-debug-toggle'
    toggle.textContent = '🎯 点击范围'
    toggle.title = '显示/隐藏地块点击命中区'
    scene.querySelector('.farm-hud')?.append(toggle)
  }

  const updateToggleLabel = () => {
    toggle!.textContent = isFarmHitDebugEnabled() ? '🎯 隐藏范围' : '🎯 点击范围'
  }

  const showOverlay = () => {
    stage.classList.add('farm-stage--hit-debug')
    requestAnimationFrame(() => renderHitOverlay(stage))
    bindResizeObserver(stage)
    updateToggleLabel()
  }

  const hideOverlay = () => {
    stage.classList.remove('farm-stage--hit-debug')
    stage.querySelector('.farm-hit-debug')?.remove()
    resizeObserver?.disconnect()
    resizeObserver = null
    updateToggleLabel()
  }

  toggle.onclick = () => {
    if (isFarmHitDebugEnabled()) {
      setFarmHitDebugEnabled(false)
      hideOverlay()
    } else {
      setFarmHitDebugEnabled(true)
      showOverlay()
    }
  }

  if (isFarmHitDebugEnabled()) showOverlay()
  else hideOverlay()
}

export function refreshFarmPlotHitDebugIfEnabled(stage: HTMLElement | null) {
  if (!stage || !isFarmHitDebugEnabled()) return
  requestAnimationFrame(() => renderHitOverlay(stage))
}
