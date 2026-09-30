import { getCurrentPage, onPageChange } from './appNavigation'
import './cloudPawsPage.css'
import type { CloudPawsCommand, GameAccountState } from '../electron/gameAccount/types'

/** Resolve against the app document, including file:// installations on both platforms. */
export function getCloudPawsUrl(baseURI: string): string {
  return new URL('./games/cloud-paws/index.html', baseURI).href
}

export function mountCloudPawsPage(): (() => void) | undefined {
  const root = document.querySelector<HTMLElement>('#cloud-paws-root')
  if (!root) return
  let frame: HTMLIFrameElement | undefined
  let visible = false

  const bridge = typeof window !== 'undefined' ? window.electronAPI : undefined
  const post = (message: unknown) => frame?.contentWindow?.postMessage(message, '*')
  const publishAccount = (state?: GameAccountState) => post({ type: 'cloud-paws:account',
    account: state?.account ? { id: String(state.account.userId), name: state.account.nickname || '玩家' } : null,
    available: Boolean(bridge?.gameAccountCloudPawsCommand),
  })
  const notifyAccount = () => { void bridge?.gameAccountGetState?.().then(publishAccount).catch(() => publishAccount()) }
  const onMessage = (event: MessageEvent) => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== new URL(document.baseURI).origin) return
    if (event.data?.type === 'cloud-paws:hello') { notifyAccount(); return }
    if (event.data?.type !== 'cloud-paws:command' || !bridge?.gameAccountCloudPawsCommand) return
    const command = event.data.command as CloudPawsCommand
    void bridge.gameAccountCloudPawsCommand(command).then(result => post({ type: 'cloud-paws:command-result', requestId: command?.requestId, result }))
      .catch(() => post({ type: 'cloud-paws:command-result', requestId: command?.requestId, result: { ok: false, error: { message: '暂时无法连接联机服务' } } }))
  }
  if (typeof window !== 'undefined') window.addEventListener('message', onMessage)
  const offNetwork = bridge?.onCloudPawsEvent?.(event => post({ type: 'cloud-paws:network', event }))
  const offAccount = bridge?.onGameAccountStateChanged?.(publishAccount)
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
      frame.addEventListener('load', () => { notifyAccount(); notifyVisibility() })
      root.append(frame)
    }
    notifyVisibility()
  }
  const unsubscribe = onPageChange(update)
  update(getCurrentPage())
  return () => { unsubscribe(); offNetwork?.(); offAccount?.(); if (typeof window !== 'undefined') window.removeEventListener('message', onMessage); frame?.remove(); frame = undefined }
}
