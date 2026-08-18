import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'

export interface CleanCategory {
  id: string
  label: string
  description: string
  paths: string[]
  size: number
  fileCount: number
  canClean: boolean
}

export interface ScanResult {
  categories: CleanCategory[]
  totalSize: number
  platform: string
}

export interface CleanResult {
  cleaned: { id: string; freedSize: number; deletedCount: number }[]
  totalFreed: number
  errors: string[]
}

// ─── helpers ────────────────────────────────────────────────

function dirSize(dirPath: string): { size: number; count: number } {
  let size = 0
  let count = 0
  try {
    const walk = (p: string) => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(p, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const full = path.join(p, entry.name)
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) {
          walk(full)
        } else {
          try {
            size += fs.statSync(full).size
            count++
          } catch { /* ignore locked files */ }
        }
      }
    }
    walk(dirPath)
  } catch { /* ignore */ }
  return { size, count }
}

function existingPaths(candidates: string[]): string[] {
  return candidates.filter((p) => {
    try { return fs.existsSync(p) } catch { return false }
  })
}

function deleteRecursive(targetPath: string): { freed: number; deleted: number } {
  let freed = 0
  let deleted = 0
  try {
    const stat = fs.statSync(targetPath)
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(targetPath, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(targetPath, entry.name)
        const result = deleteRecursive(full)
        freed += result.freed
        deleted += result.deleted
      }
    } else {
      freed += stat.size
      fs.unlinkSync(targetPath)
      deleted++
    }
  } catch { /* skip locked / protected */ }
  return { freed, deleted }
}

// ─── macOS scan ─────────────────────────────────────────────

function scanMac(): CleanCategory[] {
  const home = os.homedir()

  const categories: Array<Omit<CleanCategory, 'size' | 'fileCount' | 'canClean'> & { rawPaths: string[] }> = [
    {
      id: 'user-cache',
      label: '用户应用缓存',
      description: '~/Library/Caches 下各 App 产生的缓存文件，清除后 App 会自动重建。',
      rawPaths: [`${home}/Library/Caches`],
    },
    {
      id: 'system-log',
      label: '系统与应用日志',
      description: '~/Library/Logs 及 /Library/Logs 下的日志文件，占用空间但通常无需保留。',
      rawPaths: [`${home}/Library/Logs`, '/Library/Logs'],
    },
    {
      id: 'ios-backup',
      label: 'iOS / iPad 备份',
      description: 'iTunes/Finder 生成的设备完整备份，单个可能超过 10 GB。',
      rawPaths: [
        `${home}/Library/Application Support/MobileSync/Backup`,
        `${home}/Library/Containers/com.apple.MobileSMS`,
      ],
    },
    {
      id: 'xcode-derived',
      label: 'Xcode 派生数据 & 档案',
      description: 'Xcode 编译生成的中间文件，可随时重新构建，通常体积庞大。',
      rawPaths: [
        `${home}/Library/Developer/Xcode/DerivedData`,
        `${home}/Library/Developer/Xcode/Archives`,
        `${home}/Library/Developer/CoreSimulator/Caches`,
      ],
    },
    {
      id: 'npm-cache',
      label: 'npm / yarn / pnpm 缓存',
      description: '前端包管理器在本地缓存的依赖包，清除后下次安装会重新下载。',
      rawPaths: [
        `${home}/.npm/_cacache`,
        `${home}/.yarn/cache`,
        `${home}/.pnpm-store`,
        `${home}/Library/pnpm/store`,
      ],
    },
    {
      id: 'pip-cache',
      label: 'pip / conda 缓存',
      description: 'Python 包管理器的本地缓存，删除不影响已安装的包。',
      rawPaths: [
        `${home}/Library/Caches/pip`,
        `${home}/.cache/pip`,
        `${home}/opt/anaconda3/pkgs`,
        `${home}/anaconda3/pkgs`,
        `${home}/miniconda3/pkgs`,
      ],
    },
    {
      id: 'docker',
      label: 'Docker 数据（可选）',
      description: 'Docker Desktop 缓存的镜像层与 volume，删除后需重新 pull。',
      rawPaths: [
        `${home}/Library/Containers/com.docker.docker/Data/vms`,
      ],
    },
    {
      id: 'trash',
      label: '废纸篓',
      description: '当前用户废纸篓中的文件，相当于"清空废纸篓"操作。',
      rawPaths: [`${home}/.Trash`],
    },
  ]

  return categories.map((cat) => {
    const paths = existingPaths(cat.rawPaths)
    let size = 0
    let fileCount = 0
    for (const p of paths) {
      const s = dirSize(p)
      size += s.size
      fileCount += s.count
    }
    return {
      id: cat.id,
      label: cat.label,
      description: cat.description,
      paths,
      size,
      fileCount,
      canClean: paths.length > 0 && size > 0,
    }
  })
}

// ─── Windows scan ────────────────────────────────────────────

