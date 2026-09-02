/** 浏览器 Canvas 单边与总面积保守上限（避免 toBlob / toDataURL 产出空文件） */
export const MAX_CANVAS_SIDE = 8192
export const MAX_CANVAS_AREA = 16_777_216

export type SpriteSheetLayout = 'horizontal' | 'vertical' | 'grid'

export type SpriteSheetDimensions = {
  width: number
  height: number
  cols: number
  rows: number
}

export function computeFrameTimes(duration: number, fps: number, maxFrames: number): number[] {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 12
  const cap = Math.max(1, Math.floor(maxFrames))
  const interval = 1 / safeFps
  const times: number[] = []
  for (let t = 0; t < safeDuration - 1e-4 && times.length < cap; t += interval) {
    times.push(Number(t.toFixed(4)))
  }
  if (times.length === 0 && safeDuration > 0) times.push(0)
  return times
}

export function computeSpriteSheetDimensions(
  frameWidth: number,
  frameHeight: number,
  frameCount: number,
  layout: SpriteSheetLayout,
): SpriteSheetDimensions {
  const count = Math.max(1, Math.floor(frameCount))
  const fw = Math.max(1, Math.floor(frameWidth))
  const fh = Math.max(1, Math.floor(frameHeight))

  if (layout === 'horizontal') {
    return { width: fw * count, height: fh, cols: count, rows: 1 }
  }
  if (layout === 'vertical') {
    return { width: fw, height: fh * count, cols: 1, rows: count }
  }

  const cols = Math.max(1, Math.ceil(Math.sqrt(count)))
  const rows = Math.max(1, Math.ceil(count / cols))
  return { width: fw * cols, height: fh * rows, cols, rows }
}

export function fitFrameSize(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const sw = Math.max(1, Math.floor(sourceWidth))
  const sh = Math.max(1, Math.floor(sourceHeight))
  const maxW = maxWidth > 0 ? maxWidth : sw
  const maxH = maxHeight > 0 ? maxHeight : sh
  const scale = Math.min(1, maxW / sw, maxH / sh)
  return {
    width: Math.max(1, Math.round(sw * scale)),
    height: Math.max(1, Math.round(sh * scale)),
  }
}

/** 按最终雪碧图尺寸反推单帧大小，确保合成后不超出 Canvas 限制 */
export function fitSheetToCanvasLimits(
  frameWidth: number,
  frameHeight: number,
  frameCount: number,
  layout: SpriteSheetLayout,
): { frameWidth: number; frameHeight: number; scale: number } {
  let fw = Math.max(1, Math.floor(frameWidth))
  let fh = Math.max(1, Math.floor(frameHeight))
  const sheet = computeSpriteSheetDimensions(fw, fh, frameCount, layout)
  const scaleBySide = Math.min(1, MAX_CANVAS_SIDE / sheet.width, MAX_CANVAS_SIDE / sheet.height)
  const scaleByArea = Math.min(1, Math.sqrt(MAX_CANVAS_AREA / (sheet.width * sheet.height)))
  const scale = Math.min(scaleBySide, scaleByArea)
  if (scale < 1) {
    fw = Math.max(1, Math.round(fw * scale))
    fh = Math.max(1, Math.round(fh * scale))
  }
  return { frameWidth: fw, frameHeight: fh, scale }
}

export function validateSpriteSheetSize(width: number, height: number): string | null {
  if (width <= 0 || height <= 0) return '雪碧图尺寸无效'
  if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE) {
    return `雪碧图单边不能超过 ${MAX_CANVAS_SIDE}px，请减少帧数或缩小单帧尺寸`
  }
  if (width * height > MAX_CANVAS_AREA) {
    return '雪碧图总像素过大，请减少帧数、改用网格排列或缩小单帧尺寸'
  }
  return null
}

export function waitForVideoFrame(_video: HTMLVideoElement): Promise<void> {
  // 暂停/离屏视频上 requestVideoFrameCallback 在 Electron 中可能永不触发
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

const SEEK_TIMEOUT_MS = 8000

export function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    const target = Math.max(0, Math.min(time, Math.max(0, duration - 0.001)))

    const finish = (ok: boolean) => {
      clearTimeout(timer)
      cleanup()
      if (ok) resolve()
      else reject(new Error('视频定位失败'))
    }

    if (Math.abs(video.currentTime - target) < 0.001) {
      resolve()
      return
    }

    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }

    const onSeeked = () => finish(true)
    const onError = () => finish(false)

    const timer = setTimeout(() => {
      cleanup()
      // 超时后仍尝试抓帧（部分编码 seeked 不触发但画面已更新）
      resolve()
    }, SEEK_TIMEOUT_MS)

    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    try {
      video.currentTime = target
    } catch {
      finish(false)
    }
  })
}

