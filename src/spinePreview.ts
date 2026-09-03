import '@pixi/unsafe-eval'
import 'pixi-spine'
import { Application, Assets, RenderTexture, Ticker } from 'pixi.js'
import { Spine } from 'pixi-spine'
import { bindSleepExclusiveSlots, playExclusiveAnimation } from './petSpineSlots'

export type SpinePreviewHandle = {
  destroy: () => void
  setAnimation: (name: string, loop?: boolean) => void
  listAnimations: () => string[]
}

type FitBox = { x: number; y: number; width: number; height: number }

type PreviewSlot = {
  id: number
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  spine: Spine
  size: number
  resolution: number
}

const spineDataCache = new Map<string, unknown>()
const spineDataInflight = new Map<string, Promise<unknown>>()

let sharedApp: Application | null = null
let sharedExtractRt: RenderTexture | null = null
let nextSlotId = 1
const slots = new Map<number, PreviewSlot>()

function ensureSharedApp() {
  if (sharedApp) return sharedApp
  sharedApp = new Application({
    width: 8,
    height: 8,
    backgroundAlpha: 0,
    antialias: true,
    resolution: 1,
    autoDensity: false,
    autoStart: true,
  })
  const view = sharedApp.view as HTMLCanvasElement
  view.style.position = 'fixed'
  view.style.left = '-9999px'
  view.style.top = '0'
  view.style.width = '8px'
  view.style.height = '8px'
  view.style.pointerEvents = 'none'
  view.setAttribute('aria-hidden', 'true')
  document.body.appendChild(view)
  sharedApp.ticker.add(renderAllSlots)
  if (!Ticker.shared.started) Ticker.shared.start()
  return sharedApp
}

function disposeSharedExtractRt() {
  if (!sharedExtractRt) return
  sharedExtractRt.destroy(true)
  sharedExtractRt = null
}

function disposeSharedAppIfIdle() {
  if (!sharedApp || slots.size > 0) return
  sharedApp.ticker.remove(renderAllSlots)
  const view = sharedApp.view as HTMLCanvasElement
  disposeSharedExtractRt()
  sharedApp.destroy(true, {
    children: true,
    texture: false,
    baseTexture: false,
  })
  sharedApp = null
  view.remove()
}

function ensureExtractRt(pixel: number): RenderTexture {
  if (sharedExtractRt && sharedExtractRt.width === pixel && sharedExtractRt.height === pixel) {
    return sharedExtractRt
  }
  disposeSharedExtractRt()
  sharedExtractRt = RenderTexture.create({ width: pixel, height: pixel })
  return sharedExtractRt
}

function renderAllSlots() {
  if (!sharedApp || slots.size === 0) return
  const renderer = sharedApp.renderer

  for (const slot of slots.values()) {
    const pixel = Math.round(slot.size * slot.resolution)
    if (renderer.width !== pixel || renderer.height !== pixel) {
      renderer.resize(pixel, pixel)
    }
    // 固定尺寸 RT 再 extract，保留 fit 后的留白；避免直接 extract(spine) 按内容裁切再拉伸导致大小乱跳
    const rt = ensureExtractRt(pixel)
    renderer.render(slot.spine, { renderTexture: rt, clear: true })
    const extracted = renderer.extract.canvas(rt)
    slot.ctx.clearRect(0, 0, pixel, pixel)
    slot.ctx.drawImage(extracted as CanvasImageSource, 0, 0, pixel, pixel)
  }
}

function animationNames(character: Spine) {
  return character.spineData.animations.map((item) => item.name)
}

function preferredIdle(character: Spine) {
  const names = animationNames(character)
  return ['idle', 'stand', 'normal'].find((name) => names.includes(name)) ?? names[0]
}

function animationDuration(character: Spine, name: string) {
  return character.spineData.animations.find((item) => item.name === name)?.duration ?? 0
}

