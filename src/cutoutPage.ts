import type { CutoutOptions, CutoutRequest, CutoutResult } from '../electron/cutout'

export function mountCutoutPage() {
  const fileInput = document.querySelector<HTMLInputElement>('#cutout-file-input')!
  const dropZone = document.querySelector<HTMLElement>('#cutout-drop-zone')!
  const editor = document.querySelector<HTMLElement>('#cutout-editor')!
  const previewBefore = document.querySelector<HTMLImageElement>('#cutout-preview-before')!
  const previewAfter = document.querySelector<HTMLImageElement>('#cutout-preview-after')!
  const fileName = document.querySelector<HTMLElement>('#cutout-file-name')!
  const fileInfo = document.querySelector<HTMLElement>('#cutout-file-info')!
  const modeSelect = document.querySelector<HTMLSelectElement>('#cutout-mode')!
  const toleranceInput = document.querySelector<HTMLInputElement>('#cutout-tolerance')!
  const toleranceValue = document.querySelector<HTMLElement>('#cutout-tolerance-value')!
  const chokeInput = document.querySelector<HTMLInputElement>('#cutout-choke')!
  const chokeValue = document.querySelector<HTMLElement>('#cutout-choke-value')!
  const despillInput = document.querySelector<HTMLInputElement>('#cutout-despill')!
  const runButton = document.querySelector<HTMLButtonElement>('#cutout-run-button')!
  const replaceButton = document.querySelector<HTMLButtonElement>('#cutout-replace-button')!
  const result = document.querySelector<HTMLElement>('#cutout-result')!
  const resultDetail = document.querySelector<HTMLElement>('#cutout-result-detail')!
  const downloadButton = document.querySelector<HTMLButtonElement>('#cutout-download-button')!
  const errorMessage = document.querySelector<HTMLElement>('#cutout-error')!

  let sourceFile: File | null = null
  let sourceUrl: string | null = null
  let outputUrl: string | null = null
  let outputBytes: Uint8Array | null = null

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }

  const readOptions = (): CutoutOptions => ({
    mode: modeSelect.value as CutoutOptions['mode'],
    tolerance: Number(toleranceInput.value),
    choke: Number(chokeInput.value),
    despill: despillInput.checked,
  })

  const resetOutput = () => {
    result.hidden = true
    errorMessage.textContent = ''
    previewAfter.hidden = true
    previewAfter.removeAttribute('src')
    const placeholder = document.querySelector<HTMLElement>('#cutout-placeholder')
    if (placeholder) placeholder.hidden = false
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl)
      outputUrl = null
    }
    outputBytes = null
  }

  const readImageDimensions = (url: string) =>
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = reject
      image.src = url
    })

  async function selectFile(file: File) {
    if (!file.type.startsWith('image/')) {
      errorMessage.textContent = '请选择 PNG、JPG、WebP 等图片文件。'
      return
    }

    resetOutput()
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    sourceFile = file
    sourceUrl = URL.createObjectURL(file)

    try {
      const dimensions = await readImageDimensions(sourceUrl)
      previewBefore.src = sourceUrl
      fileName.textContent = file.name
      fileInfo.textContent = `${dimensions.width} × ${dimensions.height} px · ${formatBytes(file.size)}`
      dropZone.hidden = true
      editor.hidden = false
    } catch {
      errorMessage.textContent = '无法读取这张图片，请尝试其他文件。'
    }
  }

  async function runCutout() {
    if (!sourceFile) return

    runButton.disabled = true
    runButton.textContent = '抠图中…'
    resetOutput()

    try {
      const buffer = await sourceFile.arrayBuffer()
      const request: CutoutRequest = {
        data: new Uint8Array(buffer),
        options: readOptions(),
      }
      const output: CutoutResult = await window.electronAPI.cutoutImage(request)
      outputBytes = output.data
      outputUrl = URL.createObjectURL(new Blob([output.data.buffer as ArrayBuffer], { type: 'image/png' }))
      previewAfter.src = outputUrl
      previewAfter.hidden = false
      document.querySelector<HTMLElement>('#cutout-placeholder')!.hidden = true

      const transparentPercent = Math.round(output.transparentRatio * 100)
      resultDetail.textContent =
        `输出 ${output.width} × ${output.height} px 透明 PNG，` +
        `透明区域约 ${transparentPercent}%，体积 ${formatBytes(output.data.byteLength)}`
      result.hidden = false
    } catch {
      errorMessage.textContent = '抠图失败，请调整背景模式或容差后重试。'
    } finally {
      runButton.disabled = false
      runButton.textContent = '开始抠图'
    }
  }

  toleranceInput.addEventListener('input', () => {
    toleranceValue.textContent = toleranceInput.value
    resetOutput()
  })
  chokeInput.addEventListener('input', () => {
    chokeValue.textContent = chokeInput.value
    resetOutput()
  })
  modeSelect.addEventListener('change', resetOutput)
  despillInput.addEventListener('change', resetOutput)

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file) void selectFile(file)
  })

  replaceButton.addEventListener('click', () => fileInput.click())
  runButton.addEventListener('click', () => void runCutout())

  downloadButton.addEventListener('click', () => {
    if (!outputUrl || !sourceFile) return
    const baseName = sourceFile.name.replace(/\.[^.]+$/, '')
    const link = document.createElement('a')
    link.href = outputUrl
    link.download = `${baseName}-cutout.png`
    link.click()
  })

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
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    if (outputUrl) URL.revokeObjectURL(outputUrl)
  })
}