function scanWindows(): CleanCategory[] {
  const windir = process.env.SystemRoot ?? 'C:\\Windows'
  const localAppData = process.env.LOCALAPPDATA ?? ''
  const appData = process.env.APPDATA ?? ''
  const temp = process.env.TEMP ?? process.env.TMP ?? `${localAppData}\\Temp`
  const home = os.homedir()

  const categories: Array<Omit<CleanCategory, 'size' | 'fileCount' | 'canClean'> & { rawPaths: string[] }> = [
    {
      id: 'temp',
      label: '临时文件 (%TEMP%)',
      description: '系统及应用写入的临时文件夹，安全删除，下次运行会重新生成。',
      rawPaths: [temp, `${windir}\\Temp`],
    },
    {
      id: 'windows-update',
      label: 'Windows Update 缓存',
      description: '系统更新下载的安装包，更新完成后可安全删除，节省空间可观。',
      rawPaths: [
        `${windir}\\SoftwareDistribution\\Download`,
        `${windir}\\SoftwareDistribution\\DataStore\\Logs`,
      ],
    },
    {
      id: 'prefetch',
      label: 'Prefetch 预取文件',
      description: 'Windows 用于加速启动的预取缓存，删除后首次启动略慢，之后自动重建。',
      rawPaths: [`${windir}\\Prefetch`],
    },
    {
      id: 'thumbnail',
      label: '缩略图缓存',
      description: '文件资源管理器生成的图片缩略图数据库，删除后浏览文件夹时自动重建。',
      rawPaths: [
        `${localAppData}\\Microsoft\\Windows\\Explorer`,
      ],
    },
    {
      id: 'recycle-bin',
      label: '回收站',
      description: '回收站中已删除但尚未清空的文件。',
      rawPaths: ['C:\\$Recycle.Bin'],
    },
    {
      id: 'browser-cache',
      label: '浏览器缓存',
      description: 'Chrome、Edge、Firefox 的本地页面缓存，删除后不影响书签和密码。',
      rawPaths: [
        `${localAppData}\\Google\\Chrome\\User Data\\Default\\Cache`,
        `${localAppData}\\Google\\Chrome\\User Data\\Default\\Code Cache`,
        `${localAppData}\\Microsoft\\Edge\\User Data\\Default\\Cache`,
        `${localAppData}\\Microsoft\\Edge\\User Data\\Default\\Code Cache`,
        `${appData}\\Mozilla\\Firefox\\Profiles`,
      ],
    },
    {
      id: 'npm-cache',
      label: 'npm / yarn / pnpm 缓存',
      description: '前端包管理器本地缓存，删除后重新安装依赖时会自动下载。',
      rawPaths: [
        `${localAppData}\\npm-cache`,
        `${appData}\\npm-cache`,
        `${localAppData}\\Yarn\\Cache`,
      ],
    },
    {
      id: 'pip-cache',
      label: 'pip 缓存',
      description: 'Python pip 本地安装包缓存，删除不影响已安装的包。',
      rawPaths: [
        `${localAppData}\\pip\\Cache`,
      ],
    },
    {
      id: 'crash-dumps',
      label: '崩溃转储文件',
      description: '程序崩溃后生成的 .dmp 文件，用于调试但通常体积较大。',
      rawPaths: [
        `${localAppData}\\CrashDumps`,
        `${windir}\\Minidump`,
      ],
    },
  ]

  return categories.map((cat) => {
    const paths = existingPaths(cat.rawPaths)
    let size = 0
    let fileCount = 0
    for (const p of paths) {
      const s = dirSize(p)
      size += s.size
      fileCount += s.count
    }
    return {
      id: cat.id,
      label: cat.label,
      description: cat.description,
      paths,
      size,
      fileCount,
      canClean: paths.length > 0 && size > 0,
    }
  })
}

// ─── public API ──────────────────────────────────────────────

export function scanDisk(): ScanResult {
  const platform = process.platform
  const categories = platform === 'win32' ? scanWindows() : scanMac()
  const totalSize = categories.reduce((sum, c) => sum + c.size, 0)
  return { categories, totalSize, platform }
}

export function cleanCategories(ids: string[]): CleanResult {
  const { categories } = scanDisk()
  const targets = categories.filter((c) => ids.includes(c.id) && c.canClean)
  const cleaned: CleanResult['cleaned'] = []
  const errors: string[] = []

  for (const cat of targets) {
    let freedSize = 0
    let deletedCount = 0
    for (const p of cat.paths) {
      try {
        const stat = fs.statSync(p)
        if (stat.isDirectory()) {
          // Delete contents but keep the directory itself
          const entries = fs.readdirSync(p, { withFileTypes: true })
          for (const entry of entries) {
            const full = path.join(p, entry.name)
            const result = deleteRecursive(full)
            freedSize += result.freed
            deletedCount += result.deleted
          }
        } else {
          const result = deleteRecursive(p)
          freedSize += result.freed
          deletedCount += result.deleted
        }
      } catch (err) {
        errors.push(`${cat.label}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    cleaned.push({ id: cat.id, freedSize, deletedCount })
  }

  return {
    cleaned,
    totalFreed: cleaned.reduce((sum, c) => sum + c.freedSize, 0),
    errors,
  }
}
