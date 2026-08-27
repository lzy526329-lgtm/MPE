import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { access, mkdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const API_BASE = 'https://live.photoplus.cn'
const SIGN_SECRET = 'laxiaoheiwu'
const PAGE_SIZE = 100
const DOWNLOAD_CONCURRENCY = 4
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

export class PhotoplusError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhotoplusError'
  }
}

export type PhotoplusAlbumInfo = {
  albumId: number
  name: string
  locked: boolean
}

export type PhotoplusDownloadGroup =
  | { kind: 'album'; albumId: number; folderName: string }
  | { kind: 'all'; folderName: '' }

export type PhotoplusDownloadPlan = {
  rootFolderName: string
  groups: PhotoplusDownloadGroup[]
  skippedAlbums: Array<{ albumId: number; name: string }>
}

export type PhotoplusProgress = {
  phase: 'resolving' | 'listing' | 'downloading' | 'paused' | 'cancelled' | 'done'
  activityName: string
  message: string
  total: number
  completed: number
  failed: number
  skipped: number
  remaining: number
  outputDirectory: string
}

export type PhotoplusDownloadResult = {
  activityNo: string
  activityName: string
  outputDirectory: string
  total: number
  downloaded: number
  failed: number
  skipped: number
  remaining: number
  status: 'completed' | 'cancelled'
  skippedAlbums: Array<{ albumId: number; name: string }>
}

export type PhotoplusControlStatus = 'running' | 'paused' | 'cancelled'

export class PhotoplusDownloadController {
  private state: PhotoplusControlStatus = 'running'
  private waiters: Array<(value: 'run' | 'cancel') => void> = []

  get status(): PhotoplusControlStatus {
    return this.state
  }

  pause() {
    if (this.state === 'cancelled') return
    this.state = 'paused'
  }

  resume() {
    if (this.state !== 'paused') return
    this.state = 'running'
    this.flush('run')
  }

  cancel() {
    if (this.state === 'cancelled') return
    this.state = 'cancelled'
    this.flush('cancel')
  }

  async waitForProceed(): Promise<'run' | 'cancel'> {
    if (this.state === 'cancelled') return 'cancel'
    if (this.state === 'running') return 'run'
    return new Promise((resolve) => {
      this.waiters.push(resolve)
    })
  }

  private flush(value: 'run' | 'cancel') {
    const pending = this.waiters.splice(0)
    for (const resolve of pending) resolve(value)
  }
}

type ApiPic = {
  id?: number
  pic_hash?: string
  pic_name?: string
  origin_img?: string
  watermark_origin_img?: string
  big_img?: string
  middle_img?: string
  small_img?: string
  preview_img?: string
}

export function extractActivityNo(input: string): string {
  const text = input.trim()
  if (!text) throw new PhotoplusError('请粘贴 PhotoPlus 相册链接')

  const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i)
  const raw = (urlMatch?.[0] || text).replace(/[.,;!?，。；！？）】》、]+$/g, '')

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new PhotoplusError('链接无效，请粘贴 live.photoplus.cn 相册地址')
  }

  if (!/photoplus\.cn$/i.test(parsed.hostname) && !/\.photoplus\.cn$/i.test(parsed.hostname)) {
    throw new PhotoplusError('暂仅支持 PhotoPlus（live.photoplus.cn）相册链接')
  }

  const fromQuery = parsed.searchParams.get('activityNo')
  if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery

  const pathMatch = parsed.pathname.match(/\/(?:live\/pc|live|activity\/live\/pc|activity\/live)\/(\d+)/i)
  if (pathMatch?.[1]) return pathMatch[1]

  const anyDigits = parsed.pathname.match(/\/(\d{5,})(?:\/|$)/)
  if (anyDigits?.[1]) return anyDigits[1]

  throw new PhotoplusError('无法从链接中解析活动 ID')
}

export function sanitizeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function normalizeImageUrl(url: string) {
  if (!url) return ''
  if (url.startsWith('//')) return `https:${url}`
  return url
}

export function pickBestImageUrl(pic: Record<string, unknown>) {
  const candidates = [
    pic.origin_img,
    pic.watermark_origin_img,
    pic.big_img,
    pic.watermark_big_img,
    pic.middle_img,
    pic.preview_img,
    pic.small_img,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return normalizeImageUrl(candidate.trim())
    }
  }
  return ''
}

