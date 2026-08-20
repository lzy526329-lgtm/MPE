import type { SystemInfo, DiskPartition } from '../electron/systemInfo'
import { onPageChange } from './appNavigation'

const formatBytes = (bytes: number, decimals = 1) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`
}

const formatUptime = (seconds: number) => {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d} 天`)
  if (h > 0) parts.push(`${h} 小时`)
  parts.push(`${m} 分钟`)
  return parts.join(' ')
}

const platformLabel = (platform: string) => {
  if (platform === 'darwin') return 'macOS'
  if (platform === 'win32') return 'Windows'
  if (platform === 'linux') return 'Linux'
  return platform
}

const archLabel = (arch: string) => {
  if (arch === 'x64') return 'x86-64'
  if (arch === 'arm64') return 'ARM64 (Apple Silicon)'
  return arch
}

const renderDiskBar = (partition: DiskPartition) => {
  const usedPct = partition.total > 0 ? Math.round((partition.used / partition.total) * 100) : 0
  const colorClass = usedPct > 85 ? 'disk-bar-fill--danger' : usedPct > 65 ? 'disk-bar-fill--warn' : ''
  return `
    <div class="sysinfo-disk-item">
      <div class="sysinfo-disk-header">
        <span class="sysinfo-disk-mount">${partition.mount}</span>
        <span class="sysinfo-disk-stats">
          ${formatBytes(partition.used)} / ${formatBytes(partition.total)}
          <em>${usedPct}%</em>
        </span>
      </div>
      <div class="disk-bar">
        <div class="disk-bar-fill ${colorClass}" style="width: ${usedPct}%"></div>
      </div>
    </div>
  `
}

const renderInfo = (info: SystemInfo) => {
  const usedMem = info.totalMem - info.freeMem
  const memPct = Math.round((usedMem / info.totalMem) * 100)
  const memColorClass = memPct > 85 ? 'disk-bar-fill--danger' : memPct > 65 ? 'disk-bar-fill--warn' : ''

  return `
    <div class="sysinfo-grid">
      <div class="sysinfo-card">
        <div class="sysinfo-card-title">
          <span class="sysinfo-icon">💻</span>系统概览
        </div>
        <dl class="sysinfo-dl">
          <div><dt>操作系统</dt><dd>${info.osVersion}</dd></div>
          <div><dt>平台</dt><dd>${platformLabel(info.platform)}</dd></div>
          <div><dt>架构</dt><dd>${archLabel(info.arch)}</dd></div>
          <div><dt>主机名</dt><dd>${info.hostname}</dd></div>
          <div><dt>运行时长</dt><dd>${formatUptime(info.uptime)}</dd></div>
        </dl>
      </div>

      <div class="sysinfo-card">
        <div class="sysinfo-card-title">
          <span class="sysinfo-icon">⚙️</span>处理器
        </div>
        <dl class="sysinfo-dl">
          <div><dt>型号</dt><dd class="sysinfo-long">${info.cpuModel}</dd></div>
          <div><dt>核心数</dt><dd>${info.cpuCores} 个逻辑核心</dd></div>
        </dl>
      </div>

      <div class="sysinfo-card">
        <div class="sysinfo-card-title">
          <span class="sysinfo-icon">🎮</span>图形处理器
        </div>
        <dl class="sysinfo-dl">
          <div><dt>型号</dt><dd class="sysinfo-long">${info.gpuModel}</dd></div>
        </dl>
      </div>

      <div class="sysinfo-card sysinfo-card--wide">
        <div class="sysinfo-card-title">
          <span class="sysinfo-icon">🧠</span>内存
        </div>
        <div class="sysinfo-mem-summary">
          <span>已用 ${formatBytes(usedMem)} / 共 ${formatBytes(info.totalMem)}</span>
          <em>${memPct}%</em>
        </div>
        <div class="disk-bar sysinfo-mem-bar">
          <div class="disk-bar-fill ${memColorClass}" style="width: ${memPct}%"></div>
        </div>
        <dl class="sysinfo-dl sysinfo-mem-dl">
          <div><dt>总内存</dt><dd>${formatBytes(info.totalMem)}</dd></div>
          <div><dt>已使用</dt><dd>${formatBytes(usedMem)}</dd></div>
          <div><dt>可用</dt><dd>${formatBytes(info.freeMem)}</dd></div>
        </dl>
      </div>

      <div class="sysinfo-card sysinfo-card--wide">
        <div class="sysinfo-card-title">
          <span class="sysinfo-icon">💾</span>存储
        </div>
        ${info.diskInfo.length > 0
          ? info.diskInfo.map(renderDiskBar).join('')
          : '<p class="sysinfo-empty">暂无磁盘信息</p>'
        }
      </div>
    </div>
  `
}

export function mountSystemInfoPage() {
  const refreshButton = document.querySelector<HTMLButtonElement>('#sysinfo-refresh')
  const container = document.querySelector<HTMLElement>('#sysinfo-container')
  const loading = document.querySelector<HTMLElement>('#sysinfo-loading')
  if (!refreshButton || !container || !loading) return

  const load = async () => {
    loading.hidden = false
    container.innerHTML = ''
    refreshButton.disabled = true
    try {
      const info = await window.electronAPI.getSystemInfo()
      container.innerHTML = renderInfo(info)
    } catch {
      container.innerHTML = '<p class="error-message" role="alert">获取系统信息失败，请重试。</p>'
    } finally {
      loading.hidden = true
      refreshButton.disabled = false
    }
  }

  refreshButton.addEventListener('click', () => void load())
  onPageChange((pageId) => {
    if (pageId === 'sysinfo-page') void load()
  })
}
