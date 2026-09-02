import {
  clearFarmDecorDraft,
  createFarmDecorFromCatalog,
  exportFarmDecorJson,
  FARM_DECOR_CATALOG,
  loadFarmDecorDraft,
  normalizeFarmDecor,
  saveFarmDecorDraft,
  syncFarmDecorDom,
  type FarmDecorDef,
} from './farmSceneDecor'

export type FarmSceneEditorHandle = {
  isActive: () => boolean
  rebindStage: () => void
  destroy: () => void
}

export type FarmSceneEditorMode = 'dev' | 'player'

type FarmSceneEditorOptions = {
  mode?: FarmSceneEditorMode
  getStage: () => HTMLElement | null
  getDecors: () => FarmDecorDef[]
  setDecors: (decors: FarmDecorDef[]) => void
  onDecorsChange: () => void
  getOwnedDecors?: () => Record<string, number>
  onPlaceDecor?: (decorId: string) => Promise<void>
  onRemoveDecor?: (instanceId: string) => Promise<void>
  onPersistLayout?: (decors: FarmDecorDef[]) => Promise<void>
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function mountFarmSceneEditor(
  host: HTMLElement,
  options: FarmSceneEditorOptions,
): FarmSceneEditorHandle {
  const mode = options.mode ?? 'dev'
  const isPlayer = mode === 'player'
  let active = false
  let selectedId: string | null = null
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let dragState: {
    id: string
    startX: number
    startY: number
    originLeft: number
    originTop: number
  } | null = null

  const panel = document.createElement('div')
  panel.className = 'farm-scene-editor'
  panel.hidden = true
  panel.innerHTML = `
    <div class="farm-scene-editor-head">
      <strong>${isPlayer ? '装饰摆放' : '场景编辑'}</strong>
      <span class="farm-scene-editor-hint">拖拽摆放 · 滚轮调大小 · [/] 调层级 · 双击/H 镜像 · Del 删除</span>
    </div>
    <div class="farm-scene-editor-assets" role="listbox" aria-label="添加装饰"></div>
    <div class="farm-scene-editor-props" hidden>
      <label class="farm-scene-editor-field">
        <span>宽度 %</span>
        <input type="range" min="2" max="60" step="0.5" data-prop="width" />
        <output data-prop-out="width">—</output>
      </label>
      <label class="farm-scene-editor-field">
        <span>层级</span>
        <input type="range" min="0" max="30" step="1" data-prop="zIndex" />
        <output data-prop-out="zIndex">—</output>
      </label>
      <p class="farm-scene-editor-layer-hint">数字越大越靠前；地块约 z2–10，背景装饰常用 z0–5，前景装饰可用 z11+</p>
      <div class="farm-scene-editor-layer-actions">
        <button type="button" class="secondary-button" data-action="layer-down">下移一层</button>
        <button type="button" class="secondary-button" data-action="layer-up">上移一层</button>
        <button type="button" class="secondary-button" data-action="layer-bottom">置于底层</button>
        <button type="button" class="secondary-button" data-action="layer-top">置于顶层</button>
      </div>
      <div class="farm-scene-editor-toolbar">
        <button type="button" class="secondary-button farm-scene-editor-flip" data-action="flip" aria-pressed="false">↔ 镜像翻转</button>
        <button type="button" class="secondary-button farm-scene-editor-lock" data-action="lock">🔒 锁定位置</button>
        <button type="button" class="secondary-button farm-scene-editor-delete" data-action="delete-selected">${isPlayer ? '收回背包' : '删除选中'}</button>
      </div>
    </div>
    <ul class="farm-scene-editor-list" aria-label="已放置装饰"></ul>
    <div class="farm-scene-editor-actions">
      <button type="button" class="secondary-button" data-action="copy">复制 JSON</button>
      <button type="button" class="secondary-button" data-action="save">保存草稿</button>
      <button type="button" class="secondary-button" data-action="reset">清空</button>
    </div>
    <textarea class="farm-scene-editor-export" readonly hidden aria-label="导出的 JSON"></textarea>
    <p class="farm-scene-editor-status" role="status"></p>
  `

  const toggleBtn = document.createElement('button')
  toggleBtn.type = 'button'
  toggleBtn.className = 'farm-scene-editor-toggle'
  toggleBtn.textContent = isPlayer ? '装饰摆放' : '场景编辑'
  toggleBtn.setAttribute('aria-pressed', 'false')

  host.appendChild(toggleBtn)
  host.appendChild(panel)

  const assetsEl = panel.querySelector<HTMLElement>('.farm-scene-editor-assets')!
  const propsEl = panel.querySelector<HTMLElement>('.farm-scene-editor-props')!
  const listEl = panel.querySelector<HTMLElement>('.farm-scene-editor-list')!
  const statusEl = panel.querySelector<HTMLElement>('.farm-scene-editor-status')!
  const exportEl = panel.querySelector<HTMLTextAreaElement>('.farm-scene-editor-export')!
  const widthInput = panel.querySelector<HTMLInputElement>('[data-prop="width"]')!
  const zIndexInput = panel.querySelector<HTMLInputElement>('[data-prop="zIndex"]')!
  const flipBtn = panel.querySelector<HTMLButtonElement>('[data-action="flip"]')!
  const widthOut = panel.querySelector<HTMLElement>('[data-prop-out="width"]')!
  const zIndexOut = panel.querySelector<HTMLElement>('[data-prop-out="zIndex"]')!

  const devActionsEl = panel.querySelector<HTMLElement>('.farm-scene-editor-actions')!
  if (isPlayer) devActionsEl.hidden = true

  function renderAssets() {
    const owned = options.getOwnedDecors?.() ?? {}
    const catalog = isPlayer
      ? FARM_DECOR_CATALOG.filter((item) => (owned[item.id] ?? 0) > 0)
      : FARM_DECOR_CATALOG
    assetsEl.innerHTML = catalog.length === 0
      ? `<p class="farm-scene-editor-list-empty">${isPlayer ? '背包暂无装饰，请先去商店购买' : '暂无可用素材'}</p>`
      : catalog
          .map((item) => {
            const count = owned[item.id]
            const badge = isPlayer && count ? `<span class="farm-scene-editor-asset-count">×${count}</span>` : ''
            return `
              <button type="button" class="farm-scene-editor-asset" data-catalog-id="${item.id}" title="${item.label}">
                <img src="./farm/${encodeURIComponent(item.src)}" alt="" draggable="false" />
                <span>${item.label}${badge}</span>
              </button>`
          })
          .join('')
  }

  renderAssets()

  function decorLabel(decor: FarmDecorDef): string {
    return FARM_DECOR_CATALOG.find((item) => item.id === decor.decorId)?.label ?? decor.src
  }

  function isDecorEditable(decor: FarmDecorDef | null | undefined): decor is FarmDecorDef {
    return Boolean(decor && !decor.locked)
  }

  function setStatus(message: string) {
    statusEl.textContent = message
  }

  function persistDraft() {
    saveFarmDecorDraft(options.getDecors())
  }

  function schedulePersist(decors: FarmDecorDef[]) {
    if (!isPlayer || !options.onPersistLayout) return
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      void options.onPersistLayout?.(decors)
    }, 350)
  }

  function updateDecors(next: FarmDecorDef[], opts?: { persist?: boolean }) {
    options.setDecors(next.map((decor) => {
      const normalized = normalizeFarmDecor(decor)
      if (decor.locked) normalized.locked = true
      return normalized
    }))
    const stage = options.getStage()
    if (stage) syncFarmDecorDom(stage, options.getDecors())
    options.onDecorsChange()
    renderList()
    renderSelection()
    if (opts?.persist === false) return
    if (isPlayer) schedulePersist(options.getDecors())
    else persistDraft()
  }

  function selectedDecor(): FarmDecorDef | null {
    if (!selectedId) return null
    return options.getDecors().find((decor) => decor.id === selectedId) ?? null
  }

  function renderSelection() {
    const stage = options.getStage()
    if (!stage) return
    stage.querySelectorAll<HTMLElement>('.farm-decor').forEach((el) => {
      const isSelected = el.dataset.decorId === selectedId
      el.classList.toggle('farm-decor--selected', isSelected)
      const item = options.getDecors().find((entry) => entry.id === el.dataset.decorId)
      el.classList.toggle('farm-decor--flip-x', Boolean(item?.flipX))
      el.classList.toggle('farm-decor--locked', Boolean(item?.locked))
    })

    const decor = selectedDecor()
    propsEl.hidden = !isDecorEditable(decor)
    if (!isDecorEditable(decor)) return

    widthInput.value = String(decor.width)
    zIndexInput.value = String(decor.zIndex)
    flipBtn.setAttribute('aria-pressed', String(Boolean(decor.flipX)))
    flipBtn.classList.toggle('farm-scene-editor-flip--active', Boolean(decor.flipX))
    widthOut.textContent = String(decor.width)
    zIndexOut.textContent = String(decor.zIndex)
  }

  function renderList() {
    const decors = options.getDecors()
    listEl.innerHTML = decors.length === 0
      ? '<li class="farm-scene-editor-list-empty">暂无装饰，点击上方素材添加</li>'
      : decors
          .map((decor) => {
            const label = decorLabel(decor)
            const active = decor.id === selectedId ? ' farm-scene-editor-list-item--active' : ''
            const flipTag = decor.flipX ? ' · 镜像' : ''
            const lockTag = decor.locked ? ' · 已锁定' : ''
            if (decor.locked) {
              return `
                <li class="farm-scene-editor-list-row farm-scene-editor-list-row--locked">
                  <span class="farm-scene-editor-list-item farm-scene-editor-list-item--locked">
                    ${label}
                    <span class="farm-scene-editor-list-meta">z${decor.zIndex} · ${decor.width}%${flipTag}${lockTag}</span>
                  </span>
                  <button type="button" class="secondary-button farm-scene-editor-unlock" data-unlock-id="${decor.id}">🔓 解锁</button>
                </li>`
            }
            return `
              <li class="farm-scene-editor-list-row">
                <button type="button" class="farm-scene-editor-list-item${active}" data-select-id="${decor.id}">
                  ${label}
                  <span class="farm-scene-editor-list-meta">z${decor.zIndex} · ${decor.width}%${flipTag}</span>
                </button>
                <button type="button" class="secondary-button farm-scene-editor-lock-inline" data-lock-id="${decor.id}" title="锁定位置">🔒</button>
              </li>`
          })
          .join('')
  }

  function selectDecor(id: string | null) {
    selectedId = id
    renderSelection()
    renderList()
  }

  function patchSelected(patch: Partial<FarmDecorDef>) {
    const decor = selectedDecor()
    if (!isDecorEditable(decor)) return
    updateDecors(
      options.getDecors().map((item) => (item.id === decor.id ? normalizeFarmDecor({ ...item, ...patch }) : item)),
    )
  }

  function setDecorLocked(id: string, locked: boolean) {
    const target = options.getDecors().find((item) => item.id === id)
    if (!target) return
    updateDecors(
      options.getDecors().map((item) => {
        if (item.id !== id) return item
        const next = normalizeFarmDecor(item)
        if (locked) next.locked = true
        return next
      }),
      { persist: false },
    )
    if (locked && selectedId === id) selectDecor(null)
    setStatus(locked ? `已锁定 ${decorLabel(target)}` : `已解锁 ${decorLabel(target)}`)
  }

  async function removeSelectedDecor() {
    const decor = selectedDecor()
    if (!isDecorEditable(decor)) return
    if (isPlayer && options.onRemoveDecor) {
      await options.onRemoveDecor(decor.id)
      selectDecor(null)
      renderAssets()
      setStatus('已收回背包')
      return
    }
    updateDecors(options.getDecors().filter((item) => item.id !== decor.id))
    selectDecor(null)
    setStatus('已删除选中装饰')
  }

  function nudgeSelected(dx: number, dy: number) {
    const decor = selectedDecor()
    if (!decor) return
    patchSelected({ left: decor.left + dx, top: decor.top + dy })
  }

  function toggleSelectedFlip() {
    const decor = selectedDecor()
    if (!decor) return
    const nextFlip = !decor.flipX
    patchSelected({ flipX: nextFlip })
    setStatus(nextFlip ? '已镜像翻转' : '已取消镜像')
  }

  function clampZIndex(value: number): number {
    return Math.max(0, Math.min(30, Math.round(value)))
  }

  function shiftSelectedLayer(delta: number) {
    const decor = selectedDecor()
    if (!decor) return
    patchSelected({ zIndex: clampZIndex(decor.zIndex + delta) })
    setStatus(`层级 z${clampZIndex(decor.zIndex + delta)}`)
  }

  function moveSelectedLayerToTop() {
    const decor = selectedDecor()
    if (!decor) return
    const maxZ = options.getDecors().reduce((max, item) => Math.max(max, item.zIndex), decor.zIndex)
    patchSelected({ zIndex: clampZIndex(maxZ + 1) })
    setStatus(`已置于顶层 z${clampZIndex(maxZ + 1)}`)
  }

  function moveSelectedLayerToBottom() {
    const decor = selectedDecor()
    if (!decor) return
    const minZ = options.getDecors().reduce((min, item) => Math.min(min, item.zIndex), decor.zIndex)
    patchSelected({ zIndex: clampZIndex(minZ - 1) })
    setStatus(`已置于底层 z${clampZIndex(minZ - 1)}`)
  }

  function onStagePointerDown(event: PointerEvent) {
    if (!active) return
    const stage = options.getStage()
    if (!stage) return
    const target = event.target as HTMLElement
    const decorEl = target.closest<HTMLElement>('.farm-decor')
    if (!decorEl?.dataset.decorId) {
      selectDecor(null)
      return
    }

    const clicked = options.getDecors().find((item) => item.id === decorEl.dataset.decorId)
    if (clicked?.locked) {
      event.preventDefault()
      event.stopPropagation()
      setStatus(`${decorLabel(clicked)} 已锁定，请在列表点击解锁`)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    selectDecor(decorEl.dataset.decorId)

    const decor = selectedDecor()
    if (!isDecorEditable(decor)) return
    dragState = {
      id: decor.id,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: decor.left,
      originTop: decor.top,
    }
    decorEl.setPointerCapture(event.pointerId)
  }

  function onStagePointerMove(event: PointerEvent) {
    if (!dragState) return
    const dragging = options.getDecors().find((item) => item.id === dragState!.id)
    if (!isDecorEditable(dragging)) {
      dragState = null
      return
    }
    const stage = options.getStage()
    if (!stage || stage.clientWidth <= 0 || stage.clientHeight <= 0) return

    const dx = ((event.clientX - dragState.startX) / stage.clientWidth) * 100
    const dy = ((event.clientY - dragState.startY) / stage.clientHeight) * 100
    const nextLeft = round2(dragState.originLeft + dx)
    const nextTop = round2(dragState.originTop + dy)

    updateDecors(
      options.getDecors().map((item) =>
        item.id === dragState!.id ? { ...item, left: nextLeft, top: nextTop } : item,
      ),
    )
  }

  function onStagePointerUp(event: PointerEvent) {
    if (!dragState) return
    const target = event.target as HTMLElement
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId)
    }
    dragState = null
  }

  function onStageDblClick(event: MouseEvent) {
    if (!active) return
    const decorEl = (event.target as HTMLElement).closest<HTMLElement>('.farm-decor')
    if (!decorEl?.dataset.decorId) return
    event.preventDefault()
    event.stopPropagation()
    selectDecor(decorEl.dataset.decorId)
    const decor = selectedDecor()
    if (!isDecorEditable(decor)) return
    toggleSelectedFlip()
  }

  function onStageWheel(event: WheelEvent) {
    if (!active) return
    const decor = selectedDecor()
    if (!isDecorEditable(decor)) return
    event.preventDefault()
    const delta = event.deltaY > 0 ? -0.5 : 0.5
    patchSelected({ width: Math.max(2, Math.min(60, decor.width + delta)) })
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!active) return
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, select, button')) return

    if (event.key === 'h' || event.key === 'H') {
      if (!isDecorEditable(selectedDecor())) return
      event.preventDefault()
      toggleSelectedFlip()
      return
    }

    if (event.key === '[') {
      if (!isDecorEditable(selectedDecor())) return
      event.preventDefault()
      shiftSelectedLayer(-1)
      return
    }

    if (event.key === ']') {
      if (!isDecorEditable(selectedDecor())) return
      event.preventDefault()
      shiftSelectedLayer(1)
      return
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!isDecorEditable(selectedDecor())) return
      event.preventDefault()
      void removeSelectedDecor()
      return
    }

    const step = event.shiftKey ? 1 : 0.25
    if (!isDecorEditable(selectedDecor())) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      nudgeSelected(-step, 0)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      nudgeSelected(step, 0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      nudgeSelected(0, -step)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      nudgeSelected(0, step)
    }
  }

  let boundStage: HTMLElement | null = null

  function unbindStageListeners() {
    if (!boundStage) return
    boundStage.classList.remove('farm-stage--editing')
    boundStage.removeEventListener('pointerdown', onStagePointerDown)
    boundStage.removeEventListener('pointermove', onStagePointerMove)
    boundStage.removeEventListener('pointerup', onStagePointerUp)
    boundStage.removeEventListener('pointercancel', onStagePointerUp)
    boundStage.removeEventListener('wheel', onStageWheel)
    boundStage.removeEventListener('dblclick', onStageDblClick)
    boundStage = null
  }

  function bindStage(stage: HTMLElement | null) {
    unbindStageListeners()
    if (!stage || !active) return
    boundStage = stage
    stage.classList.add('farm-stage--editing')
    stage.addEventListener('pointerdown', onStagePointerDown)
    stage.addEventListener('pointermove', onStagePointerMove)
    stage.addEventListener('pointerup', onStagePointerUp)
    stage.addEventListener('pointercancel', onStagePointerUp)
    stage.addEventListener('wheel', onStageWheel, { passive: false })
    stage.addEventListener('dblclick', onStageDblClick)
    syncFarmDecorDom(stage, options.getDecors())
    renderSelection()
  }

  function unbindStage(_stage: HTMLElement | null) {
    unbindStageListeners()
  }

  function clearStageEditorVisuals() {
    const stage = options.getStage()
    stage?.querySelectorAll<HTMLElement>('.farm-decor').forEach((el) => {
      el.classList.remove('farm-decor--selected', 'farm-decor--locked')
    })
  }

  function setActive(next: boolean) {
    active = next
    panel.hidden = !active
    toggleBtn.setAttribute('aria-pressed', String(active))
    toggleBtn.classList.toggle('farm-scene-editor-toggle--active', active)

    const stage = options.getStage()
    if (active) {
      bindStage(stage)
      renderList()
      renderAssets()
      renderSelection()
      setStatus(isPlayer ? '摆放模式：从背包选择装饰放置' : '编辑模式：地块点击已禁用')
    } else {
      unbindStage(stage)
      selectDecor(null)
      clearStageEditorVisuals()
      exportEl.hidden = true
      setStatus('')
    }
  }

  toggleBtn.addEventListener('click', () => setActive(!active))

  assetsEl.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-catalog-id]')
    if (!btn?.dataset.catalogId) return
    const catalogId = btn.dataset.catalogId
    if (isPlayer && options.onPlaceDecor) {
      void options.onPlaceDecor(catalogId).then(() => {
        renderAssets()
        setStatus(`已放置 ${FARM_DECOR_CATALOG.find((item) => item.id === catalogId)?.label ?? catalogId}`)
      })
      return
    }
    const index = options.getDecors().length
    const decor = createFarmDecorFromCatalog(catalogId, index)
    if (!decor) return
    updateDecors([...options.getDecors(), decor], { persist: false })
    selectDecor(decor.id)
    setStatus(`已添加 ${FARM_DECOR_CATALOG.find((item) => item.id === catalogId)?.label ?? decor.src}`)
  })

  listEl.addEventListener('click', (event) => {
    const unlockBtn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-unlock-id]')
    if (unlockBtn?.dataset.unlockId) {
      setDecorLocked(unlockBtn.dataset.unlockId, false)
      return
    }

    const lockBtn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-lock-id]')
    if (lockBtn?.dataset.lockId) {
      setDecorLocked(lockBtn.dataset.lockId, true)
      return
    }

    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-select-id]')
    if (!btn?.dataset.selectId) return
    selectDecor(btn.dataset.selectId)
  })

  widthInput.addEventListener('input', () => patchSelected({ width: Number(widthInput.value) }))
  zIndexInput.addEventListener('input', () => patchSelected({ zIndex: Number(zIndexInput.value) }))

  panel.querySelector('[data-action="layer-down"]')?.addEventListener('click', () => shiftSelectedLayer(-1))
  panel.querySelector('[data-action="layer-up"]')?.addEventListener('click', () => shiftSelectedLayer(1))
  panel.querySelector('[data-action="layer-bottom"]')?.addEventListener('click', () => moveSelectedLayerToBottom())
  panel.querySelector('[data-action="layer-top"]')?.addEventListener('click', () => moveSelectedLayerToTop())

  flipBtn.addEventListener('click', () => toggleSelectedFlip())

  panel.querySelector('[data-action="lock"]')?.addEventListener('click', () => {
    const decor = selectedDecor()
    if (!isDecorEditable(decor)) return
    setDecorLocked(decor.id, true)
  })

  panel.querySelector('[data-action="delete-selected"]')?.addEventListener('click', () => {
    void removeSelectedDecor()
  })

  panel.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
    const json = exportFarmDecorJson(options.getDecors())
    exportEl.value = json
    exportEl.hidden = false
    try {
      await navigator.clipboard.writeText(json)
      setStatus('JSON 已复制到剪贴板，可直接发给开发者')
    } catch {
      setStatus('复制失败，请手动全选下方 JSON')
    }
  })

  panel.querySelector('[data-action="save"]')?.addEventListener('click', () => {
    persistDraft()
    setStatus(`已保存 ${options.getDecors().length} 个装饰到本地草稿`)
  })

  panel.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
    if (!window.confirm('确定清空所有场景装饰？')) return
    clearFarmDecorDraft()
    updateDecors([])
    selectDecor(null)
    exportEl.hidden = true
    setStatus('已清空')
  })

  window.addEventListener('keydown', onKeyDown)

  if (!isPlayer) {
    const draft = loadFarmDecorDraft()
    if (draft.length > 0 && options.getDecors().length === 0) {
      options.setDecors(draft)
      const stage = options.getStage()
      if (stage) syncFarmDecorDom(stage, draft)
    }
  }

  return {
    isActive: () => active,
    rebindStage: () => {
      if (!active) return
      bindStage(options.getStage())
    },
    destroy: () => {
      unbindStage(options.getStage())
      window.removeEventListener('keydown', onKeyDown)
      toggleBtn.remove()
      panel.remove()
    },
  }
}
