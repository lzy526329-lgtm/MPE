import { createHash } from 'node:crypto'
import type { WatermarkResult } from './types'
import {
  CookieJar,
  MOBILE_UA,
  WatermarkError,
  extractUrl,
  findArrayWithKey,
  firstUrl,
  followRedirect,
  httpGet,
  sleep,
} from './http'

const MAX_ATTEMPTS = 3
const SHARE_HEADERS = {
  'User-Agent': MOBILE_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Referer: 'https://www.iesdouyin.com/',
}

/** 抖音 web 详情接口对普通浏览器 UA 返回空 body，爬虫 UA 仍会下发 aweme_detail。 */
const DETAIL_USER_AGENTS = [
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; Bytespider; https://zhanzhang.toutiao.com/)',
]

/**
 * 对应 PHP DouYinParser，并适配分享页不再内嵌 videoInfoRes 的现状。
 */
export async function parseDouyin(url: string): Promise<WatermarkResult> {
  const originalUrl = url.trim()
  if (!originalUrl) throw new WatermarkError('网址不能为空')

  const itemId = await resolveItemId(originalUrl)
  const item = (await fetchAwemeDetail(itemId)) ?? (await fetchItemWithRetry(itemId))
  const images = collectImages(item)
  const videoUrl = await resolveVideoUrl(item, images)

  const author = asRecord(item.author)
  const video = asRecord(item.video)
  const avatar = asRecord(author.avatar_thumb) ?? asRecord(author.avatar_medium)
  const cover = asRecord(video.cover) ?? asRecord(video.origin_cover)

  return {
    md5: createHash('md5').update(originalUrl).digest('hex'),
    message: originalUrl,
    user_name: String(author.nickname ?? ''),
    user_head_img: firstUrl(avatar.url_list),
    desc: String(item.desc ?? ''),
    img_url: firstUrl(cover.url_list),
    video_url: videoUrl,
    type: images.length > 0 ? 'picture' : 'video',
    platform: 'douyin',
    referer: 'https://www.douyin.com/',
    images,
  }
}

async function resolveItemId(text: string): Promise<string> {
  const url = extractUrl(text)
  const direct = matchItemId(url)
  if (direct) return direct

  const resolved = await followRedirect(url, {
    'User-Agent': MOBILE_UA,
    Referer: 'https://www.iesdouyin.com/',
  })
  const fromPath = matchItemId(resolved)
  if (fromPath) return fromPath
  throw new WatermarkError('无法从链接中提取视频 ID')
}

function matchItemId(value: string) {
  return (
    value.match(/\/(?:share\/)?(?:video|note|slides)\/(\d{10,})/)?.[1] ||
    value.match(/[?&]modal_id=(\d{10,})/)?.[1] ||
    ''
  )
}

async function fetchAwemeDetail(itemId: string): Promise<Record<string, unknown> | null> {
  const url =
    `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${itemId}&aid=6383&cookie_enabled=true&platform=PC`

  for (const userAgent of DETAIL_USER_AGENTS) {
    try {
      const { body } = await httpGet(url, {
        'User-Agent': userAgent,
        Referer: `https://www.douyin.com/video/${itemId}`,
        Accept: 'application/json, text/plain, */*',
      })
      if (!body) continue
      const payload = JSON.parse(body) as Record<string, unknown>
      const detail = asRecord(payload.aweme_detail)
      if (Object.keys(detail).length > 0) return detail
    } catch {
      // 换下一个 UA 再试
    }
  }
  return null
}

async function fetchItemWithRetry(itemId: string) {
  let lastError = '分享页未返回有效数据'
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const html = await fetchSharePage(itemId)
      return extractItem(html)
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError
      if (attempt < MAX_ATTEMPTS) await sleep(400 * attempt)
    }
  }
  throw new WatermarkError(lastError)
}

async function fetchSharePage(itemId: string) {
  const shareUrl = `https://www.iesdouyin.com/share/video/${itemId}/`
  const jar = new CookieJar()
  await httpGet('https://www.iesdouyin.com/', SHARE_HEADERS, jar)
  const { body: html } = await httpGet(shareUrl, SHARE_HEADERS, jar)

  if (!html || html.length < 5000) {
    throw new WatermarkError('抖音访问受限，请稍后重试')
  }
  if (!/_ROUTER_DATA/i.test(html)) {
    throw new WatermarkError('分享页未返回有效数据，请稍后重试')
  }
  return html
}

function extractItem(html: string): Record<string, unknown> {
  const match = html.match(/window\._ROUTER_DATA\s*=\s*(.*?)\s*<\/script>/s)
  if (!match?.[1]) throw new WatermarkError('未找到页面内嵌视频数据')

  let payload: unknown
  try {
    payload = JSON.parse(decodeHtml(match[1].trim()))
  } catch {
    throw new WatermarkError('视频数据解析失败')
  }
  if (!payload || typeof payload !== 'object') {
    throw new WatermarkError('视频数据解析失败')
  }

  const videoPage = findVideoPage(payload as Record<string, unknown>)
  const videoInfoRes = asRecord(videoPage.videoInfoRes)
  const itemList = videoInfoRes.item_list
  if (!Array.isArray(itemList) || !itemList[0] || typeof itemList[0] !== 'object') {
    const status = String(videoInfoRes.status_msg ?? 'empty item_list')
    throw new WatermarkError(`视频不存在、已删除或暂不可访问：${status}`)
  }
  return itemList[0] as Record<string, unknown>
}

function findVideoPage(payload: Record<string, unknown>) {
  const loaderData = asRecord(payload.loaderData)
  for (const key of ['video_(id)/page', 'note_(id)/page']) {
    const page = asRecord(loaderData[key])
    if (page.videoInfoRes) return page
  }
  const found = findArrayWithKey(loaderData, 'videoInfoRes')
  if (found) return found
  throw new WatermarkError('分享页未包含视频数据，作品可能不可访问')
}

async function resolveVideoUrl(item: Record<string, unknown>, images: string[]) {
  if (images[0]) return images[0]

  const video = asRecord(item.video)
  const candidate = pickPlayUrl(video)
  if (!candidate) throw new WatermarkError('未找到视频播放地址')
  if (/douyinvod|bytecdn|snssdk/.test(candidate) && !candidate.includes('/aweme/v1/play')) {
    return candidate
  }

  return followRedirect(candidate.replaceAll('playwm', 'play'), {
    'User-Agent': MOBILE_UA,
    Referer: 'https://www.iesdouyin.com/',
  })
}

function pickPlayUrl(video: Record<string, unknown>) {
  const lists = [video.play_addr, video.play_addr_h264, video.play_addr_265].flatMap((value) => {
    const urlList = asRecord(value).url_list
    return Array.isArray(urlList) ? urlList.filter((item): item is string => typeof item === 'string') : []
  })

  const noWatermark = lists.filter((url) => !url.includes('watermark=1') && !url.includes('playwm'))
  return (
    noWatermark.find((url) => /douyinvod|bytecdn/.test(url)) ||
    noWatermark[0] ||
    lists[0]?.replaceAll('playwm', 'play') ||
    ''
  )
}

function collectImages(item: Record<string, unknown>) {
  if (!Array.isArray(item.images)) return []
  return item.images
    .map((image) => firstUrl(asRecord(image).url_list))
    .filter((url): url is string => Boolean(url))
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function decodeHtml(text: string) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
