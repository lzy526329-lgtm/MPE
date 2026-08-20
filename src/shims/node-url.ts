const globalUrl = globalThis.URL
const globalSearch = globalThis.URLSearchParams

export class Url {}
export const URL = globalUrl
export const URLSearchParams = globalSearch

export function parse(input: string) {
  try {
    const parsed = new globalUrl(input, 'http://localhost')
    return {
      protocol: parsed.protocol,
      slashes: true,
      auth: null,
      host: parsed.host,
      port: parsed.port,
      hostname: parsed.hostname,
      hash: parsed.hash,
      search: parsed.search,
      query: parsed.search.slice(1),
      pathname: parsed.pathname,
      path: parsed.pathname + parsed.search,
      href: parsed.href,
    }
  } catch {
    return null
  }
}

export function format(obj: { href?: string; pathname?: string; search?: string; hash?: string }) {
  if (obj.href) return obj.href
  return `${obj.pathname ?? ''}${obj.search ?? ''}${obj.hash ?? ''}`
}

export function resolve(from: string, to: string) {
  return new globalUrl(to, from).href
}

export function resolveObject() {
  return {}
}

export function domainToASCII(domain: string) {
  return domain
}

export function domainToUnicode(domain: string) {
  return domain
}

export function pathToFileURL(filePath: string) {
  return new globalUrl(filePath, 'file:')
}

export function fileURLToPath(fileUrl: string | { href: string }) {
  const href = typeof fileUrl === 'string' ? fileUrl : fileUrl.href
  return decodeURIComponent(href.replace(/^file:\/\//, ''))
}

export function urlToHttpOptions() {
  return {}
}

const api = {
  Url,
  parse,
  resolve,
  resolveObject,
  format,
  URL,
  URLSearchParams,
  domainToASCII,
  domainToUnicode,
  pathToFileURL,
  fileURLToPath,
  urlToHttpOptions,
}

export default api
