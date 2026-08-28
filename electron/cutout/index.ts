import sharp from 'sharp'

export type CutoutMode = 'auto' | 'white' | 'checker'

export interface CutoutOptions {
  /** 背景类型：自动 / 纯白 / 棋盘格灰白 */
  mode?: CutoutMode
  /** 背景容差 0–100 */
  tolerance?: number
  /** 边缘收缩（去白边），0–6 像素 */
  choke?: number
  /** 边缘去白晕 */
  despill?: boolean
}

export interface CutoutRequest {
  data: Uint8Array
  options?: CutoutOptions
}

export interface CutoutResult {
  data: Uint8Array
  width: number
  height: number
  format: 'image/png'
  extension: 'png'
  /** 透明像素占比 0–1 */
  transparentRatio: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function isSubject(r: number, g: number, b: number): boolean {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const lum = (r + g + b) / 3
  const sat = mx > 0 ? (mx - mn) / mx : 0
  if (g > r + 10 && g > b + 6 && g > 45) return true
  if (r > 45 && g > 25 && b < 125 && r >= g - 12 && r > b + 12 && sat > 0.12 && lum < 200) return true
  // 描边 / 深色轮廓（AI 导出 PNG 常见）
  if (lum < 95 && sat < 0.35) return true
  return false
}

function isBackgroundColor(
  r: number,
  g: number,
  b: number,
  mode: CutoutMode,
  tolerance: number,
): boolean {
  if (isSubject(r, g, b)) return false

  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const lum = (r + g + b) / 3
  const sat = mx > 0 ? (mx - mn) / mx : 0
  const t = tolerance / 100

  if (mode === 'white') {
    return lum >= 220 - t * 50 && sat < 0.2 + t * 0.15
  }

  if (mode === 'checker') {
    if (lum >= 160 - t * 25 && sat < 0.16 + t * 0.08) return true
    if (lum >= 120 && lum <= 230 && sat < 0.1 + t * 0.06) return true
    return false
  }

  // auto: white + checker gray
  if (lum >= 175 - t * 35 && sat < 0.25 + t * 0.05) return true
  if (lum >= 150 - t * 20 && sat < 0.14 + t * 0.05) return true
  if (lum >= 130 && lum <= 220 && sat < 0.1 + t * 0.05) return true
  return false
}

function erodeAlpha(alpha: Uint8Array, w: number, h: number, radius: number): void {
  if (radius <= 0) return
  const copy = Uint8Array.from(alpha)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (copy[i] === 0) continue
      let minA = copy[i]
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
            minA = 0
            continue
          }
          minA = Math.min(minA, copy[ny * w + nx])
        }
      }
      alpha[i] = minA
    }
  }
}

function removeSmallInteriorBackgroundIslands(
  data: Uint8Array,
  alpha: Uint8Array,
  w: number,
  h: number,
  mode: CutoutMode,
  tolerance: number,
): void {
  const visited = new Uint8Array(w * h)

  const isBgLike = (i: number) => {
    const o = i * 4
    return alpha[i] > 0 && isBackgroundColor(data[o], data[o + 1], data[o + 2], mode, tolerance)
  }

  const isProtectedNeighbor = (i: number) => {
    const o = i * 4
    return alpha[i] > 0 && !isBackgroundColor(data[o], data[o + 1], data[o + 2], mode, tolerance)
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x
      if (visited[start] || !isBgLike(start)) continue

      const queue = [start]
      const component: number[] = []
      visited[start] = 1
      let touchesSubject = false

      while (queue.length > 0) {
        const i = queue.pop()!
        component.push(i)
        const px = i % w
        const py = (i / w) | 0
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          const nx = px + dx
          const ny = py + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const ni = ny * w + nx
          if (isProtectedNeighbor(ni)) {
            touchesSubject = true
          }
          if (visited[ni] || !isBgLike(ni)) continue
          visited[ni] = 1
          queue.push(ni)
        }
      }

      // 贴边泛洪后仍留下的浅灰区域：若与描边/主体相邻则保留（如镰刀刀刃）
      if (!touchesSubject) {
        for (const i of component) alpha[i] = 0
      }
    }
  }
}

function removeBackgroundFromRgba(
  data: Uint8Array,
  w: number,
  h: number,
  mode: CutoutMode,
  tolerance: number,
  choke: number,
  despill: boolean,
): number {
  const alpha = new Uint8Array(w * h).fill(255)
  const visited = new Uint8Array(w * h)
  const queue: number[] = []

  const push = (x: number, y: number) => {
    const i = y * w + x
    if (visited[i]) return
    visited[i] = 1
    const o = i * 4
    const r = data[o]
    const g = data[o + 1]
    const b = data[o + 2]
    if (!isBackgroundColor(r, g, b, mode, tolerance)) return
    alpha[i] = 0
    queue.push(i)
  }

  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }

  while (queue.length > 0) {
    const i = queue.pop()!
    const x = i % w
    const y = (i / w) | 0
    if (x + 1 < w) push(x + 1, y)
    if (x > 0) push(x - 1, y)
    if (y + 1 < h) push(x, y + 1)
    if (y > 0) push(x, y - 1)
  }

  // 仅移除与主体不相邻的小块背景色孤岛，避免误删浅灰刀刃
  removeSmallInteriorBackgroundIslands(data, alpha, w, h, mode, tolerance)

  erodeAlpha(alpha, w, h, choke)

  let transparent = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const o = i * 4
      let a = alpha[i]
      const r = data[o]
      const g = data[o + 1]
      const b = data[o + 2]

      if (despill && a > 0 && a < 250) {
        const lum = (r + g + b) / 3
        const mx = Math.max(r, g, b)
        const mn = Math.min(r, g, b)
        const sat = mx > 0 ? (mx - mn) / mx : 0
        let edge = false
        for (const [dx, dy] of [
          [-3, 0],
          [3, 0],
          [0, -3],
          [0, 3],
        ] as const) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || alpha[ny * w + nx] < 20) {
            edge = true
            break
          }
        }
        if (edge && lum > 165 && sat < 0.35) {
          a = 0
        } else if (edge && lum > 140) {
          data[o] = Math.round(r * 0.55 + g * 0.15)
          data[o + 1] = Math.min(255, Math.round(g * 1.05))
          data[o + 2] = Math.round(b * 0.45)
          a = Math.round(a * 0.85)
        }
      }

      if (a < 8) {
        data[o + 3] = 0
        transparent++
      } else {
        data[o + 3] = a
      }
    }
  }

  return transparent / (w * h)
}

export async function cutoutImage(request: CutoutRequest): Promise<CutoutResult> {
  const mode = request.options?.mode ?? 'auto'
  const tolerance = clamp(request.options?.tolerance ?? 40, 0, 100)
  const choke = clamp(request.options?.choke ?? 2, 0, 6)
  const despill = request.options?.despill ?? true

  const decoded = await sharp(Buffer.from(request.data))
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { data, info } = decoded
  const pixels = Uint8Array.from(data)
  const transparentRatio = removeBackgroundFromRgba(
    pixels,
    info.width,
    info.height,
    mode,
    tolerance,
    choke,
    despill,
  )

  const output = await sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer()

  return {
    data: new Uint8Array(output),
    width: info.width,
    height: info.height,
    format: 'image/png',
    extension: 'png',
    transparentRatio,
  }
}
