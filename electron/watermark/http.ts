export const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'

export const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36'

export class WatermarkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WatermarkError'
  }
}

export class CookieJar {
  private readonly cookies = new Map<string, string>()

  apply(headers: Headers) {
    const setCookies = headers.getSetCookie?.() ?? []
    for (const cookie of setCookies) {
      const pair = cookie.split(';', 1)[0]
      const separator = pair.indexOf('=')
      if (separator <= 0) continue
      this.cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim())
    }
  }

  header() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
  }
}

export function decodeHtmlEntities(text: string) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&#60;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#62;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

export function extractUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i)
  if (!match) return text.trim()
  return match[0].replace(/[.,;!?，。；！？）】》、]+$/g, '')
}

export function firstUrl(list: unknown): string {
  return Array.isArray(list) && typeof list[0] === 'string' ? list[0] : ''
}

export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function httpGet(
  url: string,
  headers: Record<string, string>,
  jar?: CookieJar,
  timeoutMs = 20000,
): Promise<{ body: string; status: number; effectiveUrl: string; responseHeaders: Headers }> {
  const requestHeaders: Record<string, string> = { ...headers }
  const cookie = jar?.header()
  if (cookie) requestHeaders.Cookie = cookie

  const response = await fetch(url, {
    method: 'GET',
    headers: requestHeaders,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })

  jar?.apply(response.headers)
  const body = await response.text()
  if (response.status < 200 || response.status >= 400) {
    throw new WatermarkError(`请求失败，HTTP ${response.status}`)
  }

  return {
    body,
    status: response.status,
    effectiveUrl: response.url,
    responseHeaders: response.headers,
  }
}

export async function followRedirect(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 15000,
): Promise<string> {
  let current = url
  for (let hop = 0; hop < 8; hop += 1) {
    const response = await fetch(current, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location.trim(), current).toString()
      continue
    }
    if (response.status >= 200 && response.status < 300) {
      return current
    }
    throw new WatermarkError(`链接跳转失败，HTTP ${response.status}`)
  }
  return current
}

export function findArrayWithKey(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(record, key)) return record
  for (const child of Object.values(record)) {
    const found = findArrayWithKey(child, key)
    if (found) return found
  }
  return null
}

export function findFirstHttpUrl(value: unknown, keys: string[]): string {
  if (!value || typeof value !== 'object') return ''

  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findFirstHttpUrl(child, keys)
      if (found) return found
    }
    return ''
  }

  const record = value as Record<string, unknown>
  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === 'string' && /^https?:\/\//.test(candidate)) {
      return candidate.replace(/\\u002F/g, '/')
    }
    if (Array.isArray(candidate) && candidate[0] && typeof candidate[0] === 'object') {
      const nested = candidate[0] as Record<string, unknown>
      if (typeof nested.url === 'string' && /^https?:\/\//.test(nested.url)) {
        return nested.url
      }
    }
  }

  for (const child of Object.values(record)) {
    const found = findFirstHttpUrl(child, keys)
    if (found) return found
  }
  return ''
}

export function collectHttpUrls(value: unknown, keys: string[]): string[] {
  const urls: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    const record = node as Record<string, unknown>
    for (const key of keys) {
      const candidate = record[key]
      if (typeof candidate === 'string' && /^https?:\/\//.test(candidate)) {
        urls.push(candidate.replace(/\\u002F/g, '/'))
      }
    }
    Object.values(record).forEach(walk)
  }
  walk(value)
  return [...new Set(urls)]
}

export function parseEmbeddedJson(html: string, pattern: RegExp): unknown | null {
  const match = html.match(pattern)
  if (!match?.[1]) return null
  const raw = decodeHtmlEntities(match[1].trim().replace(/;+$/, ''))
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function extractJsObject(html: string, marker: string): unknown | null {
  const index = html.indexOf(marker)
  if (index < 0) return null
  const start = html.indexOf('{', index)
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < html.length; i += 1) {
    const char = html[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(decodeHtmlEntities(html.slice(start, i + 1)))
        } catch {
          return null
        }
      }
    }
  }
  return null
}
