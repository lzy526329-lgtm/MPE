import { createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { Session } from 'electron'
import { parseDouyin } from './douyin'
import { parseKuaishou } from './kuaishou'
import { ANDROID_UA, MOBILE_UA, WatermarkError, extractUrl } from './http'
import type { SaveWatermarkRequest, WatermarkResult } from './types'

export type {
  SaveWatermarkRequest,
  SaveWatermarkResult,
  WatermarkMediaType,
  WatermarkPlatform,
  WatermarkResult,
} from './types'
export { WatermarkError } from './http'

const DOUYIN_HOSTS = ['douyin.com', 'iesdouyin.com']
const KUAISHOU_HOSTS = [
  'kuaishou.com',
  'gifshow.com',
  'chenzhongtech.com',
  'kspkg.com',
]

export function detectPlatform(input: string): WatermarkResult['platform'] | null {
  const url = extractUrl(input).toLowerCase()
  if (DOUYIN_HOSTS.some((host) => url.includes(host))) return 'douyin'
  if (KUAISHOU_HOSTS.some((host) => url.includes(host))) return 'kuaishou'
  return null
}

export async function parseWatermark(input: string): Promise<WatermarkResult> {
  const url = extractUrl(input)
  if (!url) throw new WatermarkError('请粘贴分享链接或分享文案')

  const platform = detectPlatform(url)
  if (platform === 'douyin') return parseDouyin(url)
  if (platform === 'kuaishou') return parseKuaishou(url)

  throw new WatermarkError(
    '暂不支持该平台。当前已接入抖音、快手；原 PHP 项目中其余平台接口大多已失效。',
  )
}

export async function saveWatermarkMedia(
  request: SaveWatermarkRequest & { outputPath: string },
): Promise<{ outputPath: string; size: number }> {
  const response = await fetch(request.url, {
    headers: {
      'User-Agent': request.referer.includes('kuaishou') ? ANDROID_UA : MOBILE_UA,
      Referer: request.referer,
      Accept: '*/*',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(120000),
  })

  if (!response.ok || !response.body) {
    throw new WatermarkError(`下载失败，HTTP ${response.status}`)
  }

  await pipeline(
    Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
    createWriteStream(request.outputPath),
  )
  const info = await stat(request.outputPath)
  return { outputPath: request.outputPath, size: info.size }
}

export function suggestedFileName(result: WatermarkResult) {
  const base = sanitizeFileName(result.desc || result.user_name || 'video').slice(0, 40)
  const extension = result.type === 'picture' ? guessImageExtension(result.video_url) : 'mp4'
  return `${base || 'video'}.${extension}`
}

export function attachWatermarkMediaHeaders(sess: Session) {
  sess.webRequest.onBeforeSendHeaders((details, callback) => {
    let host = ''
    try {
      host = new URL(details.url).hostname
    } catch {
      callback({ requestHeaders: details.requestHeaders })
      return
    }

    const isKuaishou = /kuaishou|gifshow|chenzhongtech|yximgs|kwimgs|kspkg/.test(host)
    const isDouyin = /douyin|iesdouyin|snssdk|byteimg|ibyteimg|douyinvod|bytecdn/.test(host)
    if (isKuaishou || isDouyin) {
      details.requestHeaders['User-Agent'] = isKuaishou ? ANDROID_UA : MOBILE_UA
      details.requestHeaders.Referer = isKuaishou
        ? 'https://www.kuaishou.com/'
        : 'https://www.iesdouyin.com/'
    }
    callback({ requestHeaders: details.requestHeaders })
  })
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|\n\r]/g, ' ').replace(/\s+/g, ' ').trim()
}

function guessImageExtension(url: string) {
  const match = url.match(/\.(jpg|jpeg|png|webp|avif)(?:$|\?)/i)
  return match?.[1]?.toLowerCase() === 'jpeg' ? 'jpg' : match?.[1]?.toLowerCase() || 'jpg'
}
