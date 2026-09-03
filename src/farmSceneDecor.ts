import { resolveFarmAssetUrl } from './farmAssets'
import { getDecorFarmClick } from '../electron/game/decorCatalog'

import type { PlacedDecor } from '../electron/farm/farmTypes'

/** 场景装饰：坐标相对 .farm-stage（与 farm-bg.png 同比例） */
export type FarmDecorDef = {
  /** 实例 id */
  id: string
  /** 装饰类型 id（对应 decorCatalog） */
  decorId: string
  src: string
  left: number
  top: number
  width: number
  zIndex: number
  flipX?: boolean
  /** 编辑器内锁定，不参与导出 JSON */
  locked?: boolean
}

export type FarmDecorCatalogItem = {
  id: string
  label: string
  src: string
}

/** 可在编辑器中选取的场景素材（不含地块 / 作物 / 工具栏） */
export const FARM_DECOR_CATALOG: FarmDecorCatalogItem[] = [
  { id: 'pond', label: '池塘', src: 'pond.png' },
  { id: 'pond2', label: '池塘 2', src: 'pond2.png' },
  { id: 'sign', label: '招牌', src: 'sign-cutout.png' },
  { id: 'room', label: '小屋', src: 'room-cutout.png' },
  { id: 'tree', label: '树', src: 'trre-cutout.png' },
  { id: 'hay', label: '草垛', src: 'caoduo-cutout.png' },
  { id: 'goods', label: '货物', src: 'goods.png' },
  { id: 'light', label: '灯光', src: 'light.png' },
  { id: 'carpet', label: '地毯', src: '地毯-cutout.png' },
  { id: 'windmill', label: '大风车', src: '大风车-cutout.png' },
  { id: 'stool', label: '板凳', src: '板凳-cutout.png' },
  { id: 'scarecrow', label: '稻草人', src: '稻草人-cutout.png' },
  { id: 'flowers', label: '花丛', src: '花丛1-cutout.png' },
  { id: 'flowerpot', label: '花盆', src: '花盆-cutout.png' },
  { id: 'mushroom', label: '蘑菇', src: '蘑菇-cutout.png' },
  { id: 'mailbox', label: '邮箱', src: '邮箱-cutout.png' },
  { id: 'bench', label: '长椅', src: '长椅-cutout.png' },
]

export const DEFAULT_FARM_DECORS: FarmDecorDef[] = []

const DECOR_STORAGE_KEY = 'farm-scene-decor-draft'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isFarmDecorDef(value: unknown): value is FarmDecorDef {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string'
    && typeof item.decorId === 'string'
    && typeof item.src === 'string'
    && typeof item.left === 'number'
    && typeof item.top === 'number'
    && typeof item.width === 'number'
    && typeof item.zIndex === 'number'
  )
}

export function normalizeFarmDecor(decor: FarmDecorDef): FarmDecorDef {
  const normalized: FarmDecorDef = {
    id: decor.id,
    decorId: decor.decorId,
    src: decor.src,
    left: round2(decor.left),
    top: round2(decor.top),
    width: round2(decor.width),
    zIndex: Math.round(decor.zIndex),
  }
  if (decor.flipX) normalized.flipX = true
  return normalized
}

/** 草稿保存：保留编辑器锁定状态 */
export function normalizeFarmDecorDraft(decor: FarmDecorDef): FarmDecorDef {
  const normalized = normalizeFarmDecor(decor)
  if (decor.locked) normalized.locked = true
  return normalized
}

export function loadFarmDecorDraft(): FarmDecorDef[] {
  try {
    const raw = localStorage.getItem(DECOR_STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULT_FARM_DECORS)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return structuredClone(DEFAULT_FARM_DECORS)
    return parsed.filter(isFarmDecorDef).map((item) => {
      const draft = item as FarmDecorDef
      return normalizeFarmDecorDraft(draft)
    })
  } catch {
    return structuredClone(DEFAULT_FARM_DECORS)
  }
}

export function saveFarmDecorDraft(decors: FarmDecorDef[]): void {
  localStorage.setItem(DECOR_STORAGE_KEY, JSON.stringify(decors.map(normalizeFarmDecorDraft)))
}

export function clearFarmDecorDraft(): void {
  localStorage.removeItem(DECOR_STORAGE_KEY)
}

