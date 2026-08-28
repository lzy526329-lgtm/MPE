import { refreshFarmPlotHitDebugIfEnabled } from './farmPlotHitDebug'
import {
  clearPlotLayoutDraft,
  DEFAULT_PLOT_LAYOUT_CONFIG,
  formatPlotLayoutConfigForCode,
  loadPlotLayoutDraft,
  plotTileStyle,
  savePlotLayoutDraft,
  type PlotLayoutConfig,
} from './farmAssets'

const EDIT_SESSION_KEY = 'farm-layout-edit'

type DragState = {
  pointerId: number
  startX: number
  startY: number
  originOffset: { left: number; top: number }
}

let activeConfig = loadPlotLayoutDraft()
let panelEl: HTMLElement | null = null
let boundStage: HTMLElement | null = null
let dragState: DragState | null = null

export function isFarmLayoutEditEnabled(): boolean {
  return sessionStorage.getItem(EDIT_SESSION_KEY) === '1'
}

function setFarmLayoutEditEnabled(enabled: boolean) {
  if (enabled) sessionStorage.setItem(EDIT_SESSION_KEY, '1')
  else sessionStorage.removeItem(EDIT_SESSION_KEY)
}

function applyPlotLayoutToDom(root: ParentNode, config: PlotLayoutConfig) {
  root.querySelectorAll<HTMLElement>('.farm-plot-tile').forEach((tile) => {
    const index = Number(tile.dataset.plot)
    if (!Number.isInteger(index)) return
    tile.setAttribute('style', plotTileStyle(index, config))
  })
}

function roundInput(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function updatePanelInputs() {
  if (!panelEl) return
  const set = (name: string, value: number) => {
    const input = panelEl!.querySelector<HTMLInputElement>(`[data-field="${name}"]`)
    if (input) input.value = String(value)
  }
  set('originLeft', activeConfig.origin.left)
  set('originTop', activeConfig.origin.top)
  set('offsetLeft', activeConfig.offsetPx.left)
  set('offsetTop', activeConfig.offsetPx.top)
  set('width', activeConfig.width)
  const codeEl = panelEl.querySelector<HTMLElement>('[data-layout-code]')
  if (codeEl) codeEl.textContent = formatPlotLayoutConfigForCode(activeConfig)
}

function commitConfig(root: ParentNode, config: PlotLayoutConfig) {
  activeConfig = config
  savePlotLayoutDraft(config)
  applyPlotLayoutToDom(root, config)
  updatePanelInputs()
  refreshFarmPlotHitDebugIfEnabled(root.querySelector<HTMLElement>('.farm-stage'))
}

function patchConfig(root: ParentNode, patch: Partial<PlotLayoutConfig>) {
  commitConfig(root, {
    ...activeConfig,
    ...patch,
    origin: { ...activeConfig.origin, ...(patch.origin ?? {}) },
    offsetPx: { ...activeConfig.offsetPx, ...(patch.offsetPx ?? {}) },
  })
}

async function copyConfigToClipboard(onDone: (message: string) => void) {
  const code = formatPlotLayoutConfigForCode(activeConfig)
  const payload = `${code}\n\n<!-- 把上面整段发给助手，写入 src/farmAssets.ts 的 DEFAULT_PLOT_LAYOUT_CONFIG -->`
  try {
    await navigator.clipboard.writeText(payload)
    onDone('布局已复制！把聊天里粘贴的内容发给我，我会写入代码。')
  } catch {
    onDone('复制失败，请手动复制面板里的配置文本。')
  }
}

function bindDrag(stage: HTMLElement, root: ParentNode) {
  stage.classList.add('farm-stage--layout-edit')

  const onPointerDown = (event: PointerEvent) => {
    if ((event.target as HTMLElement).closest('.farm-layout-panel')) return
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originOffset: { ...activeConfig.offsetPx },
    }
    stage.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return
    const dx = event.clientX - dragState.startX
    const dy = event.clientY - dragState.startY
    patchConfig(root, {
      offsetPx: {
        left: Math.round(dragState.originOffset.left + dx),
        top: Math.round(dragState.originOffset.top + dy),
      },
    })
  }

  const onPointerUp = (event: PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return
    dragState = null
    stage.releasePointerCapture(event.pointerId)
  }

  stage.addEventListener('pointerdown', onPointerDown)
  stage.addEventListener('pointermove', onPointerMove)
  stage.addEventListener('pointerup', onPointerUp)
  stage.addEventListener('pointercancel', onPointerUp)

  return () => {
    stage.classList.remove('farm-stage--layout-edit')
    stage.removeEventListener('pointerdown', onPointerDown)
    stage.removeEventListener('pointermove', onPointerMove)
    stage.removeEventListener('pointerup', onPointerUp)
    stage.removeEventListener('pointercancel', onPointerUp)
  }
}

