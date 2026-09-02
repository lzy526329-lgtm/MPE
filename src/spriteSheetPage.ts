import {
  computeSpriteGrid,
  drawSpriteFrame,
  fitCanvasSize,
  readSpriteSheetConfigFromGrid,
  type SpriteSheetConfig,
} from './spriteSheetPlayer'
import { readPendingSpriteSheetImport } from './spriteSheetImport'

export function mountSpriteSheetPage() {
  const fileInput = document.querySelector<HTMLInputElement>('#spritesheet-file-input')!
  const dropZone = document.querySelector<HTMLElement>('#spritesheet-drop-zone')!
  const editor = document.querySelector<HTMLElement>('#spritesheet-editor')!
  const replaceButton = document.querySelector<HTMLButtonElement>('#spritesheet-replace-button')!
  const fileName = document.querySelector<HTMLElement>('#spritesheet-file-name')!
  const fileInfo = document.querySelector<HTMLElement>('#spritesheet-file-info')!
  const sheetWidthInput = document.querySelector<HTMLInputElement>('#spritesheet-sheet-width')!
  const sheetHeightInput = document.querySelector<HTMLInputElement>('#spritesheet-sheet-height')!
  const colsInput = document.querySelector<HTMLInputElement>('#spritesheet-cols')!
  const rowsInput = document.querySelector<HTMLInputElement>('#spritesheet-rows')!
  const frameCountInput = document.querySelector<HTMLInputElement>('#spritesheet-frame-count')!
  const fpsInput = document.querySelector<HTMLInputElement>('#spritesheet-fps')!
  const gridHint = document.querySelector<HTMLElement>('#spritesheet-grid-hint')!
  const frameLabel = document.querySelector<HTMLElement>('#spritesheet-frame-label')!
  const canvas = document.querySelector<HTMLCanvasElement>('#spritesheet-canvas')!
  const playButton = document.querySelector<HTMLButtonElement>('#spritesheet-play-button')!
  const prevButton = document.querySelector<HTMLButtonElement>('#spritesheet-prev-button')!
  const nextButton = document.querySelector<HTMLButtonElement>('#spritesheet-next-button')!
  const errorMessage = document.querySelector<HTMLElement>('#spritesheet-error')!

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  let sourceImage: HTMLImageElement | null = null
  let sourceUrl: string | null = null
  let frameIndex = 0
  let playing = false
  let rafId = 0
  let lastTickAt = 0

  const stopPlayback = () => {
    playing = false
    playButton.textContent = '播放'
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
    lastTickAt = 0
  }

  const readNumber = (input: HTMLInputElement) => Number(input.value)

  const readConfig = (): SpriteSheetConfig | null =>
    readSpriteSheetConfigFromGrid({
      sheetWidth: readNumber(sheetWidthInput),
      sheetHeight: readNumber(sheetHeightInput),
      cols: readNumber(colsInput),
      rows: readNumber(rowsInput),
      frameCount: readNumber(frameCountInput),
    })

  const syncGridHint = (config: SpriteSheetConfig | null) => {
    if (!config) {
      gridHint.textContent = '请填写列数、行数与帧数（均需大于 0，且帧数 ≤ 列数 × 行数）。'
      frameLabel.textContent = '—'
      playButton.disabled = true
      return null
    }
    const grid = computeSpriteGrid(config)
    gridHint.textContent = `${grid.cols} 列 × ${grid.rows} 行，单帧 ${config.frameWidth} × ${config.frameHeight} px，播放 ${grid.frameCount} 帧`
    if (frameIndex >= grid.frameCount) frameIndex = 0
    frameLabel.textContent = `${frameIndex + 1} / ${grid.frameCount}`
    playButton.disabled = grid.frameCount <= 1
    if (grid.frameCount <= 1) {
      gridHint.textContent += ' · 帧数需大于 1 才能播放'
    }
    return grid
  }

  const renderFrame = () => {
    if (!sourceImage) return
    const config = readConfig()
    const grid = syncGridHint(config)
    if (!config || !grid) {
      errorMessage.textContent = '参数无效：请检查列数、行数、帧数，且列数 × 行数需能容纳全部帧。'
      return
    }
    errorMessage.textContent = ''

    const size = fitCanvasSize(config.frameWidth, config.frameHeight, 360)
    canvas.width = size.width
    canvas.height = size.height
    drawSpriteFrame(ctx, sourceImage, config, frameIndex, size.width, size.height)
    frameLabel.textContent = `${frameIndex + 1} / ${grid.frameCount}`
  }

  const tick = (now: number) => {
    if (!playing) return
    const fps = Math.max(1, readNumber(fpsInput) || 12)
    const interval = 1000 / fps
    if (!lastTickAt) lastTickAt = now
    if (now - lastTickAt >= interval) {
      const config = readConfig()
      const grid = config ? computeSpriteGrid(config) : null
      if (grid) {
        frameIndex = (frameIndex + 1) % grid.frameCount
        renderFrame()
      }
      lastTickAt = now
    }
    rafId = requestAnimationFrame(tick)
  }

  const startPlayback = () => {
    const config = readConfig()
    if (!config || !sourceImage) return
    const grid = computeSpriteGrid(config)
    if (grid.frameCount <= 1) {
      errorMessage.textContent = '帧数需大于 1 才能播放。'
      return
    }
    errorMessage.textContent = ''
    playing = true
    playButton.textContent = '暂停'
    lastTickAt = 0
    if (rafId) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(tick)
  }

  const togglePlayback = () => {
    if (!sourceImage) return
    if (playing) stopPlayback()
    else startPlayback()
  }

  const stepFrame = (delta: number) => {
    const config = readConfig()
    const grid = config ? computeSpriteGrid(config) : null
    if (!grid) return
    stopPlayback()
    frameIndex = (frameIndex + delta + grid.frameCount) % grid.frameCount
    renderFrame()
  }

  const resetManualFields = () => {
    colsInput.value = ''
    rowsInput.value = ''
    frameCountInput.value = ''
  }

  async function selectFile(file: File) {
    if (!file.type.startsWith('image/')) {
      errorMessage.textContent = '请选择 PNG、JPG、WebP 等图片文件。'
      return
    }

    stopPlayback()
    frameIndex = 0
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)

    sourceUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      sourceImage = image
      const w = image.naturalWidth
      const h = image.naturalHeight
      sheetWidthInput.value = String(w)
      sheetHeightInput.value = String(h)
      resetManualFields()
      fileName.textContent = file.name
      fileInfo.textContent = `${w} × ${h} px`
      dropZone.hidden = true
      editor.hidden = false
      syncGridHint(null)
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
      errorMessage.textContent = ''
    }
    image.onerror = () => {
      errorMessage.textContent = '无法读取这张图片，请尝试其他文件。'
    }
    image.src = sourceUrl
  }

  for (const input of [
    sheetWidthInput,
    sheetHeightInput,
    colsInput,
    rowsInput,
    frameCountInput,
    fpsInput,
  ]) {
    input.addEventListener('input', () => {
      stopPlayback()
      renderFrame()
    })
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file) void selectFile(file)
  })
  replaceButton.addEventListener('click', () => fileInput.click())
  playButton.addEventListener('click', () => togglePlayback())
  prevButton.addEventListener('click', () => stepFrame(-1))
  nextButton.addEventListener('click', () => stepFrame(1))

  for (const eventName of ['dragenter', 'dragover']) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault()
      dropZone.classList.add('dragging')
    })
  }

  for (const eventName of ['dragleave', 'drop']) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault()
      dropZone.classList.remove('dragging')
    })
  }

  dropZone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files[0]
    if (file) void selectFile(file)
  })

  window.addEventListener('beforeunload', () => {
    stopPlayback()
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
  })

  const pending = readPendingSpriteSheetImport()
  if (pending) {
    stopPlayback()
    frameIndex = 0
    const image = new Image()
    image.onload = () => {
      sourceImage = image
      sheetWidthInput.value = String(pending.sheetWidth)
      sheetHeightInput.value = String(pending.sheetHeight)
      colsInput.value = String(pending.cols)
      rowsInput.value = String(pending.rows)
      frameCountInput.value = String(pending.frameCount)
      fileName.textContent = pending.name
      fileInfo.textContent = `${pending.sheetWidth} × ${pending.sheetHeight} px`
      dropZone.hidden = true
      editor.hidden = false
      renderFrame()
    }
    image.onerror = () => {
      errorMessage.textContent = '无法加载转换结果，请重新导出。'
    }
    image.src = pending.objectUrl
  }
}