export function signParams(
  params: Record<string, string | number | boolean | null | undefined>,
  timestampMs = Date.now(),
): Record<string, string | number | boolean> {
  const payload: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue
    payload[key] = value
  }
  payload._t = timestampMs

  const parts: string[] = []
  for (const key of Object.keys(payload).sort()) {
    parts.push(`${key}=${JSON.stringify(payload[key])}`)
  }
  const raw = parts.join('&').replace(/"/g, '')
  const signature = createHash('md5').update(`${raw}${SIGN_SECRET}`).digest('hex')

  return { ...payload, _s: signature, _t: timestampMs }
}

export function buildDownloadPlan(input: {
  activityNo: string
  activityName: string
  albums: PhotoplusAlbumInfo[]
}): PhotoplusDownloadPlan {
  const title = sanitizeFileName(input.activityName) || input.activityNo
  const rootFolderName = `PhotoPlus-${title}`
  const unlocked = input.albums.filter((album) => !album.locked)
  const skippedAlbums = input.albums
    .filter((album) => album.locked)
    .map((album) => ({ albumId: album.albumId, name: album.name }))

  if (unlocked.length === 0) {
    return {
      rootFolderName,
      groups: [{ kind: 'all', folderName: '' }],
      skippedAlbums,
    }
  }

  const usedNames = new Map<string, number>()
  const groups: PhotoplusDownloadGroup[] = unlocked.map((album) => {
    const base = sanitizeFileName(album.name) || `专辑-${album.albumId}`
    const count = usedNames.get(base) ?? 0
    usedNames.set(base, count + 1)
    const folderName = count === 0 ? base : `${base}-${count + 1}`
    return { kind: 'album', albumId: album.albumId, folderName }
  })

  return { rootFolderName, groups, skippedAlbums }
}

async function apiGet<T>(
  apiPath: string,
  params: Record<string, string | number | boolean | null | undefined>,
  activityNo: string,
): Promise<T> {
  const signed = signParams(params)
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(signed)) {
    query.set(key, String(value))
  }
  const url = `${API_BASE}${apiPath}?${query.toString()}`
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': USER_AGENT,
      Referer: `https://live.photoplus.cn/live/pc/${activityNo}/`,
    },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) {
    throw new PhotoplusError(`接口请求失败，HTTP ${response.status}`)
  }
  const body = (await response.json()) as { success?: boolean; message?: string; result?: T }
  if (!body.success) {
    throw new PhotoplusError(body.message || 'PhotoPlus 接口返回失败')
  }
  return body.result as T
}

async function fetchActivityName(activityNo: string) {
  const detail = await apiGet<Record<string, unknown>>('/live/detail', { activityNo }, activityNo)
  const name = typeof detail.name === 'string' ? detail.name : ''
  return name.trim() || activityNo
}

async function fetchAlbums(activityNo: string): Promise<PhotoplusAlbumInfo[]> {
  const result = await apiGet<Array<Record<string, unknown>>>(
    '/album/albums',
    { activityNo, count: 1000 },
    activityNo,
  )
  if (!Array.isArray(result)) return []
  return result
    .map((item) => {
      const albumId = Number(item.album_id)
      const name = typeof item.name === 'string' ? item.name : `专辑-${albumId}`
      const locked = Boolean(item.password)
      if (!Number.isFinite(albumId) || albumId <= 0) return null
      return { albumId, name, locked }
    })
    .filter((item): item is PhotoplusAlbumInfo => Boolean(item))
}

async function fetchAllLivePics(activityNo: string, onPage?: (count: number) => void) {
  const pics: ApiPic[] = []
  let page = 1
  let pageTotal = 1
  while (page <= pageTotal) {
    const result = await apiGet<{
      pageTotal?: number
      pics_array?: ApiPic[]
    }>('/pic/list', { activityNo, page, size: PAGE_SIZE, count: PAGE_SIZE }, activityNo)
    const batch = Array.isArray(result.pics_array) ? result.pics_array : []
    pics.push(...batch)
    pageTotal = Math.max(1, Number(result.pageTotal) || 1)
    onPage?.(pics.length)
    if (batch.length === 0) break
    page += 1
  }
  return pics
}

