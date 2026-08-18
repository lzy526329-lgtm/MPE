import type { CleanCategory, ScanResult } from '../electron/diskClean'

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`
}

// risk level badge
const riskTag = (id: string): string => {
  const safe = ['user-cache', 'system-log', 'temp', 'prefetch', 'thumbnail', 'trash', 'recycle-bin', 'browser-cache', 'npm-cache', 'pip-cache', 'crash-dumps', 'windows-update']
  const caution = ['ios-backup', 'xcode-derived', 'docker']
  if (safe.includes(id)) return '<span class="dc-tag dc-tag--safe">安全</span>'
  if (caution.includes(id)) return '<span class="dc-tag dc-tag--caution">可选</span>'
  return ''
}

let scanResult: ScanResult | null = null
let selectedIds = new Set<string>()

// ─── render helpers ───────────────────────────────────────────

function renderCategoryRow(cat: CleanCategory): string {
  const checked = selectedIds.has(cat.id) ? 'checked' : ''
  const disabled = !cat.canClean ? 'disabled' : ''
  const dimClass = !cat.canClean ? ' dc-row--dim' : ''
  const sizeLabel = cat.canClean
    ? `<span class="dc-row-size">${formatBytes(cat.size)}</span>`
    : `<span class="dc-row-size dc-row-size--zero">无缓存</span>`

  return `
    <label class="dc-row${dimClass}" data-id="${cat.id}">
      <input class="dc-checkbox" type="checkbox" data-id="${cat.id}" ${checked} ${disabled} />
      <div class="dc-row-body">
        <div class="dc-row-top">
          <span class="dc-row-label">${cat.label}</span>
          ${riskTag(cat.id)}
          ${sizeLabel}
        </div>
        <p class="dc-row-desc">${cat.description}</p>
        ${cat.canClean ? `<p class="dc-row-meta">${cat.fileCount.toLocaleString()} 个文件 · ${cat.paths.map((p) => `<code>${truncatePath(p)}</code>`).join(', ')}</p>` : ''}
      </div>
    </label>
  `
}

function truncatePath(p: string): string {
  const home = p.startsWith('/Users/') || p.startsWith('C:\\Users\\')
  if (p.length <= 55) return p
  const parts = p.split(/[/\\]/)
  if (home && parts.length > 4) {
    return `~/${parts.slice(3).join('/')}`
  }
  return `…${p.slice(-48)}`
}

function renderScanResults(result: ScanResult) {
  const list = document.querySelector<HTMLElement>('#dc-list')!
  const summary = document.querySelector<HTMLElement>('#dc-summary')!
  const cleanBtn = document.querySelector<HTMLButtonElement>('#dc-clean-btn')!

  list.innerHTML = result.categories.map(renderCategoryRow).join('')

  // bind checkbox changes
  list.querySelectorAll<HTMLInputElement>('.dc-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.id!
      if (cb.checked) selectedIds.add(id)
      else selectedIds.delete(id)
      updateSummary()
    })
  })

  updateSummary()

  const cleanable = result.categories.filter((c) => c.canClean)
  const totalCleanable = result.totalSize
  summary.innerHTML = totalCleanable > 0
    ? `发现 <strong>${formatBytes(totalCleanable)}</strong> 可清理空间，共 <strong>${cleanable.length}</strong> 个类别`
    : `未发现明显垃圾文件，磁盘状态良好 ✓`
  cleanBtn.hidden = totalCleanable === 0
}

function updateSummary() {
  const cleanBtn = document.querySelector<HTMLButtonElement>('#dc-clean-btn')!
  const selSummary = document.querySelector<HTMLElement>('#dc-sel-summary')!

  if (!scanResult) return
  const selected = scanResult.categories.filter((c) => selectedIds.has(c.id))
  const totalSelected = selected.reduce((s, c) => s + c.size, 0)

  if (selectedIds.size === 0) {
    selSummary.textContent = '请勾选要清理的类别'
    cleanBtn.disabled = true
  } else {
    selSummary.textContent = `已选 ${selectedIds.size} 项，预计释放 ${formatBytes(totalSelected)}`
    cleanBtn.disabled = false
  }
}

function setLoadingState(loading: boolean) {
  const scanBtn = document.querySelector<HTMLButtonElement>('#dc-scan-btn')!
  const cleanBtn = document.querySelector<HTMLButtonElement>('#dc-clean-btn')!
  const spinner = document.querySelector<HTMLElement>('#dc-spinner')!
  scanBtn.disabled = loading
  cleanBtn.disabled = loading
  spinner.hidden = !loading
}

// ─── page mount ───────────────────────────────────────────────

export function mountDiskCleanPage() {
  const scanBtn = document.querySelector<HTMLButtonElement>('#dc-scan-btn')!
  const cleanBtn = document.querySelector<HTMLButtonElement>('#dc-clean-btn')!
  const selectAllBtn = document.querySelector<HTMLButtonElement>('#dc-select-all')!
  const deselectAllBtn = document.querySelector<HTMLButtonElement>('#dc-deselect-all')!
  const resultBanner = document.querySelector<HTMLElement>('#dc-result-banner')!
  const errorMsg = document.querySelector<HTMLElement>('#dc-error')!

  const doScan = async () => {
    setLoadingState(true)
    resultBanner.hidden = true
    errorMsg.textContent = ''
    selectedIds.clear()
    const list = document.querySelector<HTMLElement>('#dc-list')!
    list.innerHTML = ''
    try {
      scanResult = await window.electronAPI.scanDisk()
      // default-select all safe cleanable items
      const safeIds = ['user-cache', 'system-log', 'temp', 'prefetch', 'thumbnail',
        'trash', 'recycle-bin', 'browser-cache', 'npm-cache', 'pip-cache',
        'crash-dumps', 'windows-update']
      scanResult.categories.forEach((c) => {
        if (c.canClean && safeIds.includes(c.id)) selectedIds.add(c.id)
      })
      renderScanResults(scanResult)
    } catch {
      errorMsg.textContent = '扫描失败，请重试。'
    } finally {
      setLoadingState(false)
    }
  }

  scanBtn.addEventListener('click', () => void doScan())

  selectAllBtn.addEventListener('click', () => {
    if (!scanResult) return
    scanResult.categories.forEach((c) => { if (c.canClean) selectedIds.add(c.id) })
    document.querySelectorAll<HTMLInputElement>('.dc-checkbox:not(:disabled)').forEach((cb) => { cb.checked = true })
    updateSummary()
  })

  deselectAllBtn.addEventListener('click', () => {
    selectedIds.clear()
    document.querySelectorAll<HTMLInputElement>('.dc-checkbox').forEach((cb) => { cb.checked = false })
    updateSummary()
  })

  cleanBtn.addEventListener('click', async () => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    setLoadingState(true)
    cleanBtn.textContent = '清理中…'
    resultBanner.hidden = true
    errorMsg.textContent = ''

    try {
      const result = await window.electronAPI.cleanDisk(ids)
      const freed = result.totalFreed
      const deletedCount = result.cleaned.reduce((s, c) => s + c.deletedCount, 0)

      resultBanner.hidden = false
      resultBanner.innerHTML = `
        <span class="success-icon">✓</span>
        <div>
          <strong>清理完成，释放了 ${formatBytes(freed)}</strong>
          <span>共删除 ${deletedCount.toLocaleString()} 个文件${result.errors.length > 0 ? `，${result.errors.length} 项因权限跳过` : ''}</span>
        </div>
      `

      // re-scan to refresh sizes
      await doScan()
    } catch {
      errorMsg.textContent = '清理过程中出现错误，部分文件可能未被删除。'
    } finally {
      setLoadingState(false)
      cleanBtn.textContent = '开始清理'
    }
  })

  // auto-scan when navigating to this page
  document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      if (item.dataset.page === 'disk-clean-page' && !scanResult) void doScan()
    })
  })
}