function unionBounds(box: FitBox | null, next: FitBox): FitBox {
  if (!box) return { ...next }
  const left = Math.min(box.x, next.x)
  const top = Math.min(box.y, next.y)
  const right = Math.max(box.x + box.width, next.x + next.width)
  const bottom = Math.max(box.y + box.height, next.y + next.height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function sampleAnimationBounds(character: Spine, name: string): FitBox | null {
  const duration = Math.max(animationDuration(character, name), 0.05)
  const samples = Math.max(8, Math.ceil(duration * 16))
  playExclusiveAnimation(character, name, false)
  character.update(0)
  let box: FitBox | null = null
  for (let i = 0; i <= samples; i++) {
    if (i > 0) character.update(duration / samples)
    const next = character.getLocalBounds()
    box = unionBounds(box, { x: next.x, y: next.y, width: next.width, height: next.height })
  }
  return box
}

function fitSpineToBox(character: Spine, viewSize: number, animation?: string) {
  character.autoUpdate = false
  character.scale.set(1)
  character.position.set(0, 0)
  character.pivot.set(0, 0)
  character.skeleton.setToSetupPose()

  // 以 idle 为主定缩放（和早期预览一致，大小刚好）；非 idle 再并入自身框，避免挤出
  const idle = preferredIdle(character)
  const target = animation || idle
  let box = idle ? sampleAnimationBounds(character, idle) : null
  if (target && target !== idle) {
    const targetBox = sampleAnimationBounds(character, target)
    if (targetBox) box = box ? unionBounds(box, targetBox) : targetBox
  }
  if (!box || box.width < 1 || box.height < 1) {
    character.autoUpdate = true
    return
  }

  const padding = Math.max(8, Math.round(viewSize * 0.1))
  const available = Math.max(1, viewSize - padding * 2)
  const scale = Math.min(available / box.width, available / box.height)
  character.pivot.set(box.x + box.width / 2, box.y + box.height / 2)
  character.position.set(viewSize / 2, viewSize / 2)
  character.scale.set(scale)
  character.autoUpdate = true
}

function applyPixelFit(
  character: Spine,
  logicalSize: number,
  resolution: number,
  animation?: string,
) {
  fitSpineToBox(character, logicalSize, animation)
  character.scale.x *= resolution
  character.scale.y *= resolution
  character.position.x *= resolution
  character.position.y *= resolution
}

function destroySpineSafely(spine: Spine | null) {
  if (!spine) return
  spine.destroy({
    children: true,
    texture: false,
    baseTexture: false,
  })
}

async function loadSpineData(skeletonUrl: string) {
  const cached = spineDataCache.get(skeletonUrl)
  if (cached) return cached

  const pending = spineDataInflight.get(skeletonUrl)
  if (pending) return pending

  const task = (async () => {
    const resource = await Assets.load(skeletonUrl)
    const spineData = (resource as { spineData?: unknown }).spineData ?? resource
    if (!spineData || typeof spineData !== 'object') {
      throw new Error('未得到 spineData')
    }
    const animations = (spineData as { animations?: unknown }).animations
    if (!Array.isArray(animations)) {
      throw new Error('animations 无效（Spine loader 可能未注册）')
    }
    spineDataCache.set(skeletonUrl, spineData)
    return spineData
  })()

  spineDataInflight.set(skeletonUrl, task)
  try {
    return await task
  } finally {
    spineDataInflight.delete(skeletonUrl)
  }
}

function showPreviewError(host: HTMLElement, message: string) {
  host.replaceChildren()
  const fallback = document.createElement('span')
  fallback.className = 'spine-preview-error'
  fallback.textContent = message
  fallback.title = message
  host.appendChild(fallback)
}

export async function mountSpinePreview(
  host: HTMLElement,
  options: {
    skeletonUrl: string
    size?: number
    animation?: string
    loop?: boolean
  },
): Promise<SpinePreviewHandle | null> {
  const size = Math.max(48, Math.round(options.size ?? 120))
  const resolution = Math.min(window.devicePixelRatio || 1, 2)
  host.replaceChildren()
  host.classList.add('spine-preview-host')

  const canvas = document.createElement('canvas')
  canvas.className = 'spine-preview-canvas'
  const pixel = Math.round(size * resolution)
  canvas.width = pixel
  canvas.height = pixel
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`
  host.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    showPreviewError(host, '预览失败：无法创建画布')
    return null
  }

  let destroyed = false
  let spine: Spine | null = null
  let slotId = 0

  try {
    ensureSharedApp()
    const spineData = await loadSpineData(options.skeletonUrl)
    if (destroyed) return null

    spine = new Spine(spineData as ConstructorParameters<typeof Spine>[0])
    bindSleepExclusiveSlots(spine as never)
    const anim = options.animation || preferredIdle(spine)
    applyPixelFit(spine, size, resolution, anim)
    if (anim) playExclusiveAnimation(spine, anim, options.loop !== false)

    slotId = nextSlotId++
    slots.set(slotId, { id: slotId, canvas, ctx, spine, size, resolution })

    return {
      destroy() {
        if (destroyed) return
        destroyed = true
        slots.delete(slotId)
        destroySpineSafely(spine)
        spine = null
        disposeSharedAppIfIdle()
        host.replaceChildren()
      },
      setAnimation(name: string, loop = true) {
        if (!spine) return
        applyPixelFit(spine, size, resolution, name)
        playExclusiveAnimation(spine, name, loop)
      },
      listAnimations() {
        return spine ? animationNames(spine) : []
      },
    }
  } catch (error) {
    console.error('Spine 预览加载失败', error)
    destroySpineSafely(spine)
    disposeSharedAppIfIdle()
    const message = error instanceof Error ? error.message : String(error)
    showPreviewError(host, `预览失败：${message}`)
    return null
  }
}

export async function listSpineAnimations(skeletonUrl: string) {
  const spineData = (await loadSpineData(skeletonUrl)) as {
    animations: { name: string }[]
  }
  return spineData.animations.map((item) => item.name)
}