async function fetchAlbumPics(activityNo: string, albumId: number, onPage?: (count: number) => void) {
  const pics: ApiPic[] = []
  let page = 1
  let pageTotal = 1
  while (page <= pageTotal) {
    const result = await apiGet<{
      pageTotal?: number
      pics?: ApiPic[]
    }>(
      '/album/one',
      { albumId, page, size: PAGE_SIZE, count: PAGE_SIZE },
      activityNo,
    )
    const batch = Array.isArray(result.pics) ? result.pics : []
    pics.push(...batch)
    pageTotal = Math.max(1, Number(result.pageTotal) || 1)
    onPage?.(pics.length)
    if (batch.length === 0) break
    page += 1
  }
  return pics
}

function guessExtension(fileName: string, url: string) {
  const fromName = fileName.match(/\.([a-z0-9]{3,4})$/i)?.[1]
  if (fromName) return fromName.toLowerCase() === 'jpeg' ? 'jpg' : fromName.toLowerCase()
  const fromUrl = url.match(/\.(jpg|jpeg|png|webp|avif)(?:$|\?|~)/i)?.[1]
  return fromUrl?.toLowerCase() === 'jpeg' ? 'jpg' : fromUrl?.toLowerCase() || 'jpg'
}

function buildLocalFileName(pic: ApiPic, used: Map<string, number>) {
  const baseRaw = sanitizeFileName(pic.pic_name || '') || sanitizeFileName(pic.pic_hash || '') || `pic-${pic.id || 'unknown'}`
  const withoutExt = baseRaw.replace(/\.[a-z0-9]{3,4}$/i, '')
  const ext = guessExtension(pic.pic_name || '', pickBestImageUrl(pic as Record<string, unknown>))
  let candidate = `${withoutExt}.${ext}`
  const count = used.get(candidate.toLowerCase()) ?? 0
  used.set(candidate.toLowerCase(), count + 1)
  if (count > 0) {
    candidate = `${withoutExt}-${count + 1}.${ext}`
  }
  return candidate
}

async function pathExists(target: string) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

async function downloadFile(url: string, outputPath: string, activityNo: string) {
  const response = await fetch(url, {
    headers: {
      Accept: '*/*',
      'User-Agent': USER_AGENT,
      Referer: `https://live.photoplus.cn/live/pc/${activityNo}/`,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(120000),
  })
  if (!response.ok || !response.body) {
    throw new PhotoplusError(`下载失败，HTTP ${response.status}`)
  }
  await pipeline(
    Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
    createWriteStream(outputPath),
  )
  const info = await stat(outputPath)
  if (info.size <= 0) throw new PhotoplusError('下载文件为空')
}

export async function runControlledPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  controller?: PhotoplusDownloadController,
) {
  if (items.length === 0) return
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const gate = controller ? await controller.waitForProceed() : 'run'
      if (gate === 'cancel') return
      if (next >= items.length) return
      const index = next
      next += 1
      await worker(items[index], index)
    }
  })
  await Promise.all(runners)
}

function resolveDesktopDir(desktopDir?: string) {
  return desktopDir || path.join(homedir(), 'Desktop')
}