function buildPanel(root: ParentNode, onToast: (message: string) => void, onClose: () => void): HTMLElement {
  const panel = document.createElement('aside')
  panel.className = 'farm-layout-panel'
  panel.innerHTML = `
    <header class="farm-layout-panel__head">
      <strong>地块布局调试</strong>
      <button type="button" class="farm-layout-panel__close" data-action="close" aria-label="关闭">×</button>
    </header>
    <p class="farm-layout-panel__hint">在背景上<strong>按住拖动</strong>整体平移；或用下方数值微调。满意后点「确认并复制」发给我即可。</p>
    <label class="farm-layout-field">原点 left (%)
      <input type="number" step="0.5" data-field="originLeft" />
    </label>
    <label class="farm-layout-field">原点 top (%)
      <input type="number" step="0.5" data-field="originTop" />
    </label>
    <label class="farm-layout-field">像素偏移 left (px)
      <input type="number" step="1" data-field="offsetLeft" />
    </label>
    <label class="farm-layout-field">像素偏移 top (px)
      <input type="number" step="1" data-field="offsetTop" />
    </label>
    <label class="farm-layout-field">地块宽度 (%)
      <input type="number" step="0.5" min="4" max="24" data-field="width" />
    </label>
    <div class="farm-layout-panel__actions">
      <button type="button" data-action="nudge" data-dx="-1" data-dy="0">← 1px</button>
      <button type="button" data-action="nudge" data-dx="1" data-dy="0">1px →</button>
      <button type="button" data-action="nudge" data-dx="0" data-dy="-1">↑ 1px</button>
      <button type="button" data-action="nudge" data-dx="0" data-dy="1">1px ↓</button>
    </div>
    <pre class="farm-layout-panel__code" data-layout-code></pre>
    <div class="farm-layout-panel__actions farm-layout-panel__actions--primary">
      <button type="button" class="farm-layout-panel__confirm" data-action="confirm">确认并复制</button>
      <button type="button" data-action="reset">恢复默认</button>
    </div>
  `

  panel.addEventListener('input', (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('input[data-field]')
    if (!input) return
    const value = Number(input.value)
    if (!Number.isFinite(value)) return
    const field = input.dataset.field
    if (field === 'originLeft') patchConfig(root, { origin: { ...activeConfig.origin, left: value } })
    if (field === 'originTop') patchConfig(root, { origin: { ...activeConfig.origin, top: value } })
    if (field === 'offsetLeft') patchConfig(root, { offsetPx: { ...activeConfig.offsetPx, left: Math.round(value) } })
    if (field === 'offsetTop') patchConfig(root, { offsetPx: { ...activeConfig.offsetPx, top: Math.round(value) } })
    if (field === 'width') patchConfig(root, { width: roundInput(value, 2) })
  })

  panel.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')
    if (!button) return
    const action = button.dataset.action
    if (action === 'close') {
      onClose()
      return
    }
    if (action === 'nudge') {
      const dx = Number(button.dataset.dx ?? 0)
      const dy = Number(button.dataset.dy ?? 0)
      patchConfig(root, {
        offsetPx: {
          left: activeConfig.offsetPx.left + dx,
          top: activeConfig.offsetPx.top + dy,
        },
      })
      return
    }
    if (action === 'reset') {
      clearPlotLayoutDraft()
      commitConfig(root, structuredClone(DEFAULT_PLOT_LAYOUT_CONFIG))
      onToast('已恢复默认布局')
      return
    }
    if (action === 'confirm') {
      void copyConfigToClipboard(onToast)
    }
  })

  return panel
}

let unbindDrag: (() => void) | null = null

export function syncFarmPlotLayoutEditor(
  farmRoot: HTMLElement,
  onToast: (message: string) => void,
): void {
  const scene = farmRoot.querySelector<HTMLElement>('.farm-scene')
  const stage = farmRoot.querySelector<HTMLElement>('.farm-stage')
  if (!scene || !stage) return

  let toggle = scene.querySelector<HTMLButtonElement>('.farm-layout-edit-toggle')
  if (!toggle) {
    toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'farm-layout-edit-toggle'
    toggle.textContent = '📐 调布局'
    toggle.title = '打开地块布局调试工具'
    scene.querySelector('.farm-hud')?.append(toggle)
  }

  const closeEditor = () => {
    setFarmLayoutEditEnabled(false)
    panelEl?.remove()
    panelEl = null
    unbindDrag?.()
    unbindDrag = null
    boundStage = null
    toggle!.textContent = '📐 调布局'
  }

  const openEditor = () => {
    setFarmLayoutEditEnabled(true)
    activeConfig = loadPlotLayoutDraft()
    if (!panelEl) {
      panelEl = buildPanel(farmRoot, onToast, closeEditor)
      scene.append(panelEl)
    }
    if (boundStage !== stage) {
      unbindDrag?.()
      unbindDrag = bindDrag(stage, farmRoot)
      boundStage = stage
    }
    applyPlotLayoutToDom(farmRoot, activeConfig)
    updatePanelInputs()
    toggle!.textContent = '✓ 布局调试中'
  }

  toggle.onclick = () => {
    if (isFarmLayoutEditEnabled()) closeEditor()
    else openEditor()
  }

  if (isFarmLayoutEditEnabled()) openEditor()
  else applyPlotLayoutToDom(farmRoot, activeConfig)
}
