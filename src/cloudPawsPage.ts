import { getCurrentPage, onPageChange } from './appNavigation'
import './cloudPawsPage.css'

/** Resolve against the app document, including file:// installations on both platforms. */
export function getCloudPawsUrl(baseURI: string): string {
  return new URL('./games/cloud-paws/index.html', baseURI).href
}

export function mountCloudPawsPage(): (() => void) | undefined {
  const root = document.querySelector<HTMLElement>('#cloud-paws-root')
  if (!root) return
  let frame: HTMLIFrameElement | undefined
  let visible = false

  const notifyVisibility = () => {
    // file:// origins are opaque; this message contains only a visibility boolean.
    frame?.contentWindow?.postMessage({ type: 'cloud-paws:visibility', visible }, '*')
  }
  const update = (pageId: string) => {
    visible = pageId === 'cloud-paws-page'
    if (visible && !frame) {
      frame = document.createElement('iframe')
      frame.title = '云端小爪 · 3D 攀登小游戏'
      frame.className = 'cloud-paws-frame'
      frame.src = getCloudPawsUrl(document.baseURI)
      frame.addEventListener('load', notifyVisibility)
      root.append(frame)
    }
    notifyVisibility()
  }
  const unsubscribe = onPageChange(update)
  update(getCurrentPage())
  return () => { unsubscribe(); frame?.remove(); frame = undefined }
}