export async function downloadPhotoplusAlbum(
  inputUrl: string,
  options?: {
    desktopDir?: string
    controller?: PhotoplusDownloadController
    onProgress?: (progress: PhotoplusProgress) => void
  },
): Promise<PhotoplusDownloadResult> {
  const activityNo = extractActivityNo(inputUrl)
  const desktopDir = resolveDesktopDir(options?.desktopDir)
  const controller = options?.controller

  const emit = (partial: Partial<PhotoplusProgress> & Pick<PhotoplusProgress, 'phase' | 'message'>) => {
    const total = partial.total ?? 0
    const completed = partial.completed ?? 0
    const failed = partial.failed ?? 0
    const skipped = partial.skipped ?? 0
    options?.onProgress?.({
      phase: partial.phase,
      activityName: partial.activityName || '',
      message: partial.message,
      total,
      completed,
      failed,
      skipped,
      remaining: Math.max(0, total - completed - failed - skipped),
      outputDirectory: partial.outputDirectory || '',
    })
  }

  const ensureNotCancelled = async (): Promise<boolean> => {
    if (!controller) return true
    const gate = await controller.waitForProceed()
    return gate === 'run'
  }

  emit({ phase: 'resolving', message: '正在解析相册信息…' })
  if (!(await ensureNotCancelled())) {
    return {
      activityNo,
      activityName: '',
      outputDirectory: '',
      total: 0,
      downloaded: 0,
      failed: 0,
      skipped: 0,
      remaining: 0,
      status: 'cancelled',
      skippedAlbums: [],
    }
  }
  const [activityName, albums] = await Promise.all([
    fetchActivityName(activityNo),
    fetchAlbums(activityNo),
  ])
  const plan = buildDownloadPlan({ activityNo, activityName, albums })
  const outputDirectory = path.join(desktopDir, plan.rootFolderName)
  await mkdir(outputDirectory, { recursive: true })

  type Job = { url: string; filePath: string }
  const jobs: Job[] = []

  emit({
    phase: 'listing',
    activityName,
    message: '正在拉取图片列表…',
    outputDirectory,
  })

  for (const group of plan.groups) {
    if (!(await ensureNotCancelled())) {
      emit({
        phase: 'cancelled',
        activityName,
        message: '已取消',
        outputDirectory,
        total: jobs.length,
      })
      return {
        activityNo,
        activityName,
        outputDirectory,
        total: jobs.length,
        downloaded: 0,
        failed: 0,
        skipped: 0,
        remaining: jobs.length,
        status: 'cancelled',
        skippedAlbums: plan.skippedAlbums,
      }
    }
    const folder =
      group.kind === 'album' ? path.join(outputDirectory, group.folderName) : outputDirectory
    await mkdir(folder, { recursive: true })
    const pics =
      group.kind === 'album'
        ? await fetchAlbumPics(activityNo, group.albumId, (count) => {
            emit({
              phase: 'listing',
              activityName,
              message: `正在读取「${group.folderName}」… 已发现 ${count} 张`,
              outputDirectory,
              total: jobs.length + count,
            })
          })
        : await fetchAllLivePics(activityNo, (count) => {
            emit({
              phase: 'listing',
              activityName,
              message: `正在读取全部图片… 已发现 ${count} 张`,
              outputDirectory,
              total: count,
            })
          })

    const usedNames = new Map<string, number>()
    for (const pic of pics) {
      const url = pickBestImageUrl(pic as Record<string, unknown>)
      if (!url) continue
      const fileName = buildLocalFileName(pic, usedNames)
      jobs.push({ url, filePath: path.join(folder, fileName) })
    }
  }

  let completed = 0
  let failed = 0
  let skipped = 0

  const emitDownloadProgress = (phase: PhotoplusProgress['phase'], message: string) => {
    emit({
      phase,
      activityName,
      message,
      total: jobs.length,
      completed,
      failed,
      skipped,
      outputDirectory,
    })
  }

  emitDownloadProgress('downloading', `开始下载 ${jobs.length} 张图片…`)

  await runControlledPool(
    jobs,
    DOWNLOAD_CONCURRENCY,
    async (job) => {
      try {
        if (await pathExists(job.filePath)) {
          skipped += 1
        } else {
          await downloadFile(job.url, job.filePath, activityNo)
          completed += 1
        }
      } catch {
        failed += 1
      }
      const done = completed + failed + skipped
      const phase = controller?.status === 'paused' ? 'paused' : 'downloading'
      const message =
        phase === 'paused'
          ? `已暂停 ${done}/${jobs.length}，剩余 ${jobs.length - done} 张`
          : `下载中 ${done}/${jobs.length}`
      emitDownloadProgress(phase, message)
    },
    controller,
  )

  const cancelled = controller?.status === 'cancelled'
  const remaining = Math.max(0, jobs.length - completed - failed - skipped)
  emitDownloadProgress(
    cancelled ? 'cancelled' : 'done',
    cancelled
      ? `已取消：下载 ${completed}，跳过 ${skipped}，失败 ${failed}，未下 ${remaining}`
      : '下载完成',
  )

  return {
    activityNo,
    activityName,
    outputDirectory,
    total: jobs.length,
    downloaded: completed,
    failed,
    skipped,
    remaining,
    status: cancelled ? 'cancelled' : 'completed',
    skippedAlbums: plan.skippedAlbums,
  }
}
