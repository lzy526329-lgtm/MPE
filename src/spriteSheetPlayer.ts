export type SpriteSheetConfig = {
  sheetWidth: number
  sheetHeight: number
  frameWidth: number
  frameHeight: number
  /** 0 表示使用网格推算的全部帧 */
  frameCount: number
}

export type SpriteSheetGrid = {
  cols: number
  rows: number
  frameCount: number
}

export function normalizePositiveInt(value: number, fallback = 1): number {
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.floor(value)
}

export function computeSpriteGrid(config: SpriteSheetConfig): SpriteSheetGrid {
  const sheetWidth = normalizePositiveInt(config.sheetWidth)
  const sheetHeight = normalizePositiveInt(config.sheetHeight)
  const frameWidth = normalizePositiveInt(config.frameWidth)
  const frameHeight = normalizePositiveInt(config.frameHeight)

  const cols = Math.max(1, Math.floor(sheetWidth / frameWidth))
  const rows = Math.max(1, Math.floor(sheetHeight / frameHeight))
  const maxFrames = cols * rows
  const frameCount =
    config.frameCount > 0 ? Math.min(normalizePositiveInt(config.frameCount), maxFrames) : maxFrames

  return { cols, rows, frameCount: Math.max(1, frameCount) }
}

export function frameIndexToCell(frameIndex: number, cols: number): { col: number; row: number } {
  const safeCols = Math.max(1, cols)
  const index = Math.max(0, Math.floor(frameIndex))
  return {
    col: index % safeCols,
    row: Math.floor(index / safeCols),
  }
}

export function readSpriteSheetConfig(input: {
  sheetWidth: number
  sheetHeight: number
  frameWidth: number
  frameHeight: number
  frameCount: number
}): SpriteSheetConfig | null {
  const sheetWidth = normalizePositiveInt(input.sheetWidth, 0)
  const sheetHeight = normalizePositiveInt(input.sheetHeight, 0)
  const frameWidth = normalizePositiveInt(input.frameWidth, 0)
  const frameHeight = normalizePositiveInt(input.frameHeight, 0)
  if (sheetWidth <= 0 || sheetHeight <= 0 || frameWidth <= 0 || frameHeight <= 0) return null
  if (frameWidth > sheetWidth || frameHeight > sheetHeight) return null

  return {
    sheetWidth,
    sheetHeight,
    frameWidth,
    frameHeight,
    frameCount: Math.max(0, Math.floor(input.frameCount || 0)),
  }
}

/** 由用户填写的列数、行数、帧数推算切帧配置 */
export function readSpriteSheetConfigFromGrid(input: {
  sheetWidth: number
  sheetHeight: number
  cols: number
  rows: number
  frameCount: number
}): SpriteSheetConfig | null {
  const sheetWidth = normalizePositiveInt(input.sheetWidth, 0)
  const sheetHeight = normalizePositiveInt(input.sheetHeight, 0)
  const cols = normalizePositiveInt(input.cols, 0)
  const rows = normalizePositiveInt(input.rows, 0)
  const frameCount = normalizePositiveInt(input.frameCount, 0)
  if (sheetWidth <= 0 || sheetHeight <= 0 || cols <= 0 || rows <= 0 || frameCount <= 0) return null

  const frameWidth = Math.floor(sheetWidth / cols)
  const frameHeight = Math.floor(sheetHeight / rows)
  if (frameWidth <= 0 || frameHeight <= 0) return null

  const maxFrames = cols * rows
  if (frameCount > maxFrames) return null

  return {
    sheetWidth,
    sheetHeight,
    frameWidth,
    frameHeight,
    frameCount,
  }
}

export function drawSpriteFrame(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  config: SpriteSheetConfig,
  frameIndex: number,
  destWidth: number,
  destHeight: number,
) {
  const grid = computeSpriteGrid(config)
  const index = ((frameIndex % grid.frameCount) + grid.frameCount) % grid.frameCount
  const { col, row } = frameIndexToCell(index, grid.cols)
  const sx = col * config.frameWidth
  const sy = row * config.frameHeight

  ctx.clearRect(0, 0, destWidth, destHeight)
  ctx.drawImage(
    image,
    sx,
    sy,
    config.frameWidth,
    config.frameHeight,
    0,
    0,
    destWidth,
    destHeight,
  )
}

export function fitCanvasSize(frameWidth: number, frameHeight: number, maxSize: number) {
  const safeMax = Math.max(64, maxSize)
  const scale = Math.min(1, safeMax / frameWidth, safeMax / frameHeight)
  return {
    width: Math.max(1, Math.round(frameWidth * scale)),
    height: Math.max(1, Math.round(frameHeight * scale)),
  }
}

/** 根据雪碧图比例猜测单帧尺寸（横条 / 竖条 / 网格） */
export function suggestDefaultFrameSize(sheetWidth: number, sheetHeight: number) {
  const width = normalizePositiveInt(sheetWidth)
  const height = normalizePositiveInt(sheetHeight)
  if (width > height * 1.5) {
    return { frameWidth: height, frameHeight: height }
  }
  if (height > width * 1.5) {
    return { frameWidth: width, frameHeight: width }
  }

  const gridGuess = suggestGridFrameSize(width, height)
  if (gridGuess) return gridGuess

  return { frameWidth: width, frameHeight: height }
}

function listDivisors(value: number): number[] {
  const divisors: number[] = []
  for (let i = 1; i * i <= value; i += 1) {
    if (value % i !== 0) continue
    divisors.push(i)
    const pair = value / i
    if (pair !== i) divisors.push(pair)
  }
  return divisors.sort((a, b) => a - b)
}

function suggestGridFrameSize(
  sheetWidth: number,
  sheetHeight: number,
): { frameWidth: number; frameHeight: number } | null {
  const widthDivisors = listDivisors(sheetWidth)
  const cellGuess = Math.max(32, Math.min(sheetWidth, sheetHeight) / 12)
  const estimateCols = Math.max(
    2,
    Math.round(Math.sqrt((sheetWidth * sheetHeight) / (cellGuess * cellGuess))),
  )

  let best: { frameWidth: number; frameHeight: number } | null = null
  let bestDiff = Infinity

  for (const frameWidth of widthDivisors) {
    if (frameWidth < 16 || frameWidth >= sheetWidth) continue
    if (sheetHeight % frameWidth !== 0) continue
    const cols = sheetWidth / frameWidth
    const rows = sheetHeight / frameWidth
    if (cols < 2 || rows < 2) continue

    const diff = Math.abs(cols - estimateCols) + Math.abs(rows - estimateCols)
    if (diff < bestDiff) {
      bestDiff = diff
      best = { frameWidth, frameHeight: frameWidth }
    }
  }

  return best
}
