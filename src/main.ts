import './style.css'
import type { CompressRequest } from '../electron/compress'
import type { ArchiveInfo, CompressionSource } from '../electron/archive'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar">
      <div class="logo">
        <span class="logo-mark">G</span>
        <span>gognju</span>
      </div>
      <nav>
        <button class="nav-item active" data-page="image-page" type="button">
          <span>▧</span>
          图片压缩
        </button>
        <button class="nav-item" data-page="compression-page" type="button">
          <span>◇</span>
          文件压缩
        </button>
        <button class="nav-item" data-page="archive-page" type="button">
          <span>▣</span>
          文件解压
        </button>
      </nav>
      <p class="local-tip">所有文件仅在本地处理</p>
    </aside>

    <main class="workspace">
      <section class="tool-page" id="image-page">
        <header>
          <div>
            <p class="eyebrow">图像工具</p>
            <h1>图片压缩</h1>
            <p class="subtitle">减小图片体积，同时尽可能保持清晰度。</p>
          </div>
        </header>
        <div class="panel">
        <label class="drop-zone" id="drop-zone" for="file-input">
          <input id="file-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden />
          <span class="upload-icon">↥</span>
          <strong>拖拽图片到这里，或点击选择</strong>
          <span>支持 JPG、PNG、WebP，单张处理</span>
        </label>

        <div class="editor" id="editor" hidden>
          <div class="preview-card">
            <div class="preview-heading">
              <span>图片预览</span>
              <button class="text-button" id="replace-button" type="button">重新选择</button>
            </div>
            <div class="preview-frame">
              <img id="preview" alt="待压缩图片预览" />
            </div>
            <div class="file-summary">
              <div>
                <strong id="file-name"></strong>
                <span id="file-info"></span>
              </div>
              <span class="size-pill" id="original-size"></span>
            </div>
          </div>

          <div class="settings-card">
            <h2>压缩设置</h2>
            <label class="field">
              <span>输出格式</span>
              <select id="format">
                <option value="auto">保持原格式（推荐）</option>
                <option value="webp">WebP（体积更小）</option>
                <option value="jpeg">JPEG（通用兼容）</option>
                <option value="png">PNG（保留透明）</option>
                <option value="avif">AVIF（最小，新格式）</option>
              </select>
            </label>
            <p class="field-hint">
              PNG 采用调色板量化 + 无损优化，JPEG 采用 mozjpeg 编码，与 TinyPNG 同类算法；
              保持原始尺寸，自动选择压缩强度。
            </p>
            <button class="primary-button" id="compress-button" type="button">开始压缩</button>
          </div>
        </div>

        <div class="result" id="result" hidden>
          <div class="result-copy">
            <span class="success-icon">✓</span>
            <div>
              <strong>压缩完成</strong>
              <span id="result-detail"></span>
            </div>
          </div>
          <button class="download-button" id="download-button" type="button">下载图片</button>
        </div>
        <p class="error-message" id="error-message" role="alert"></p>
        </div>
      </section>

      <section class="tool-page" id="archive-page" hidden>
        <header>
          <div>
            <p class="eyebrow">文件工具</p>
            <h1>文件解压</h1>
            <p class="subtitle">快速解压常见压缩包，文件不会上传到网络。</p>
          </div>
        </header>

        <div class="panel">
          <label class="drop-zone archive-drop-zone" id="archive-drop-zone" for="archive-input">
            <input
              id="archive-input"
              type="file"
              accept=".zip,.rar,.7z,.tar,.gz,.tgz,.bz2,.tbz2,.xz,.txz,.cab"
              hidden
            />
            <span class="upload-icon archive-icon">⇲</span>
            <strong>拖拽压缩包到这里，或点击选择</strong>
            <span>支持 ZIP、RAR、7z、tar、gz、bz2、xz、cab</span>
          </label>

          <div class="archive-editor" id="archive-editor" hidden>
            <div class="archive-file-card">
              <span class="archive-file-icon">ZIP</span>
              <div class="archive-file-copy">
                <strong id="archive-name"></strong>
                <span id="archive-meta"></span>
              </div>
              <button class="text-button" id="archive-replace-button" type="button">重新选择</button>
            </div>

            <div class="archive-settings-card">
              <h2>解压设置</h2>
              <label class="field">
                <span>保存位置</span>
                <button class="path-selector" id="destination-button" type="button">
                  <span id="destination-path"></span>
                  <span>选择…</span>
                </button>
              </label>
              <label class="field">
                <span>压缩包密码 <em>（可选）</em></span>
                <input
                  class="password-input"
                  id="archive-password"
                  type="password"
                  placeholder="加密压缩包请输入密码"
                  autocomplete="off"
                />
              </label>
              <p class="field-hint">内容会解压到同名的新文件夹；若已存在，将自动添加序号。</p>
              <button class="primary-button" id="extract-button" type="button">开始解压</button>
            </div>
          </div>

          <div class="result" id="archive-result" hidden>
            <div class="result-copy">
              <span class="success-icon">✓</span>
              <div>
                <strong>解压完成</strong>
                <span id="archive-result-detail"></span>
              </div>
            </div>
            <button class="download-button" id="open-folder-button" type="button">打开文件夹</button>
          </div>
          <p class="error-message" id="archive-error" role="alert"></p>
        </div>
      </section>

      <section class="tool-page" id="compression-page" hidden>
        <header>
          <div>
            <p class="eyebrow">文件工具</p>
            <h1>文件压缩</h1>
            <p class="subtitle">将多个文件或整个文件夹压缩为一个归档文件。</p>
          </div>
        </header>

        <div class="panel">
          <div class="drop-zone archive-drop-zone" id="compression-drop-zone">
            <span class="upload-icon archive-icon">⇱</span>
            <strong>拖拽文件或文件夹到这里</strong>
            <span>支持压缩为 ZIP、7z、tar.gz</span>
            <div class="drop-zone-actions">
              <button class="secondary-button" id="choose-files-button" type="button">选择文件</button>
              <button class="secondary-button" id="choose-folder-button" type="button">选择文件夹</button>
            </div>
          </div>

          <div class="compression-editor" id="compression-editor" hidden>
            <div class="compression-source-card">
              <div class="preview-heading">
                <span>待压缩内容</span>
                <button class="text-button" id="compression-replace-button" type="button">重新选择</button>
              </div>
              <div class="source-list" id="compression-source-list"></div>
              <div class="source-summary" id="compression-source-summary"></div>
            </div>

            <div class="archive-settings-card">
              <h2>压缩设置</h2>
              <label class="field">
                <span>压缩格式</span>
                <select id="archive-format">
                  <option value="zip">ZIP（通用兼容）</option>
                  <option value="7z">7z（压缩率更高）</option>
                  <option value="tar.gz">tar.gz（开发常用）</option>
                </select>
              </label>
              <label class="field">
                <span>文件名称</span>
                <input class="password-input" id="compression-name" type="text" />
              </label>
              <label class="field">
                <span>保存位置</span>
                <button class="path-selector" id="compression-destination-button" type="button">
                  <span id="compression-destination-path"></span>
                  <span>选择…</span>
                </button>
              </label>
              <label class="field" id="compression-password-field">
                <span>压缩密码 <em>（可选）</em></span>
                <input
                  class="password-input"
                  id="compression-password"
                  type="password"
                  placeholder="设置打开压缩包所需的密码"
                  autocomplete="new-password"
                />
              </label>
              <p class="field-hint" id="compression-format-hint">
                ZIP 兼容性最好；设置密码后使用 AES-256 加密。
              </p>
              <button class="primary-button" id="create-archive-button" type="button">开始压缩</button>
            </div>
          </div>

          <div class="result" id="compression-result" hidden>
            <div class="result-copy">
              <span class="success-icon">✓</span>
              <div>
                <strong>压缩完成</strong>
                <span id="compression-result-detail"></span>
              </div>
            </div>
            <button class="download-button" id="show-archive-button" type="button">查看文件</button>
          </div>
          <p class="error-message" id="compression-error" role="alert"></p>
        </div>
      </section>
    </main>
  </div>