/** 将 video 挂到 DOM，Electron 离屏元素 seek / drawImage 更可靠 */
export function attachVideoForProcessing(video: HTMLVideoElement): () => void {
  video.muted = true
  video.playsInline = true
  video.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none'
  document.body.appendChild(video)
  return () => video.remove()
}

export function loadVideoFromFile(file: File): Promise<{ video: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true

    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanup()
      fn()
    }

    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('error', onError)
    }

    const validateAndResolve = () => {
      if (video.videoWidth <= 0 || video.videoHeight <= 0) {
        URL.revokeObjectURL(url)
        reject(new Error('无法读取视频画面，请换一个编码格式（推荐 H.264 MP4）'))
        return
      }
      resolve({ video, url })
    }

    const onReady = () => settle(validateAndResolve)

    const onMetadata = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        settle(validateAndResolve)
      }
    }

    const onError = () => {
      settle(() => {
        URL.revokeObjectURL(url)
        reject(new Error('无法读取视频文件'))
      })
    }

    const timer = setTimeout(() => {
      settle(() => {
        URL.revokeObjectURL(url)
        reject(new Error('视频加载超时，请换一个文件试试'))
      })
    }, 30000)

    video.addEventListener('loadeddata', onReady)
    video.addEventListener('loadedmetadata', onMetadata)
    video.addEventListener('error', onError)
    video.src = url
  })
}

export type ExtractVideoFramesOptions = {
  fps: number
  maxFrames: number
  maxWidth: number
  maxHeight: number
  layout: SpriteSheetLayout
  onProgress?: (current: number, total: number) => void
}

export async function extractVideoFrames(
  video: HTMLVideoElement,
  options: ExtractVideoFramesOptions,
): Promise<{
  frames: HTMLCanvasElement[]
  frameWidth: number
  frameHeight: number
  sheetScale: number
}> {
  const times = computeFrameTimes(video.duration, options.fps, options.maxFrames)
  if (times.length === 0) throw new Error('视频时长无效')
  if (video.videoWidth <= 0 || video.videoHeight <= 0) {
    throw new Error('无法读取视频画面，请换一个编码格式（推荐 H.264 MP4）')
  }

  const fitted = fitFrameSize(video.videoWidth, video.videoHeight, options.maxWidth, options.maxHeight)
  const safe = fitSheetToCanvasLimits(
    fitted.width,
    fitted.height,
    times.length,
    options.layout,
  )
  const frames: HTMLCanvasElement[] = []
  const detachVideo = attachVideoForProcessing(video)

  try {
    for (let index = 0; index < times.length; index += 1) {
      await seekVideo(video, times[index]!)
      await waitForVideoFrame(video)
      const canvas = document.createElement('canvas')
      canvas.width = safe.frameWidth
      canvas.height = safe.frameHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('无法创建画布')
      ctx.drawImage(video, 0, 0, safe.frameWidth, safe.frameHeight)
      frames.push(canvas)
      options.onProgress?.(index + 1, times.length)
    }
  } finally {
    detachVideo()
  }

  return {
    frames,
    frameWidth: safe.frameWidth,
    frameHeight: safe.frameHeight,
    sheetScale: safe.scale,
  }
}

export function composeSpriteSheet(
  frames: HTMLCanvasElement[],
  layout: SpriteSheetLayout,
): HTMLCanvasElement {
  if (frames.length === 0) throw new Error('没有可合成的帧')
  const frameWidth = frames[0]!.width
  const frameHeight = frames[0]!.height
  const sheet = computeSpriteSheetDimensions(frameWidth, frameHeight, frames.length, layout)
  const canvas = document.createElement('canvas')
  canvas.width = sheet.width
  canvas.height = sheet.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')

  frames.forEach((frame, index) => {
    const col = layout === 'vertical' ? 0 : layout === 'horizontal' ? index : index % sheet.cols
    const row =
      layout === 'vertical'
        ? index
        : layout === 'horizontal'
          ? 0
          : Math.floor(index / sheet.cols)
    ctx.drawImage(frame, col * frameWidth, row * frameHeight)
  })

  return canvas
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const sizeError = validateSpriteSheetSize(canvas.width, canvas.height)
  if (sizeError) return Promise.reject(new Error(sizeError))

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size === 0) {
        reject(new Error('导出 PNG 失败，请减少帧数或缩小尺寸后重试'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}
