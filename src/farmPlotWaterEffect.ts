import type { SpriteSheetConfig } from './spriteSheetPlayer'
import { drawSpriteFrame, readSpriteSheetConfigFromGrid } from './spriteSheetPlayer'
import {
  FARM_PESTICIDE_EFFECT,
  FARM_WATER_EFFECT,
  PLOT_HIT_FACE_Y,
  type FarmSpriteEffectDef,
} from './farmAssets'

export type FarmPlotEffectOffsets = {
  offsetX: number
  offsetY: number
  sizeScale?: number
  /** 水平镜像（除虫等资源默认朝左时可开启） */
  mirrorX?: boolean
}

const DEFAULT_OFFSETS: FarmPlotEffectOffsets = {
  offsetX: 0.25,
  offsetY: -0.4,
  sizeScale: 0.65,
}

function buildConfig(effect: FarmSpriteEffectDef): SpriteSheetConfig | null {
  return readSpriteSheetConfigFromGrid({
    sheetWidth: effect.sheetWidth,
    sheetHeight: effect.sheetHeight,
    cols: effect.cols,
    rows: effect.rows,
    frameCount: effect.frameCount,
  })
}

const effectConfigs = {
  water: buildConfig(FARM_WATER_EFFECT),
  pesticide: buildConfig(FARM_PESTICIDE_EFFECT),
} as const

const imageCache = new Map<string, HTMLImageElement>()
const loadPromises = new Map<string, Promise<HTMLImageElement>>()

export function preloadFarmPlotEffect(kind: keyof typeof effectConfigs): Promise<HTMLImageElement> {
  const effect = kind === 'water' ? FARM_WATER_EFFECT : FARM_PESTICIDE_EFFECT
  const cached = imageCache.get(effect.src)
  if (cached) return Promise.resolve(cached)

  const pending = loadPromises.get(effect.src)
  if (pending) return pending

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      imageCache.set(effect.src, image)
      resolve(image)
    }
    image.onerror = () => reject(new Error(`${kind} 动画资源加载失败`))
    image.src = effect.src
  })
  loadPromises.set(effect.src, promise)
  return promise
}

export function preloadFarmWaterEffect(): Promise<HTMLImageElement> {
  return preloadFarmPlotEffect('water')
}

export function preloadFarmPesticideEffect(): Promise<HTMLImageElement> {
  return preloadFarmPlotEffect('pesticide')
}

function playFarmPlotSpriteEffect(
  tile: HTMLElement,
  kind: keyof typeof effectConfigs,
  offsets: FarmPlotEffectOffsets = DEFAULT_OFFSETS,
): void {
  const config = effectConfigs[kind]
  const effect = kind === 'water' ? FARM_WATER_EFFECT : FARM_PESTICIDE_EFFECT
  if (!config) return

  void preloadFarmPlotEffect(kind).then((image) => {
    const rect = tile.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const sizeScale = offsets.sizeScale ?? DEFAULT_OFFSETS.sizeScale ?? 0.9
    const size = rect.width * sizeScale
    const anchorX = rect.left + rect.width / 2
    const anchorY = rect.top + rect.height * PLOT_HIT_FACE_Y
    const centerX = anchorX + rect.width * offsets.offsetX
    const centerY = anchorY + rect.height * offsets.offsetY

    const host = document.createElement('div')
    host.className = `farm-plot-sprite-effect farm-plot-sprite-effect--${kind}`
    host.style.left = `${centerX - size / 2}px`
    host.style.top = `${centerY - size / 2}px`
    host.style.width = `${size}px`
    host.style.height = `${size}px`

    const canvas = document.createElement('canvas')
    host.appendChild(canvas)
    document.body.appendChild(host)

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      host.remove()
      return
    }
    ctx.scale(dpr, dpr)

    const fps = effect.fps
    const frameCount = config.frameCount
    const interval = 1000 / fps
    let frameIndex = 0
    let lastTick = 0
    let rafId = 0

    const draw = () => {
      ctx.save()
      if (offsets.mirrorX) {
        ctx.translate(size, 0)
        ctx.scale(-1, 1)
      }
      drawSpriteFrame(ctx, image, config, frameIndex, size, size)
      ctx.restore()
    }

    const finish = () => {
      if (rafId) cancelAnimationFrame(rafId)
      host.remove()
    }

    const tick = (now: number) => {
      if (!lastTick) lastTick = now
      if (now - lastTick >= interval) {
        frameIndex += 1
        if (frameIndex >= frameCount) {
          finish()
          return
        }
        draw()
        lastTick = now
      }
      rafId = requestAnimationFrame(tick)
    }

    draw()
    rafId = requestAnimationFrame(tick)
  })
}

/** 相对地块中心点的偏移（比例：1 = 一整块宽/高；正=右/下，负=左/上） */
export const FARM_WATER_EFFECT_OFFSETS: FarmPlotEffectOffsets = {
  offsetX: 0.25,
  offsetY: -0.4,
  sizeScale: 0.65,
}

export const FARM_PESTICIDE_EFFECT_OFFSETS: FarmPlotEffectOffsets = {
  offsetX: 0.25,
  offsetY: -0.1,
  sizeScale: 0.5,
  mirrorX: true,
}

export function playFarmWaterEffect(tile: HTMLElement): void {
  playFarmPlotSpriteEffect(tile, 'water', FARM_WATER_EFFECT_OFFSETS)
}

export function playFarmPesticideEffect(tile: HTMLElement): void {
  playFarmPlotSpriteEffect(tile, 'pesticide', FARM_PESTICIDE_EFFECT_OFFSETS)
}