export function exportFarmDecorJson(decors: FarmDecorDef[]): string {
  return JSON.stringify(decors.map(normalizeFarmDecor), null, 2)
}

export function farmDecorInlineStyle(decor: FarmDecorDef): string {
  const parts = [
    `left:${decor.left}%`,
    `top:${decor.top}%`,
    `width:${decor.width}%`,
    `z-index:${decor.zIndex}`,
  ]
  if (decor.flipX) {
    parts.push('transform-origin:left center', 'transform:scaleX(-1)')
  }
  return parts.join(';')
}

export function renderFarmDecorHtml(decors: FarmDecorDef[]): string {
  if (decors.length === 0) return ''
  const items = decors
    .map((decor) => {
      const interactive = getDecorFarmClick(decor.decorId) ? ' farm-decor--interactive' : ''
      return `
        <img
          class="farm-decor${interactive}"
          data-decor-id="${decor.id}"
          data-decor-type="${decor.decorId}"
          src="${resolveFarmAssetUrl(decor.src)}"
          alt=""
          draggable="false"
          style="${farmDecorInlineStyle(decor)}"
        />`
    })
    .join('')
  return `<div class="farm-decor-layer" aria-hidden="true">${items}</div>`
}

export function syncFarmDecorDom(stage: HTMLElement, decors: FarmDecorDef[]): void {
  let layer = stage.querySelector<HTMLElement>('.farm-decor-layer')
  if (decors.length === 0) {
    layer?.remove()
    return
  }
  if (!layer) {
    stage.insertAdjacentHTML('afterbegin', renderFarmDecorHtml(decors))
    layer = stage.querySelector<HTMLElement>('.farm-decor-layer')
  }
  if (!layer) return

  const existing = new Map<string, HTMLImageElement>()
  layer.querySelectorAll<HTMLImageElement>('.farm-decor').forEach((img) => {
    const id = img.dataset.decorId
    if (id) existing.set(id, img)
  })

  for (const decor of decors) {
    let img = existing.get(decor.id)
    if (!img) {
      layer.insertAdjacentHTML(
        'beforeend',
        `<img class="farm-decor" data-decor-id="${decor.id}" data-decor-type="${decor.decorId}" src="${resolveFarmAssetUrl(decor.src)}" alt="" draggable="false" />`,
      )
      img = layer.querySelector<HTMLImageElement>(`.farm-decor[data-decor-id="${decor.id}"]`)!
    }
    img.src = resolveFarmAssetUrl(decor.src)
    img.dataset.decorType = decor.decorId
    img.setAttribute('style', farmDecorInlineStyle(decor))
    img.classList.toggle('farm-decor--flip-x', Boolean(decor.flipX))
    img.classList.toggle('farm-decor--locked', Boolean(decor.locked))
    img.classList.toggle('farm-decor--interactive', Boolean(getDecorFarmClick(decor.decorId)))
    existing.delete(decor.id)
  }

  for (const orphan of existing.values()) orphan.remove()
}

export function placedDecorsToFarmDecors(placed: PlacedDecor[]): FarmDecorDef[] {
  return placed.map((item) => {
    const catalog = FARM_DECOR_CATALOG.find((entry) => entry.id === item.decorId)
    return normalizeFarmDecor({
      id: item.instanceId,
      decorId: item.decorId,
      src: catalog?.src ?? item.decorId,
      left: item.left,
      top: item.top,
      width: item.width,
      zIndex: item.zIndex,
      flipX: item.flipX,
    })
  })
}

export function farmDecorsToPlaced(decors: FarmDecorDef[]): PlacedDecor[] {
  return decors.map((decor) => ({
    instanceId: decor.id,
    decorId: decor.decorId,
    left: decor.left,
    top: decor.top,
    width: decor.width,
    zIndex: decor.zIndex,
    ...(decor.flipX ? { flipX: true } : {}),
  }))
}

export function createFarmDecorFromCatalog(
  catalogId: string,
  index: number,
): FarmDecorDef | null {
  const item = FARM_DECOR_CATALOG.find((entry) => entry.id === catalogId)
  if (!item) return null
  return normalizeFarmDecor({
    id: `${item.id}-${Date.now()}-${index}`,
    decorId: item.id,
    src: item.src,
    left: 10 + (index % 4) * 4,
    top: 20 + Math.floor(index / 4) * 6,
    width: 15,
    zIndex: 1 + index,
  })
}
