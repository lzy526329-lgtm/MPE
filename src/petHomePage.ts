import { getFurnitureEntry, getFurnitureIds, type FurnitureId } from '../electron/game/furnitureCatalog'
import type { GameActionResult, GameViewState } from '../electron/game/gameTypes'
import type { HouseDecorPlacement } from '../electron/farm/farmTypes'
import { navigateToPage, onPageChange } from './appNavigation'
import { HOUSE_SURFACES, constrainHousePoint, houseSurfaceAt, type HousePoint } from './houseLayout'

const groups = {
  furniture: { label: '家具', ids: ['bed', 'bedsideTable', 'bookcase', 'smallTable', 'chair', 'lamp', 'fireplace', 'houseRug'] },
  plants: { label: '植物', ids: ['housePlant'] },
  walls: { label: '墙饰', ids: ['window'] },
} as const
type Group = keyof typeof groups
const assetUrl = (src: string) => {
  const relative = src.split('/').map(encodeURIComponent).join('/')
  return src.includes('/') ? `./${relative}` : `./farm/${relative}`
}

export function renderHouseRoom(): string {
  return `<div class="house-room" aria-label="个人小屋">
    <img class="house-room-art" src="./house/room.png" alt="两面木墙和菱形地板组成的手绘小屋" draggable="false" width="1536" height="1536">
    ${Object.entries(HOUSE_SURFACES).map(([surface, points]) => `<div class="house-surface" data-surface="${surface}" style="clip-path:polygon(${points.map((p) => `${p.left}% ${p.top}%`).join(',')})"></div>`).join('')}
    <div class="house-placements"></div>
    <img class="house-ghost" hidden alt="" draggable="false">
  </div>`
}

