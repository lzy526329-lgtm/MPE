import { createHash } from 'node:crypto'
import type { WatermarkResult } from './types'
import {
  ANDROID_UA,
  CookieJar,
  WatermarkError,
  collectHttpUrls,
  extractJsObject,
  extractUrl,
  findFirstHttpUrl,
  followRedirect,
  httpGet,
} from './http'

const SHARE_HEADERS = {
  'User-Agent': ANDROID_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Referer: 'https://www.kuaishou.com/',
}

/**
 * 快手 2020 年 tokenShare 接口已失效，改为解析分享页内嵌 JSON。
 */
export async function parseKuaishou(url: string): Promise<WatermarkResult> {
  const originalUrl = extractUrl(url)
  if (!originalUrl) throw new WatermarkError('网址不能为空')

  const jar = new CookieJar()
  await httpGet('https://www.kuaishou.com/', SHARE_HEADERS, jar)

  let target = originalUrl
  try {
    target = await followRedirect(originalUrl, SHARE_HEADERS)
  } catch {
    target = originalUrl
  }

  const { body: html, effectiveUrl } = await httpGet(target, SHARE_HEADERS, jar)
  const payload = extractPayload(html)
  if (!payload) {
    throw new WatermarkError('快手分享页未返回有效数据，作品可能需要登录或已失效')
  }

  const videoUrl =
    findFirstHttpUrl(payload, ['photoUrl', 'srcNoMark', 'photoH265Url', 'mpegUrl']) ||
    findMp4Url(html)
  if (!videoUrl) throw new WatermarkError('未找到快手无水印播放地址')

  const cover =
    findFirstHttpUrl(payload, ['coverUrl', 'cover', 'coverThumbnailUrl']) ||
    collectHttpUrls(payload, ['url']).find((item) => /\.(jpg|jpeg|png|webp)/i.test(item)) ||
    ''
  const userName =
    findString(payload, ['userName', 'user_name', 'name', 'nickname']) || ''
  const desc = findString(payload, ['caption', 'desc', 'description', 'title']) || ''
  const avatar = findFirstHttpUrl(payload, ['headurl', 'headUrl', 'avatar', 'avatarUrl'])

  return {
    md5: createHash('md5').update(originalUrl).digest('hex'),
    message: originalUrl,
    user_name: userName,
    user_head_img: avatar,
    desc,
    img_url: cover,
    video_url: unescapeUrl(videoUrl),
    type: 'video',
    platform: 'kuaishou',
    referer: effectiveUrl || 'https://www.kuaishou.com/',
    images: [],
  }
}

function extractPayload(html: string): unknown {
  const candidates = [
    extractJsObject(html, 'window.INIT_STATE'),
    extractJsObject(html, 'window.__APOLLO_STATE__'),
    extractJsObject(html, 'window.__INITIAL_STATE__'),
  ]
  return candidates.find(Boolean) ?? extractLoosePhotoJson(html)
}

function extractLoosePhotoJson(html: string): unknown | null {
  const photoUrl = html.match(/"photoUrl"\s*:\s*"(https?:\\?\/\\?\/[^"]+)"/)
  const srcNoMark = html.match(/"srcNoMark"\s*:\s*"(https?:\\?\/\\?\/[^"]+)"/)
  const url = photoUrl?.[1] || srcNoMark?.[1]
  if (!url) return null
  return {
    photoUrl: unescapeUrl(url),
    userName: capture(html, /"userName"\s*:\s*"([^"]+)"/),
    caption: capture(html, /"caption"\s*:\s*"([^"]+)"/),
    coverUrl: unescapeUrl(capture(html, /"coverUrl"\s*:\s*"(https?:\\?\/\\?\/[^"]+)"/) || ''),
  }
}

function findMp4Url(html: string) {
  const match = html.match(/https?:\\?\/\\?\/[^"'\\\s]+?\.mp4[^"'\\\s]*/i)
  return match ? unescapeUrl(match[0]) : ''
}

function findString(value: unknown, keys: string[]): string {
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findString(child, keys)
      if (found) return found
    }
    return ''
  }
  const record = value as Record<string, unknown>
  for (const key of keys) {
    if (typeof record[key] === 'string' && record[key]) return record[key]
  }
  for (const child of Object.values(record)) {
    const found = findString(child, keys)
    if (found) return found
  }
  return ''
}

function unescapeUrl(value: string) {
  return value
    .replaceAll('\\u002F', '/')
    .replaceAll('\\/', '/')
    .replaceAll('\\u0026', '&')
}

function capture(html: string, pattern: RegExp) {
  return pattern.exec(html)?.[1] ?? ''
}
