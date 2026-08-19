import type { PdfFileInfo } from '../electron/pdf'

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function escapeHtml(value: string) {
  const element = document.createElement('span')
  element.textContent = value
  return element.innerHTML
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

function pathsFromFiles(files: File[]) {
  return files
    .map((file) => window.electronAPI.getPathForFile(file))
    .filter((value): value is string => Boolean(value))
}

export function mountPdfPage() {
  const tabs = document.querySelectorAll<HTMLButtonElement>('.pdf-tab')
  const panels = document.querySelectorAll<HTMLElement>('.pdf-pane')

  const mergeInput = document.querySelector<HTMLInputElement>('#pdf-merge-input')!
  const mergePick = document.querySelector<HTMLButtonElement>('#pdf-merge-pick')!
  const mergeList = document.querySelector<HTMLElement>('#pdf-merge-list')!
  const mergeSummary = document.querySelector<HTMLElement>('#pdf-merge-summary')!
  const mergeButton = document.querySelector<HTMLButtonElement>('#pdf-merge-button')!
  const mergeError = document.querySelector<HTMLElement>('#pdf-merge-error')!
  const mergeResult = document.querySelector<HTMLElement>('#pdf-merge-result')!

  const splitInput = document.querySelector<HTMLInputElement>('#pdf-split-input')!
  const splitPick = document.querySelector<HTMLButtonElement>('#pdf-split-pick')!
  const splitInfo = document.querySelector<HTMLElement>('#pdf-split-info')!
  const splitRanges = document.querySelector<HTMLInputElement>('#pdf-split-ranges')!
  const splitButton = document.querySelector<HTMLButtonElement>('#pdf-split-button')!
  const splitError = document.querySelector<HTMLElement>('#pdf-split-error')!
  const splitResult = document.querySelector<HTMLElement>('#pdf-split-result')!

  const imageInput = document.querySelector<HTMLInputElement>('#image-pdf-input')!
  const imagePick = document.querySelector<HTMLButtonElement>('#image-pdf-pick')!
  const imageList = document.querySelector<HTMLElement>('#image-pdf-list')!
  const imageSummary = document.querySelector<HTMLElement>('#image-pdf-summary')!
  const imageButton = document.querySelector<HTMLButtonElement>('#image-pdf-button')!
  const imageError = document.querySelector<HTMLElement>('#image-pdf-error')!
  const imageResult = document.querySelector<HTMLElement>('#image-pdf-result')!

  const exportInput = document.querySelector<HTMLInputElement>('#pdf-export-input')!
  const exportPick = document.querySelector<HTMLButtonElement>('#pdf-export-pick')!
  const exportInfo = document.querySelector<HTMLElement>('#pdf-export-info')!
  const exportFormat = document.querySelector<HTMLSelectElement>('#pdf-export-format')!
  const exportButton = document.querySelector<HTMLButtonElement>('#pdf-export-button')!
  const exportError = document.querySelector<HTMLElement>('#pdf-export-error')!
  const exportResult = document.querySelector<HTMLElement>('#pdf-export-result')!

  const compressInput = document.querySelector<HTMLInputElement>('#pdf-compress-input')!
  const compressPick = document.querySelector<HTMLButtonElement>('#pdf-compress-pick')!
  const compressInfo = document.querySelector<HTMLElement>('#pdf-compress-info')!
  const compressQuality = document.querySelector<HTMLSelectElement>('#pdf-compress-quality')!
  const compressButton = document.querySelector<HTMLButtonElement>('#pdf-compress-button')!
  const compressError = document.querySelector<HTMLElement>('#pdf-compress-error')!
  const compressResult = document.querySelector<HTMLElement>('#pdf-compress-result')!

  const extractInput = document.querySelector<HTMLInputElement>('#pdf-extract-input')!
  const extractPick = document.querySelector<HTMLButtonElement>('#pdf-extract-pick')!
  const extractInfo = document.querySelector<HTMLElement>('#pdf-extract-info')!
  const extractButton = document.querySelector<HTMLButtonElement>('#pdf-extract-button')!
  const extractError = document.querySelector<HTMLElement>('#pdf-extract-error')!
  const extractResult = document.querySelector<HTMLElement>('#pdf-extract-result')!

  const watermarkInput = document.querySelector<HTMLInputElement>('#pdf-watermark-input')!
  const watermarkPick = document.querySelector<HTMLButtonElement>('#pdf-watermark-pick')!
  const watermarkInfo = document.querySelector<HTMLElement>('#pdf-watermark-info')!
  const watermarkText = document.querySelector<HTMLInputElement>('#pdf-watermark-text')!
  const watermarkOpacity = document.querySelector<HTMLSelectElement>('#pdf-watermark-opacity')!
  const watermarkButton = document.querySelector<HTMLButtonElement>('#pdf-watermark-button')!
  const watermarkError = document.querySelector<HTMLElement>('#pdf-watermark-error')!
  const watermarkResult = document.querySelector<HTMLElement>('#pdf-watermark-result')!

  let mergePdfs: PdfFileInfo[] = []
  let splitPdf: PdfFileInfo | null = null
  let imageFiles: PdfFileInfo[] = []
  let exportPdf: PdfFileInfo | null = null
  let compressPdf: PdfFileInfo | null = null
  let extractPdf: PdfFileInfo | null = null
  let watermarkPdf: PdfFileInfo | null = null

  const showTab = (tabId: string) => {
    tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabId))
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.tab !== tabId
    })
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab!))
  })

  mergePick.addEventListener('click', () => mergeInput.click())
  splitPick.addEventListener('click', () => splitInput.click())
  imagePick.addEventListener('click', () => imageInput.click())
  exportPick.addEventListener('click', () => exportInput.click())
  compressPick.addEventListener('click', () => compressInput.click())
  extractPick.addEventListener('click', () => extractInput.click())
  watermarkPick.addEventListener('click', () => watermarkInput.click())

  async function loadPdfInfos(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    const paths = pathsFromFiles(files)
    return Promise.all(paths.map((filePath) => window.electronAPI.inspectPdf(filePath)))
  }

  async function loadImageInfos(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    const paths = pathsFromFiles(files)
    return Promise.all(paths.map((filePath) => window.electronAPI.inspectPdfImage(filePath)))
  }

  mergeInput.addEventListener('change', async () => {
    mergeError.textContent = ''
    mergeResult.hidden = true
    try {
      mergePdfs = await loadPdfInfos(mergeInput.files)
      mergeList.innerHTML = mergePdfs.map((file, index) => `
        <div class="pdf-file-item">
          <span class="pdf-file-order">${index + 1}</span>
          <div>
            <strong>${escapeHtml(file.name)}</strong>
            <span>${file.pageCount ?? 0} 页 · ${formatBytes(file.size)}</span>
          </div>
        </div>
      `).join('')
      const totalPages = mergePdfs.reduce((sum, item) => sum + (item.pageCount ?? 0), 0)
      mergeSummary.textContent = mergePdfs.length > 0
        ? `已选择 ${mergePdfs.length} 个 PDF，共 ${totalPages} 页`
        : '请先选择 PDF 文件'
    } catch (error) {
      mergePdfs = []
      mergeList.innerHTML = ''
      mergeSummary.textContent = '请先选择 PDF 文件'
      mergeError.textContent = error instanceof Error ? error.message : '读取 PDF 失败'
    }
  })

  mergeButton.addEventListener('click', async () => {
    if (mergePdfs.length < 2) {
      mergeError.textContent = '至少选择两个 PDF 文件。'
      return
    }
    mergeError.textContent = ''
    mergeResult.hidden = true
    mergeButton.disabled = true
    mergeButton.textContent = '合并中…'
    try {
      const first = mergePdfs[0]
      const savePath = await window.electronAPI.choosePdfSavePath({
        title: '保存合并后的 PDF',
        defaultPath: `${first.defaultDestination}/${baseName(first.name)}-merged.pdf`,
      })
      if (!savePath) return
      const output = await window.electronAPI.mergePdf({
        sourcePaths: mergePdfs.map((item) => item.path),
        outputPath: savePath,
      })
      mergeResult.hidden = false
      mergeResult.innerHTML = `
        <div class="result-copy">
          <span class="success-icon">✓</span>
          <div>
            <strong>合并完成</strong>
            <span>输出 ${formatBytes(output.outputSize)}</span>
          </div>
        </div>
        <button class="download-button" id="pdf-merge-reveal" type="button">查看文件</button>
      `
      document.querySelector<HTMLButtonElement>('#pdf-merge-reveal')!
        .addEventListener('click', () => void window.electronAPI.revealPath(output.outputPath))
    } catch (error) {
      mergeError.textContent = error instanceof Error ? error.message : '合并失败'
    } finally {
      mergeButton.disabled = false
      mergeButton.textContent = '合并为一个 PDF'
    }
  })

  splitInput.addEventListener('change', async () => {
    splitError.textContent = ''
    splitResult.hidden = true
    splitPdf = null
    try {
      const [file] = await loadPdfInfos(splitInput.files)
      splitPdf = file
      splitInfo.innerHTML = `
        <div class="pdf-selected-card">
          <strong>${escapeHtml(file.name)}</strong>
          <span>${file.pageCount ?? 0} 页 · ${formatBytes(file.size)}</span>
        </div>
      `
    } catch (error) {
      splitInfo.innerHTML = ''
      splitError.textContent = error instanceof Error ? error.message : '读取 PDF 失败'
    }
  })

  splitButton.addEventListener('click', async () => {
    if (!splitPdf) {
      splitError.textContent = '请先选择要拆分的 PDF。'
      return
    }
    if (!splitRanges.value.trim()) {
      splitError.textContent = '请输入页码范围，例如 1-3,4,7-9。'
      return
    }
    splitError.textContent = ''
    splitResult.hidden = true
    splitButton.disabled = true
    splitButton.textContent = '拆分中…'
    try {
      const folder = await window.electronAPI.choosePdfOutputFolder(splitPdf.defaultDestination)
      if (!folder) return
      const output = await window.electronAPI.splitPdf({
        sourcePath: splitPdf.path,
        outputDirectory: folder,
        ranges: splitRanges.value,
      })
      splitResult.hidden = false
      splitResult.innerHTML = `
        <div class="result-copy">
          <span class="success-icon">✓</span>
          <div>
            <strong>拆分完成</strong>
            <span>已生成 ${output.files.length} 个 PDF</span>
          </div>
        </div>
        <button class="download-button" id="pdf-split-open" type="button">打开文件夹</button>
      `
      document.querySelector<HTMLButtonElement>('#pdf-split-open')!
        .addEventListener('click', () => void window.electronAPI.openPath(output.outputDirectory))
    } catch (error) {
      splitError.textContent = error instanceof Error ? error.message : '拆分失败'
    } finally {
      splitButton.disabled = false
      splitButton.textContent = '按页码拆分'
    }
  })

  imageInput.addEventListener('change', async () => {
    imageError.textContent = ''
    imageResult.hidden = true
    try {
      imageFiles = await loadImageInfos(imageInput.files)
      imageList.innerHTML = imageFiles.map((file, index) => `
        <div class="pdf-file-item">
          <span class="pdf-file-order">${index + 1}</span>
          <div>
            <strong>${escapeHtml(file.name)}</strong>
            <span>${formatBytes(file.size)}</span>
          </div>
        </div>
      `).join('')
      const totalSize = imageFiles.reduce((sum, item) => sum + item.size, 0)
      imageSummary.textContent = imageFiles.length > 0
        ? `已选择 ${imageFiles.length} 张图片，共 ${formatBytes(totalSize)}`
        : '请先选择图片'
    } catch (error) {
      imageFiles = []
      imageList.innerHTML = ''
      imageSummary.textContent = '请先选择图片'
      imageError.textContent = error instanceof Error ? error.message : '读取图片失败'
    }
  })

  imageButton.addEventListener('click', async () => {
    if (imageFiles.length === 0) {
      imageError.textContent = '请先选择图片。'
      return
    }
    imageError.textContent = ''
    imageResult.hidden = true
    imageButton.disabled = true
    imageButton.textContent = '生成中…'
    try {
      const first = imageFiles[0]
      const savePath = await window.electronAPI.choosePdfSavePath({
        title: '保存生成的 PDF',
        defaultPath: `${first.defaultDestination}/${baseName(first.name)}.pdf`,
      })
      if (!savePath) return
      const output = await window.electronAPI.imagesToPdf({
        sourcePaths: imageFiles.map((item) => item.path),
        outputPath: savePath,
      })
      imageResult.hidden = false
      imageResult.innerHTML = `
        <div class="result-copy">
          <span class="success-icon">✓</span>
          <div>
            <strong>PDF 已生成</strong>
            <span>输出 ${formatBytes(output.outputSize)}</span>
          </div>
        </div>
        <button class="download-button" id="image-pdf-reveal" type="button">查看文件</button>
      `
      document.querySelector<HTMLButtonElement>('#image-pdf-reveal')!
        .addEventListener('click', () => void window.electronAPI.revealPath(output.outputPath))
    } catch (error) {
      imageError.textContent = error instanceof Error ? error.message : '生成 PDF 失败'
    } finally {
      imageButton.disabled = false
      imageButton.textContent = '生成 PDF'
    }
  })

  exportInput.addEventListener('change', async () => {
    exportError.textContent = ''
    exportResult.hidden = true
    exportPdf = null
    try {
      const [file] = await loadPdfInfos(exportInput.files)
      exportPdf = file
      exportInfo.innerHTML = `
        <div class="pdf-selected-card">
          <strong>${escapeHtml(file.name)}</strong>
          <span>${file.pageCount ?? 0} 页 · ${formatBytes(file.size)}</span>
        </div>
      `
    } catch (error) {
      exportInfo.innerHTML = ''
      exportError.textContent = error instanceof Error ? error.message : '读取 PDF 失败'
    }
  })

  exportButton.addEventListener('click', async () => {
    if (!exportPdf) {
      exportError.textContent = '请先选择要导出的 PDF。'
      return
    }
    exportError.textContent = ''
    exportResult.hidden = true
    exportButton.disabled = true
    exportButton.textContent = '导出中…'
    try {
      const folder = await window.electronAPI.choosePdfOutputFolder(exportPdf.defaultDestination)
      if (!folder) return
      const output = await window.electronAPI.pdfToImages({
        sourcePath: exportPdf.path,
        outputDirectory: folder,
        format: exportFormat.value as 'png' | 'jpeg',
        scale: exportFormat.value === 'png' ? 2 : 1.8,
      })
      exportResult.hidden = false
      exportResult.innerHTML = `
        <div class="result-copy">
          <span class="success-icon">✓</span>
          <div>
            <strong>导出完成</strong>
            <span>已生成 ${output.files.length} 张图片</span>
          </div>
        </div>
        <button class="download-button" id="pdf-export-open" type="button">打开文件夹</button>
      `
      document.querySelector<HTMLButtonElement>('#pdf-export-open')!
        .addEventListener('click', () => void window.electronAPI.openPath(output.outputDirectory))
    } catch (error) {
      exportError.textContent = error instanceof Error ? error.message : '导出图片失败'
    } finally {
      exportButton.disabled = false
      exportButton.textContent = '导出页面为图片'
    }
  })

  compressInput.addEventListener('change', async () => {
    compressError.textContent = ''
    compressResult.hidden = true
    compressPdf = null
    try {
      const [file] = await loadPdfInfos(compressInput.files)
      compressPdf = file
      compressInfo.innerHTML = `
        <div class="pdf-selected-card">
          <strong>${escapeHtml(file.name)}</strong>
          <span>${file.pageCount ?? 0} 页 · 原始大小 ${formatBytes(file.size)}</span>
        </div>
      `
    } catch (error) {
      compressInfo.innerHTML = ''
      compressError.textContent = error instanceof Error ? error.message : '读取 PDF 失败'
    }
  })

  compressButton.addEventListener('click', async () => {
    if (!compressPdf) {
      compressError.textContent = '请先选择要压缩的 PDF。'
      return
    }
    compressError.textContent = ''
    compressResult.hidden = true
    compressButton.disabled = true
    compressButton.textContent = '压缩中…'
    try {
      const level = compressQuality.value
      const quality = level === 'small'
        ? 55
        : level === 'balanced'
          ? 70
          : 82
      const scale = level === 'small'
        ? 1.2
        : level === 'balanced'
          ? 1.4
          : 1.7
      const savePath = await window.electronAPI.choosePdfSavePath({
        title: '保存压缩后的 PDF',
        defaultPath: `${compressPdf.defaultDestination}/${baseName(compressPdf.name)}-compressed.pdf`,
      })
      if (!savePath) return
      const output = await window.electronAPI.compressPdf({
        sourcePath: compressPdf.path,
        outputPath: savePath,
        quality,
        scale,
      })
      const delta = Math.round((1 - output.outputSize / compressPdf.size) * 100)
      compressResult.hidden = false
      compressResult.innerHTML = `
        <div class="result-copy">
          <span class="success-icon">✓</span>
          <div>
            <strong>压缩完成</strong>
            <span>${formatBytes(compressPdf.size)} → ${formatBytes(output.outputSize)}${delta > 0 ? `，减少 ${delta}%` : ''}</span>
          </div>
        </div>
        <button class="download-button" id="pdf-compress-reveal" type="button">查看文件</button>
      `
      document.querySelector<HTMLButtonElement>('#pdf-compress-reveal')!
        .addEventListener('click', () => void window.electronAPI.revealPath(output.outputPath))
    } catch (error) {
      compressError.textContent = error instanceof Error ? error.message : '压缩 PDF 失败'
    } finally {
      compressButton.disabled = false
      compressButton.textContent = '压缩 PDF'
    }
  })

  extractInput.addEventListener('change', async () => {
    extractError.textContent = ''
    extractResult.hidden = true
    extractPdf = null
    try {
      const [file] = await loadPdfInfos(extractInput.files)
      extractPdf = file
      extractInfo.innerHTML = `
        <div class="pdf-selected-card">
          <strong>${escapeHtml(file.name)}</strong>
          <span>${file.pageCount ?? 0} 页 · ${formatBytes(file.size)}</span>
        </div>
      `
    } catch (error) {
      extractInfo.innerHTML = ''
      extractError.textContent = error instanceof Error ? error.message : '读取 PDF 失败'
    }
  })

  extractButton.addEventListener('click', async () => {
    if (!extractPdf) {
      extractError.textContent = '请先选择要提取图片的 PDF。'
      return
    }
    extractError.textContent = ''
    extractResult.hidden = true
    extractButton.disabled = true
    extractButton.textContent = '提取中…'
    try {
      const folder = await window.electronAPI.choosePdfOutputFolder(extractPdf.defaultDestination)
      if (!folder) return
      const output = await window.electronAPI.extractPdfImages({
        sourcePath: extractPdf.path,
        outputDirectory: folder,
      })
      extractResult.hidden = false
      extractResult.innerHTML = `
        <div class="result-copy">
          <span class="success-icon">✓</span>
          <div>
            <strong>${output.files.length > 0 ? '提取完成' : '未发现可提取图片'}</strong>
            <span>${output.files.length > 0 ? `已导出 ${output.files.length} 张 PNG 图片` : '该 PDF 可能主要由文字、矢量图或整页渲染内容组成'}</span>
          </div>
        </div>
        <button class="download-button" id="pdf-extract-open" type="button">打开文件夹</button>
      `
      document.querySelector<HTMLButtonElement>('#pdf-extract-open')!
        .addEventListener('click', () => void window.electronAPI.openPath(output.outputDirectory))
    } catch (error) {
      extractError.textContent = error instanceof Error ? error.message : '提取图片失败'
    } finally {
      extractButton.disabled = false
      extractButton.textContent = '提取图片'
    }
  })

  watermarkInput.addEventListener('change', async () => {
    watermarkError.textContent = ''
    watermarkResult.hidden = true
    watermarkPdf = null
    try {
      const [file] = await loadPdfInfos(watermarkInput.files)
      watermarkPdf = file
      watermarkInfo.innerHTML = `
        <div class="pdf-selected-card">
          <strong>${escapeHtml(file.name)}</strong>
          <span>${file.pageCount ?? 0} 页 · ${formatBytes(file.size)}</span>
        </div>
      `
    } catch (error) {
      watermarkInfo.innerHTML = ''
      watermarkError.textContent = error instanceof Error ? error.message : '读取 PDF 失败'
    }
  })

  watermarkButton.addEventListener('click', async () => {
    if (!watermarkPdf) {
      watermarkError.textContent = '请先选择要加水印的 PDF。'
      return
    }
    if (!watermarkText.value.trim()) {
      watermarkError.textContent = '请输入水印文字。'
      return
    }
    watermarkError.textContent = ''
    watermarkResult.hidden = true
    watermarkButton.disabled = true
    watermarkButton.textContent = '处理中…'
    try {
      const savePath = await window.electronAPI.choosePdfSavePath({
        title: '保存带水印的 PDF',
        defaultPath: `${watermarkPdf.defaultDestination}/${baseName(watermarkPdf.name)}-watermarked.pdf`,
      })
      if (!savePath) return
      const output = await window.electronAPI.addPdfWatermark({
        sourcePath: watermarkPdf.path,
        outputPath: savePath,
        text: watermarkText.value,
        opacity: Number(watermarkOpacity.value),
      })
      watermarkResult.hidden = false
      watermarkResult.innerHTML = `
        <div class="result-copy">
          <span class="success-icon">✓</span>
          <div>
            <strong>水印已添加</strong>
            <span>输出 ${formatBytes(output.outputSize)}</span>
          </div>
        </div>
        <button class="download-button" id="pdf-watermark-reveal" type="button">查看文件</button>
      `
      document.querySelector<HTMLButtonElement>('#pdf-watermark-reveal')!
        .addEventListener('click', () => void window.electronAPI.revealPath(output.outputPath))
    } catch (error) {
      watermarkError.textContent = error instanceof Error ? error.message : '添加水印失败'
    } finally {
      watermarkButton.disabled = false
      watermarkButton.textContent = '生成带水印 PDF'
    }
  })
}