export function mountPetHomePage() {
  const root = document.querySelector<HTMLElement>('#pet-home-root')
  if (!root) return
  let state: GameViewState | null = null
  let selected: string | null = null
  let pending: FurnitureId | null = null
  let group: Group = 'furniture'
  let busy = false
  let drag: { id: string; pointerId: number; start: HousePoint; original: HouseDecorPlacement; moved: boolean } | null = null

  root.innerHTML = `<div class="house-layout">
    <div class="house-main">${renderHouseRoom()}<p class="house-status" role="status">读取中...</p></div>
    <aside class="house-assets" aria-label="素材仓库">
      <div class="house-assets-heading"><h2>素材仓库</h2><button type="button" class="text-button" data-action="shop">商店</button></div>
      <div class="house-tabs" role="tablist" aria-label="素材分类">${Object.entries(groups).map(([key, value]) => `<button type="button" role="tab" data-group="${key}" aria-selected="${key === group}">${value.label}</button>`).join('')}</div>
      <div class="house-asset-list" role="tabpanel"></div>
      <div class="house-selection"><span class="house-selection-name">未选中物品</span><button class="house-remove" type="button" disabled title="收回仓库" aria-label="收回仓库">×</button></div>
      <div class="house-edit-tools" hidden>
        <button type="button" class="house-tool-button" data-house-action="flip" aria-pressed="false">↔ 翻转</button>
        <button type="button" class="house-tool-button" data-house-action="rotate-left" title="逆时针旋转">↺ 旋转</button>
        <button type="button" class="house-tool-button" data-house-action="rotate-right" title="顺时针旋转">↻ 旋转</button>
        <span class="house-layer-label">层级 <b data-house-z>0</b></span>
        <button type="button" class="house-tool-button" data-house-action="down" title="下移一层">↓</button>
        <button type="button" class="house-tool-button" data-house-action="up" title="上移一层">↑</button>
        <button type="button" class="house-tool-button" data-house-action="bottom" title="置于底层">置底</button>
        <button type="button" class="house-tool-button" data-house-action="top" title="置于顶层">置顶</button>
      </div>
      <button type="button" class="text-button house-cancel" hidden>取消摆放</button>
    </aside>
  </div>`
  const room = root.querySelector<HTMLElement>('.house-room')!
  const placementsEl = root.querySelector<HTMLElement>('.house-placements')!
  const assetsEl = root.querySelector<HTMLElement>('.house-asset-list')!
  const status = root.querySelector<HTMLElement>('.house-status')!
  const ghost = root.querySelector<HTMLImageElement>('.house-ghost')!
  const removeBtn = root.querySelector<HTMLButtonElement>('.house-remove')!
  const cancelBtn = root.querySelector<HTMLButtonElement>('.house-cancel')!
  const selectionName = root.querySelector<HTMLElement>('.house-selection-name')!
  const editTools = root.querySelector<HTMLElement>('.house-edit-tools')!
  const flipButton = root.querySelector<HTMLButtonElement>('[data-house-action="flip"]')!
  const zOutput = root.querySelector<HTMLElement>('[data-house-z]')!
  const placements = () => state?.house?.placedDecors ?? []
  const entryFor = (id: string) => getFurnitureIds().includes(id as FurnitureId) ? getFurnitureEntry(id as FurnitureId) : null
  const pointAt = (event: MouseEvent): HousePoint => {
    const rect = room.getBoundingClientRect()
    return { left: (event.clientX - rect.left) / rect.width * 100, top: (event.clientY - rect.top) / rect.height * 100 }
  }
  const applyPosition = (el: HTMLElement, item: HouseDecorPlacement) => {
    el.style.left = `${item.left}%`
    el.style.top = `${item.top}%`
    el.style.width = `${item.width}%`
    el.style.zIndex = String(item.zIndex)
    el.style.transform = `translate(-50%, -100%) rotate(${item.rotation ?? 0}deg)`
    el.classList.toggle('is-flipped', Boolean(item.flipX))
  }
  const renderSelection = () => {
    const item = placements().find((item) => item.instanceId === selected)
    selectionName.textContent = pending ? getFurnitureEntry(pending).name : item ? entryFor(item.decorId)?.name ?? '物品' : '未选中物品'
    removeBtn.disabled = busy || !item
    editTools.hidden = busy || !item
    flipButton.setAttribute('aria-pressed', String(Boolean(item?.flipX)))
    flipButton.classList.toggle('is-active', Boolean(item?.flipX))
    zOutput.textContent = item ? String(item.zIndex) : '0'
    cancelBtn.hidden = !pending
    room.classList.toggle('is-placing', Boolean(pending))
    root.querySelectorAll<HTMLElement>('[data-instance-id]').forEach((el) => {
      el.classList.toggle('is-selected', el.dataset.instanceId === selected)
    })
  }
  const render = () => {
    placementsEl.replaceChildren()
    for (const item of placements()) {
      const entry = entryFor(item.decorId)
      if (!entry) continue
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'house-placement'
      el.dataset.instanceId = item.instanceId
      el.dataset.surface = item.surface
      el.disabled = busy
      applyPosition(el, item)
      const img = document.createElement('img')
      img.src = assetUrl(entry.src)
      img.alt = entry.name
      img.draggable = false
      el.append(img)
      placementsEl.append(el)
    }
    const ids = getFurnitureIds().filter((id) => (groups[group].ids as readonly string[]).includes(id) && (state?.inventory.furniture?.[id] ?? 0) > 0)
    assetsEl.innerHTML = ids.length ? ids.map((id) => {
      const entry = getFurnitureEntry(id)
      return `<button type="button" class="house-asset" data-decor-id="${id}" aria-pressed="${pending === id}" ${busy ? 'disabled' : ''}><img src="${assetUrl(entry.src)}" alt="" draggable="false"><span>${entry.name}</span><b>×${state!.inventory.furniture?.[id] ?? 0}</b></button>`
    }).join('') : '<p class="house-empty">暂无可用素材</p>'
    root.querySelectorAll<HTMLElement>('[data-group]').forEach((el) => el.setAttribute('aria-selected', String(el.dataset.group === group)))
    renderSelection()
  }
  const accept = (result: GameActionResult, message: string) => {
    state = result.state
    status.textContent = result.ok ? message : result.message
    return result.ok
  }
  const run = async (operation: () => Promise<void>) => {
    if (busy) return
    busy = true
    render()
    try { await operation() }
    catch { status.textContent = '操作失败，请重试' }
    finally { busy = false; render() }
  }
  const cancelPlacement = () => { pending = null; ghost.hidden = true; render() }
  const load = () => run(async () => { state = await window.electronAPI.houseGetState(); status.textContent = '' })
  const saveCurrent = (message: string) => {
    if (!state) return
    const next = placements().map((item) => ({ ...item }))
    void run(async () => { accept(await window.electronAPI.houseSaveDecors(next), message) })
  }

  editTools.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-house-action]')?.dataset.houseAction
    const item = placements().find((value) => value.instanceId === selected)
    if (!action || !item || busy) return
    if (action === 'flip') item.flipX = !item.flipX
    if (action === 'rotate-left') item.rotation = ((item.rotation ?? 0) - 15 + 360) % 360
    if (action === 'rotate-right') item.rotation = ((item.rotation ?? 0) + 15) % 360
    if (action === 'down') item.zIndex = Math.max(0, item.zIndex - 1)
    if (action === 'up') item.zIndex = Math.min(30, item.zIndex + 1)
    if (action === 'bottom') item.zIndex = 0
    if (action === 'top') item.zIndex = Math.max(0, ...placements().map((value) => value.zIndex)) + 1
    render()
    saveCurrent(action === 'flip' ? '已翻转并保存' : action.startsWith('rotate') ? '已旋转并保存' : '层级已保存')
  })

  room.addEventListener('click', (event) => {
    if (busy || !pending || (event.target as HTMLElement).closest('[data-instance-id]')) return
    const point = pointAt(event)
    const surface = houseSurfaceAt(point)
    if (!surface) return
    const id = pending
    ghost.hidden = true
    void run(async () => {
      const result = await window.electronAPI.housePlaceDecor({ decorId: id, surface })
      if (!accept(result, '已放置')) return
      pending = null
      const item = placements().at(-1)
      if (!item) return
      selected = item.instanceId
      const next = placements().map((value) => value.instanceId === selected ? { ...value, ...point } : value)
      accept(await window.electronAPI.houseSaveDecors(next), '已保存')
    })
  })
  room.addEventListener('pointerdown', (event) => {
    if (busy || pending || event.button !== 0) return
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-instance-id]')
    const item = placements().find((item) => item.instanceId === el?.dataset.instanceId)
    if (!item) { selected = null; renderSelection(); return }
    event.preventDefault()
    selected = item.instanceId
    drag = { id: selected, pointerId: event.pointerId, start: pointAt(event), original: { ...item }, moved: false }
    room.setPointerCapture(event.pointerId)
    renderSelection()
  })
  room.addEventListener('pointermove', (event) => {
    const point = pointAt(event)
    if (drag && drag.pointerId === event.pointerId) {
      const item = placements().find((item) => item.instanceId === drag!.id)
      if (!item) return
      const dx = point.left - drag.start.left, dy = point.top - drag.start.top
      if (Math.hypot(dx, dy) < 0.3 && !drag.moved) return
      drag.moved = true
      Object.assign(item, constrainHousePoint(item.surface, { left: drag.original.left + dx, top: drag.original.top + dy }))
      const el = Array.from(placementsEl.children).find((el) => (el as HTMLElement).dataset.instanceId === item.instanceId) as HTMLElement | undefined
      if (el) applyPosition(el, item)
    } else if (pending && !busy) {
      ghost.hidden = !houseSurfaceAt(point)
      ghost.src = assetUrl(getFurnitureEntry(pending).src)
      ghost.style.width = `${getFurnitureEntry(pending).defaultWidth}%`
      ghost.style.left = `${point.left}%`
      ghost.style.top = `${point.top}%`
    }
  })
  const finishDrag = (event: PointerEvent, cancelled: boolean) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    const ended = drag
    drag = null
    if (room.hasPointerCapture(event.pointerId)) room.releasePointerCapture(event.pointerId)
    if (cancelled) {
      const item = placements().find((item) => item.instanceId === ended.id)
      if (item) Object.assign(item, ended.original)
      render()
    } else if (ended.moved) {
      const next = placements().map((item) => ({ ...item }))
      const item = placements().find((item) => item.instanceId === ended.id)
      if (item) Object.assign(item, ended.original)
      void run(async () => { accept(await window.electronAPI.houseSaveDecors(next), '已保存') })
    }
  }
  room.addEventListener('pointerup', (event) => finishDrag(event, false))
  room.addEventListener('pointercancel', (event) => finishDrag(event, true))
  room.addEventListener('pointerleave', () => { ghost.hidden = true })
  room.addEventListener('lostpointercapture', (event) => finishDrag(event, true))
  placementsEl.addEventListener('click', (event) => {
    if (pending || busy) return
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-instance-id]')
    if (el) { selected = el.dataset.instanceId!; renderSelection() }
  })
  assetsEl.addEventListener('click', (event) => {
    if (busy) return
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-decor-id]')?.dataset.decorId as FurnitureId | undefined
    if (id) { pending = pending === id ? null : id; selected = null; ghost.hidden = true; render() }
  })
  root.querySelector('.house-tabs')!.addEventListener('click', (event) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>('[data-group]')?.dataset.group as Group | undefined
    if (key && !busy) { group = key; cancelPlacement() }
  })
  removeBtn.addEventListener('click', () => {
    const id = selected
    if (id) void run(async () => { if (accept(await window.electronAPI.houseRemoveDecor({ instanceId: id }), '已收回仓库')) selected = null })
  })
  cancelBtn.addEventListener('click', cancelPlacement)
  root.querySelector('[data-action="shop"]')!.addEventListener('click', () => navigateToPage('shop-page'))
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') cancelPlacement()
    if (event.key === 'Delete' && selected && !busy) { event.preventDefault(); removeBtn.click() }
    if (!selected || busy) return
    if (event.key.toLowerCase() === 'r') {
      event.preventDefault()
      root.querySelector<HTMLButtonElement>(`[data-house-action="rotate-${event.shiftKey ? 'left' : 'right'}"]`)?.click()
    }
  })
  onPageChange((page) => { if (page === 'pet-home-page' && !drag) void load(); else { pending = null; ghost.hidden = true } })
  window.electronAPI.onGameStateChanged?.((next) => { if (!busy && !drag) { state = next; render() } })
  void load()
}
