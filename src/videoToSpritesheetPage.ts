import { navigateToPage } from './appNavigation'
import { savePendingSpriteSheetImport } from './spriteSheetImport'
import {
  canvasToPngBlob,
  composeSpriteSheet,
  computeSpriteSheetDimensions,
  extractVideoFrames,
  loadVideoFromFile,
  type SpriteSheetLayout,
} from './videoToSpritesheet'

export function mountVideoToSpritesheetPage() {
  const fileInput = document.querySelector<HTMLInputElement>('#video-frames-file-input')!
  const dropZone = document.querySelector<HTMLElement>('#video-frames-drop-zone')!
  const editor = document.querySelector<HTMLElement>('#video-frames-editor')!
  const replaceButton = document.querySelector<HTMLButtonElement>('#video-frames-replace-button')!
  const fileName = document.querySelector<HTMLElement>('#video-frames-file-name')!
  const fileInfo = document.querySelector<HTMLElement>('#video-frames-file-info')!
  const fpsInput = document.querySelector<HTMLInputElement>('#video-frames-fps')!
  const maxFramesInput = document.querySelector<HTMLInputElement>('#video-frames-max-frames')!
  const maxWidthInput = document.querySelector<HTMLInputElement>('#video-frames-max-width')!
  const maxHeightInput = document.querySelector<HTMLInputElement>('#video-frames-max-height')!
  const layoutSelect = document.querySelector<HTMLSelectElement>('#video-frames-layout')!
  const runButton = document.querySelector<HTMLButtonElement>('#video-frames-run-button')!
  const previewImage = document.querySelector<HTMLImageElement>('#video-frames-preview')!
  const previewMeta = document.querySelector<HTMLElement>('#video-frames-preview-meta')!
  const previewPlaceholder = document.querySelector<HTMLElement>('#video-frames-preview-placeholder')!
  const progressWrap = document.querySelector<HTMLElement>('#video-frames-progress')!
  const progressText = document.querySelector<HTMLElement>('#video-frames-progress-text')!
  const progressFill = document.querySelector<HTMLElement>('#video-frames-progress-fill')!
  const result = document.querySelector<HTMLElement>('#video-frames-result')!
  const resultDetail = document.querySelector<HTMLElement>('#video-frames-result-detail')!
  const downloadButton = document.querySelector<HTMLButtonElement>('#video-frames-download-button')!
  const openPreviewButton = document.querySelector<HTMLButtonElement>('#video-frames-open-preview-button')!
  const errorMessage = document.querySelector<HTMLElement>('#video-frames-error')!

  let sourceFile: File | null = null
  let videoUrl: string | null = null
  let outputUrl: string | null = null
  let outputBlob: Blob | null = null
  let outputCanvas: HTMLCanvasElement | null = null
  let lastSheetMeta: {
    frameWidth: number
    frameHeight: number
    frameCount: number
    cols: number
    rows: number
    layout: SpriteSheetLayout
  } | null = null

  const resetOutput = () => {
    result.hidden = true
    previewImage.hidden = true
    previewImage.removeAttribute('src')
    if (previewPlaceholder) previewPlaceholder.hidden = false
    openPreviewButton.hidden = true
    if (outputUrl) URL.revokeObjectURL(outputUrl)
    outputUrl = null
    outputBlob = null
    outputCanvas = null
    lastSheetMeta = null
  }

  const setProgress = (visible: boolean, current = 0, total = 0) => {
    progressWrap.hidden = !visible
    if (!visible) return
    const pct = total > 0 ? Math.round((current / total) * 100) : 0
    progressText.textContent = total > 0 ? `正在提取 ${current}/${total} 帧…` : '准备中…'
    progressFill.style.width = `${pct}%`
  }

  async function selectFile(file: File) {
    if (!file.type.startsWith('video/')) {
      errorMessage.textContent = '请选择 MP4、WebM、MOV 等视频文件。'
      return
    }

    resetOutput()
    errorMessage.textContent = ''
    sourceFile = file

    try {
      const { video, url } = await loadVideoFromFile(file)
      if (videoUrl) URL.revokeObjectURL(videoUrl)
      videoUrl = url
      video.remove()
      fileName.textContent = file.name
      fileInfo.textContent = `${Math.round(video.duration * 10) / 10}s · ${video.videoWidth} × ${video.videoHeight}`
      dropZone.hidden = true
      editor.hidden = false
    } catch {
      errorMessage.textContent = '无法读取该视频，请换一个文件试试。'
    }
  }

  async function runConvert() {
    if (!sourceFile) return

    runButton.disabled = true
    runButton.textContent = '转换中…'
    resetOutput()
    setProgress(true, 0, 0)
    errorMessage.textContent = ''

    let blobUrl: string | null = null
    try {
      const { video, url } = await loadVideoFromFile(sourceFile)
      blobUrl = url

      const layout = layoutSelect.value as SpriteSheetLayout
      const { frames, frameWidth, frameHeight, sheetScale } = await extractVideoFrames(video, {
        fps: Number(fpsInput.value) || 12,
        maxFrames: Number(maxFramesInput.value) || 120,
        maxWidth: Number(maxWidthInput.value) || 0,
        maxHeight: Number(maxHeightInput.value) || 0,
        layout,
        onProgress: (current, total) => setProgress(true, current, total),
      })

      const sheet = composeSpriteSheet(frames, layout)
      const sheetDims = computeSpriteSheetDimensions(frameWidth, frameHeight, frames.length, layout)
      outputCanvas = sheet
      lastSheetMeta = {
        frameWidth,
        frameHeight,
        frameCount: frames.length,
        cols: sheetDims.cols,
        rows: sheetDims.rows,
        layout,
      }

      const blob = await canvasToPngBlob(sheet)
      if (outputUrl) URL.revokeObjectURL(outputUrl)
      outputBlob = blob
      outputUrl = URL.createObjectURL(blob)
      previewImage.src = outputUrl
      previewImage.hidden = false
      if (previewPlaceholder) previewPlaceholder.hidden = true
      previewMeta.textContent = `${sheet.width} × ${sheet.height} px · ${frames.length} 帧`
      const scaleNote =
        sheetScale < 1 ? `（已自动缩小 ${Math.round(sheetScale * 100)}% 以适配画布限制）` : ''
      resultDetail.textContent = `已生成雪碧图 ${sheet.width} × ${sheet.height} px，共 ${frames.length} 帧（${frameWidth} × ${frameHeight}/帧）${scaleNote}`
      result.hidden = false
      openPreviewButton.hidden = false
    } catch (error) {
      errorMessage.textContent =
        error instanceof Error ? error.message : '转换失败，请调整参数后重试。'
    } finally {
      setProgress(false)
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      runButton.disabled = false
      runButton.textContent = '开始转换'
    }
  }

  downloadButton.addEventListener('click', () => {
    if (!outputUrl || !sourceFile) return
    const baseName = sourceFile.name.replace(/\.[^.]+$/, '')
    const link = document.createElement('a')
    link.href = outputUrl
    link.download = `${baseName}-spritesheet.png`
    link.click()
  })

  openPreviewButton.addEventListener('click', () => {
    if (!lastSheetMeta || !outputCanvas || !outputBlob || !sourceFile) return
    savePendingSpriteSheetImport({
      objectUrl: URL.createObjectURL(outputBlob),
      name: `${sourceFile.name.replace(/\.[^.]+$/, '')}-spritesheet.png`,
      sheetWidth: outputCanvas.width,
      sheetHeight: outputCanvas.height,
      cols: lastSheetMeta.cols,
      rows: lastSheetMeta.rows,
      frameCount: lastSheetMeta.frameCount,
    })
    navigateToPage('spritesheet-page')
  })

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file) void selectFile(file)
  })
  replaceButton.addEventListener('click', () => fileInput.click())
  runButton.addEventListener('click', () => void runConvert())

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
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    if (outputUrl && outputUrl.startsWith('blob:')) URL.revokeObjectURL(outputUrl)
  })
}
