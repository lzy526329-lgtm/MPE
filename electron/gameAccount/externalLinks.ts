type LinkDocument = Pick<Document, 'addEventListener' | 'removeEventListener'>
const installed = new WeakMap<LinkDocument, () => void>()

export function externalHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f\\]/.test(value)) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    return url.href
  } catch { return null }
}

export function installExternalLinkHandler(document: LinkDocument, openExternal: (url: string) => Promise<unknown>): () => void {
  const existing = installed.get(document)
  if (existing) return existing
  const listener = (event: MouseEvent) => {
    if (event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return
    const target = event.target as Element | null
    const anchor = target?.closest?.('a[target="_blank"]') as HTMLAnchorElement | null
    if (!anchor) return
    event.preventDefault()
    const url = externalHttpUrl(anchor.href)
    if (url) void openExternal(url).catch(() => {})
  }
  document.addEventListener('click', listener, true)
  document.addEventListener('auxclick', listener, true)
  const cleanup = () => {
    if (installed.get(document) !== cleanup) return
    document.removeEventListener('click', listener, true)
    document.removeEventListener('auxclick', listener, true)
    installed.delete(document)
  }
  installed.set(document, cleanup)
  return cleanup
}
