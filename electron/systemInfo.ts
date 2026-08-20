import { execSync } from 'node:child_process'
import os from 'node:os'

export interface DiskPartition {
  mount: string
  total: number
  used: number
  free: number
}

export interface SystemInfo {
  platform: string
  osVersion: string
  hostname: string
  arch: string
  cpuModel: string
  cpuCores: number
  totalMem: number
  freeMem: number
  uptime: number
  gpuModel: string
  diskInfo: DiskPartition[]
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d} 天`)
  if (h > 0) parts.push(`${h} 小时`)
  parts.push(`${m} 分钟`)
  return parts.join(' ')
}

export function getSystemInfo(): SystemInfo {
  const platform = process.platform
  const cpus = os.cpus()
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const cpuModel = cpus[0]?.model?.trim() ?? '未知'
  const cpuCores = cpus.length
  const diskInfo: DiskPartition[] = []

  try {
    if (platform === 'darwin' || platform === 'linux') {
      const raw = execSync('df -k', { encoding: 'utf8' })
      for (const line of raw.split('\n').slice(1)) {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 6) continue
        const mount = parts[parts.length - 1]
        if (!mount.startsWith('/')) continue
        if (mount.startsWith('/System/Volumes/') && mount !== '/System/Volumes/Data') continue
        if (platform === 'darwin' && mount !== '/' && mount !== '/System/Volumes/Data') continue
        const total = parseInt(parts[1]) * 1024
        const used = parseInt(parts[2]) * 1024
        const free = parseInt(parts[3]) * 1024
        if (!Number.isNaN(total) && total > 0) diskInfo.push({ mount, total, used, free })
      }
    } else if (platform === 'win32') {
      const raw = execSync('wmic logicaldisk get size,freespace,caption /format:csv', {
        encoding: 'utf8',
      })
      for (const line of raw.split('\n').slice(2)) {
        const parts = line.trim().split(',')
        if (parts.length < 4) continue
        const mount = parts[1]
        const free = parseInt(parts[2])
        const total = parseInt(parts[3])
        if (!Number.isNaN(total) && total > 0) {
          diskInfo.push({ mount, total, used: total - free, free })
        }
      }
    }
  } catch {
    /* ignore disk errors */
  }

  let gpuModel = '未知'
  try {
    if (platform === 'darwin') {
      const raw = execSync('system_profiler SPDisplaysDataType 2>/dev/null', { encoding: 'utf8' })
      const match = raw.match(/Chipset Model:\s*(.+)/i)
      if (match) gpuModel = match[1].trim()
    } else if (platform === 'win32') {
      const raw = execSync('wmic path win32_VideoController get name /format:csv', {
        encoding: 'utf8',
      })
      const lines = raw.split('\n').slice(2).filter(Boolean)
      const parts = lines[0]?.split(',')
      if (parts?.[1]) gpuModel = parts[1].trim()
    } else {
      const raw = execSync('lspci | grep -i vga', { encoding: 'utf8' })
      gpuModel = raw.split('\n')[0]?.replace(/.*:\s*/, '').trim() ?? '未知'
    }
  } catch {
    /* ignore gpu errors */
  }

  let osVersion = `${os.type()} ${os.release()}`
  try {
    if (platform === 'darwin') {
      const raw = execSync('sw_vers', { encoding: 'utf8' })
      const name = raw.match(/ProductName:\s*(.+)/)?.[1]?.trim() ?? 'macOS'
      const ver = raw.match(/ProductVersion:\s*(.+)/)?.[1]?.trim() ?? ''
      osVersion = `${name} ${ver}`
    } else if (platform === 'win32') {
      const raw = execSync('ver', { encoding: 'utf8', shell: 'cmd.exe' })
      osVersion = raw.trim()
    }
  } catch {
    /* ignore */
  }

  return {
    platform,
    osVersion,
    hostname: os.hostname(),
    arch: os.arch(),
    cpuModel,
    cpuCores,
    totalMem,
    freeMem,
    uptime: os.uptime(),
    gpuModel,
    diskInfo,
  }
}

/** 给 AI 看的自然语言摘要，避免塞一整坨原始 JSON */
export function formatSystemInfoForAi(info: SystemInfo) {
  const usedMem = info.totalMem - info.freeMem
  const memPct = info.totalMem > 0 ? Math.round((usedMem / info.totalMem) * 100) : 0
  const platformLabel =
    info.platform === 'darwin' ? 'macOS' : info.platform === 'win32' ? 'Windows' : info.platform
  const disks =
    info.diskInfo.length === 0
      ? '（无磁盘数据）'
      : info.diskInfo
          .map((disk) => {
            const pct = disk.total > 0 ? Math.round((disk.used / disk.total) * 100) : 0
            return `${disk.mount}: ${formatBytes(disk.used)} / ${formatBytes(disk.total)}（已用 ${pct}%）`
          })
          .join('\n')

  return `电脑信息（工具箱实时读取）：
操作系统：${info.osVersion}（${platformLabel}）
架构：${info.arch}
主机名：${info.hostname}
CPU：${info.cpuModel}（${info.cpuCores} 逻辑核心）
GPU：${info.gpuModel}
内存：已用 ${formatBytes(usedMem)} / 共 ${formatBytes(info.totalMem)}（${memPct}%）
可用内存：${formatBytes(info.freeMem)}
开机时长：${formatUptime(info.uptime)}
磁盘：
${disks}`
}