`

const fileInput = document.querySelector<HTMLInputElement>('#file-input')!
const dropZone = document.querySelector<HTMLElement>('#drop-zone')!
const editor = document.querySelector<HTMLElement>('#editor')!
const preview = document.querySelector<HTMLImageElement>('#preview')!
const fileName = document.querySelector<HTMLElement>('#file-name')!
const fileInfo = document.querySelector<HTMLElement>('#file-info')!
const originalSize = document.querySelector<HTMLElement>('#original-size')!
const format = document.querySelector<HTMLSelectElement>('#format')!
const compressButton = document.querySelector<HTMLButtonElement>('#compress-button')!
const result = document.querySelector<HTMLElement>('#result')!
const resultDetail = document.querySelector<HTMLElement>('#result-detail')!
const downloadButton = document.querySelector<HTMLButtonElement>('#download-button')!
const replaceButton = document.querySelector<HTMLButtonElement>('#replace-button')!
const errorMessage = document.querySelector<HTMLElement>('#error-message')!

let sourceFile: File | null = null
let sourceUrl: string | null = null
let compressedUrl: string | null = null
let compressedExtension = 'webp'

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const resetResult = () => {
  result.hidden = true
  errorMessage.textContent = ''
  if (compressedUrl) {
    if (sourceUrl) preview.src = sourceUrl
    URL.revokeObjectURL(compressedUrl)
    compressedUrl = null
  }
}

const readImageDimensions = (url: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = reject
    image.src = url
  })

async function selectFile(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
    errorMessage.textContent = '请选择 JPG、PNG、WebP 或 AVIF 格式的图片。'
    return
  }

  resetResult()
  if (sourceUrl) URL.revokeObjectURL(sourceUrl)
  sourceFile = file
  sourceUrl = URL.createObjectURL(file)

  try {
    const dimensions = await readImageDimensions(sourceUrl)
    preview.src = sourceUrl
    fileName.textContent = file.name
    fileInfo.textContent = `${dimensions.width} × ${dimensions.height} px`
    originalSize.textContent = formatBytes(file.size)
    dropZone.hidden = true
    editor.hidden = false
  } catch {
    errorMessage.textContent = '无法读取这张图片，请尝试其他文件。'
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) void selectFile(file)
})

replaceButton.addEventListener('click', () => fileInput.click())
format.addEventListener('change', resetResult)

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

compressButton.addEventListener('click', async () => {
  if (!sourceFile || !sourceUrl) return

  compressButton.disabled = true
  compressButton.textContent = '正在压缩…'
  resetResult()

  try {
    const buffer = await sourceFile.arrayBuffer()
    const output = await window.electronAPI.compressImage({
      data: new Uint8Array(buffer),
      format: format.value as CompressRequest['format'],
    })

    compressedExtension = output.extension
    const bytes = new Uint8Array(output.data)
    compressedUrl = URL.createObjectURL(
      new Blob([bytes.buffer as ArrayBuffer], { type: output.format }),
    )
    preview.src = compressedUrl

    const percent = Math.round(((sourceFile.size - output.size) / sourceFile.size) * 100)
    resultDetail.textContent = output.keptOriginal
      ? `原图已足够小（${formatBytes(sourceFile.size)}），已保留原图；可尝试输出为 WebP`
      : `体积由 ${formatBytes(sourceFile.size)} 减至 ${formatBytes(output.size)}，节省 ${percent}%（${output.strategy}）`
    result.hidden = false
  } catch {
    errorMessage.textContent = '压缩失败，请更换图片或调整设置后重试。'
  } finally {
    compressButton.disabled = false
    compressButton.textContent = '开始压缩'
  }
})

downloadButton.addEventListener('click', () => {
  if (!compressedUrl || !sourceFile) return
  const baseName = sourceFile.name.replace(/\.[^.]+$/, '')
  const link = document.createElement('a')
  link.href = compressedUrl
  link.download = `${baseName}-compressed.${compressedExtension}`
  link.click()
})

const navItems = document.querySelectorAll<HTMLButtonElement>('.nav-item')
const toolPages = document.querySelectorAll<HTMLElement>('.tool-page')
navItems.forEach((item) => {
  item.addEventListener('click', () => {
    navItems.forEach((navItem) => navItem.classList.toggle('active', navItem === item))
    toolPages.forEach((page) => {
      page.hidden = page.id !== item.dataset.page
    })
  })
})

const compressionDropZone = document.querySelector<HTMLElement>('#compression-drop-zone')!
const compressionEditor = document.querySelector<HTMLElement>('#compression-editor')!
const chooseFilesButton = document.querySelector<HTMLButtonElement>('#choose-files-button')!
const chooseFolderButton = document.querySelector<HTMLButtonElement>('#choose-folder-button')!
const compressionReplaceButton =
  document.querySelector<HTMLButtonElement>('#compression-replace-button')!
const compressionSourceList = document.querySelector<HTMLElement>('#compression-source-list')!
const compressionSourceSummary =
  document.querySelector<HTMLElement>('#compression-source-summary')!
const archiveFormat = document.querySelector<HTMLSelectElement>('#archive-format')!
const compressionName = document.querySelector<HTMLInputElement>('#compression-name')!
const compressionDestinationButton =
  document.querySelector<HTMLButtonElement>('#compression-destination-button')!
const compressionDestinationPath =
  document.querySelector<HTMLElement>('#compression-destination-path')!
const compressionPasswordField =
  document.querySelector<HTMLElement>('#compression-password-field')!
const compressionPassword =
  document.querySelector<HTMLInputElement>('#compression-password')!
const compressionFormatHint =
  document.querySelector<HTMLElement>('#compression-format-hint')!
const createArchiveButton =
  document.querySelector<HTMLButtonElement>('#create-archive-button')!
const compressionResult = document.querySelector<HTMLElement>('#compression-result')!
const compressionResultDetail =
  document.querySelector<HTMLElement>('#compression-result-detail')!
const showArchiveButton = document.querySelector<HTMLButtonElement>('#show-archive-button')!
const compressionError = document.querySelector<HTMLElement>('#compression-error')!

let compressionSources: CompressionSource[] = []
let compressionDestination = ''
let createdArchivePath = ''

const resetCompressionResult = () => {
  compressionResult.hidden = true
  compressionError.textContent = ''
  createdArchivePath = ''
}

const renderCompressionSources = (sources: CompressionSource[]) => {
  if (sources.length === 0) return
  const firstDirectory = sources[0].defaultDestination
  if (sources.some((source) => source.defaultDestination !== firstDirectory)) {
    compressionError.textContent = '一次压缩的文件需要位于同一目录。'
    return
  }

  compressionSources = sources
  compressionDestination = firstDirectory
  compressionDestinationPath.textContent = firstDirectory
  compressionName.value = sources.length === 1
    ? sources[0].isDirectory
      ? sources[0].name
      : sources[0].name.replace(/\.[^.]+$/, '') || sources[0].name
    : '压缩文件'
  compressionSourceList.innerHTML = sources.map((source) => `
    <div class="source-item">
      <span class="source-item-icon">${source.isDirectory ? '▣' : '▤'}</span>
      <div>
        <strong>${escapeHtml(source.name)}</strong>
        <span>${source.isDirectory ? '文件夹' : formatBytes(source.size)}</span>
      </div>
    </div>
  `).join('')
  const totalSize = sources.reduce((total, source) => total + source.size, 0)
  compressionSourceSummary.textContent =
    `共 ${sources.length} 项 · ${formatBytes(totalSize)}`
  compressionDropZone.hidden = true
  compressionEditor.hidden = false
  resetCompressionResult()
}

function escapeHtml(value: string) {
  const element = document.createElement('span')
  element.textContent = value
  return element.innerHTML
}

const inspectCompressionFiles = async (files: File[]) => {
  try {
    const sources = await Promise.all(files.map((file) => {
      const filePath = window.electronAPI.getPathForFile(file)
      if (!filePath) throw new Error('无法读取文件路径')
      return window.electronAPI.inspectCompressionSource(filePath)
    }))
    renderCompressionSources(sources)
  } catch {
    compressionError.textContent = '无法读取所选文件，请重新选择。'
  }
}

// 走主进程的原生对话框，因为 <input type="file"> 无法选中文件夹。
const pickSources = async (mode: 'files' | 'directory') => {
  try {
    const sources = await window.electronAPI.chooseCompressionSources(mode)
    if (sources.length > 0) renderCompressionSources(sources)
  } catch {
    compressionError.textContent = '无法读取所选内容，请重新选择。'
  }
}

chooseFilesButton.addEventListener('click', () => void pickSources('files'))
chooseFolderButton.addEventListener('click', () => void pickSources('directory'))

compressionReplaceButton.addEventListener('click', () => {
  compressionSources = []
  compressionEditor.hidden = true
  compressionDropZone.hidden = false
  resetCompressionResult()
})

for (const eventName of ['dragenter', 'dragover']) {
  compressionDropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    compressionDropZone.classList.add('dragging')
  })
}

for (const eventName of ['dragleave', 'drop']) {
  compressionDropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    compressionDropZone.classList.remove('dragging')
  })
}

compressionDropZone.addEventListener('drop', (event) => {
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length > 0) void inspectCompressionFiles(files)
})

compressionDestinationButton.addEventListener('click', async () => {
  const selected = await window.electronAPI.chooseDestination(compressionDestination)
  if (selected) {
    compressionDestination = selected
    compressionDestinationPath.textContent = selected
    resetCompressionResult()
  }
})

archiveFormat.addEventListener('change', () => {
  const isTarGz = archiveFormat.value === 'tar.gz'
  compressionPasswordField.hidden = isTarGz
  if (isTarGz) compressionPassword.value = ''
  compressionFormatHint.textContent = isTarGz
    ? 'tar.gz 适合开发与类 Unix 环境，不支持密码加密。'
    : archiveFormat.value === '7z'
      ? '7z 使用 LZMA2 算法，通常压缩率更高。'
      : 'ZIP 兼容性最好；设置密码后使用 AES-256 加密。'
  resetCompressionResult()
})

createArchiveButton.addEventListener('click', async () => {
  if (compressionSources.length === 0) return
  if (!compressionName.value.trim()) {
    compressionError.textContent = '请输入压缩文件名称。'
    return
  }

  createArchiveButton.disabled = true
  createArchiveButton.textContent = '正在压缩…'
  resetCompressionResult()

  try {
    const output = await window.electronAPI.compressArchive({
      sources: compressionSources.map((source) => source.path),
      destinationRoot: compressionDestination,
      outputName: compressionName.value,
      format: archiveFormat.value as 'zip' | '7z' | 'tar.gz',
      password: compressionPassword.value || undefined,
    })
    createdArchivePath = output.outputPath
    compressionResultDetail.textContent =
      `${output.sourceCount} 项，${formatBytes(output.inputSize)} → ${formatBytes(output.outputSize)}`
    compressionResult.hidden = false
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    compressionError.textContent = message.includes('同一目录')
      ? '一次压缩的文件需要位于同一目录。'
      : '压缩失败，请检查文件权限或更换保存位置。'
  } finally {
    createArchiveButton.disabled = false
    createArchiveButton.textContent = '开始压缩'
  }
})

showArchiveButton.addEventListener('click', () => {
  if (createdArchivePath) void window.electronAPI.revealPath(createdArchivePath)
})

const archiveInput = document.querySelector<HTMLInputElement>('#archive-input')!
const archiveDropZone = document.querySelector<HTMLElement>('#archive-drop-zone')!
const archiveEditor = document.querySelector<HTMLElement>('#archive-editor')!
const archiveName = document.querySelector<HTMLElement>('#archive-name')!
const archiveMeta = document.querySelector<HTMLElement>('#archive-meta')!
const archiveFileIcon = document.querySelector<HTMLElement>('.archive-file-icon')!
const archiveReplaceButton =
  document.querySelector<HTMLButtonElement>('#archive-replace-button')!
const destinationButton = document.querySelector<HTMLButtonElement>('#destination-button')!
const destinationPath = document.querySelector<HTMLElement>('#destination-path')!
const archivePassword = document.querySelector<HTMLInputElement>('#archive-password')!
const extractButton = document.querySelector<HTMLButtonElement>('#extract-button')!
const archiveResult = document.querySelector<HTMLElement>('#archive-result')!
const archiveResultDetail = document.querySelector<HTMLElement>('#archive-result-detail')!
const openFolderButton = document.querySelector<HTMLButtonElement>('#open-folder-button')!
const archiveError = document.querySelector<HTMLElement>('#archive-error')!

let selectedArchive: ArchiveInfo | null = null
let selectedDestination = ''
let extractedPath = ''

const resetArchiveResult = () => {
  archiveResult.hidden = true
  archiveError.textContent = ''
  extractedPath = ''
}

const displayArchive = (archive: ArchiveInfo) => {
  selectedArchive = archive
  selectedDestination = archive.defaultDestination
  archiveName.textContent = archive.name
  archiveMeta.textContent = `${archive.format} · ${formatBytes(archive.size)}`
  archiveFileIcon.textContent = archive.format.slice(0, 4)
  destinationPath.textContent = selectedDestination
  archiveDropZone.hidden = true
  archiveEditor.hidden = false
  archivePassword.value = ''
  resetArchiveResult()
}

const inspectArchiveFile = async (file: File) => {
  try {
    const filePath = window.electronAPI.getPathForFile(file)
    if (!filePath) throw new Error('无法读取文件路径')
    displayArchive(await window.electronAPI.inspectArchive(filePath))
  } catch (error) {
    archiveError.textContent = error instanceof Error && error.message.includes('不支持')
      ? '不支持该压缩包格式。'
      : '无法读取该压缩包，请重新选择。'
  }
}

archiveInput.addEventListener('change', () => {
  const file = archiveInput.files?.[0]
  if (file) void inspectArchiveFile(file)
})

archiveReplaceButton.addEventListener('click', () => archiveInput.click())

for (const eventName of ['dragenter', 'dragover']) {
  archiveDropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    archiveDropZone.classList.add('dragging')
  })
}

for (const eventName of ['dragleave', 'drop']) {
  archiveDropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    archiveDropZone.classList.remove('dragging')
  })
}

archiveDropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files[0]
  if (file) void inspectArchiveFile(file)
})

destinationButton.addEventListener('click', async () => {
  const selected = await window.electronAPI.chooseDestination(selectedDestination)
  if (selected) {
    selectedDestination = selected
    destinationPath.textContent = selected
    resetArchiveResult()
  }
})

extractButton.addEventListener('click', async () => {
  if (!selectedArchive) return

  extractButton.disabled = true
  extractButton.textContent = '正在解压…'
  resetArchiveResult()

  try {
    const output = await window.electronAPI.extractArchive({
      archivePath: selectedArchive.path,
      destinationRoot: selectedDestination,
      password: archivePassword.value || undefined,
    })
    extractedPath = output.outputPath
    archiveResultDetail.textContent =
      `已解压 ${output.fileCount} 个文件到 ${output.outputPath}`
    archiveResult.hidden = false
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('密码')) {
      archiveError.textContent = '密码错误、缺少密码，或压缩包已损坏。'
    } else if (message.includes('不安全')) {
      archiveError.textContent = '压缩包包含不安全路径，已阻止解压。'
    } else {
      archiveError.textContent = '解压失败，压缩包可能已损坏或格式不受支持。'
    }
  } finally {
    extractButton.disabled = false
    extractButton.textContent = '开始解压'
  }
})

openFolderButton.addEventListener('click', () => {
  if (extractedPath) void window.electronAPI.openPath(extractedPath)
})

window.addEventListener('beforeunload', () => {
  if (sourceUrl) URL.revokeObjectURL(sourceUrl)
  if (compressedUrl) URL.revokeObjectURL(compressedUrl)
})
