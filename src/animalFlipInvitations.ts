import type { AnimalFlipRealtimeEvent, AnimalFlipRoomResult } from '../electron/gameAccount/types'
import { escapeHtml } from './gamePageShared'

type Invitation = Extract<AnimalFlipRealtimeEvent, { type: 'animal_flip.invitation' }>
type Pending = { invitation: Invitation; requestId: string; busy: boolean; error: string | null; timer: number }

export function mountAnimalFlipInvitations(onJoined: (result: AnimalFlipRoomResult) => void, root = document.querySelector<HTMLElement>('#animal-flip-invitations')): () => void {
  if (!root || !window.electronAPI) return () => {}
  const pending = new Map<string, Pending>()
  const render = () => {
    root.hidden = pending.size === 0
    root.innerHTML = [...pending.entries()].map(([key, item]) => `
      <section class="animal-flip-invitation">
        <p class="animal-flip-kicker">象狮虎豹 · 好友邀请</p>
        <p><strong>${escapeHtml(item.invitation.inviter.nickname || '好友')}</strong> 邀请你一起对战</p>
        <p class="animal-flip-invitation-note">房间 ${escapeHtml(item.invitation.code)} · 准备时每人支付 10 金币</p>
        ${item.error ? `<p class="animal-flip-error" role="alert">${escapeHtml(item.error)}</p>` : ''}
        <div class="animal-flip-invitation-actions">
          <button class="primary-button" type="button" data-invite-action="accept" data-invite-room="${escapeHtml(key)}"${item.busy ? ' disabled' : ''}>${item.busy ? '正在加入…' : '进入房间'}</button>
          <button class="text-button" type="button" data-invite-action="dismiss" data-invite-room="${escapeHtml(key)}"${item.busy ? ' disabled' : ''}>暂不接受</button>
        </div>
      </section>`).join('')
  }
  const remove = (key: string) => {
    const item = pending.get(key)
    if (item) window.clearTimeout(item.timer)
    pending.delete(key)
    render()
  }
  const clear = () => {
    for (const item of pending.values()) window.clearTimeout(item.timer)
    pending.clear()
    render()
  }
  const unsubscribeRoom = window.electronAPI.onAnimalFlipRoomEvent(event => {
    const key = String(event.roomId)
    if (event.type === 'animal_flip.cancelled' || event.type === 'animal_flip.finished') { remove(key); return }
    if (event.type !== 'animal_flip.invitation' || pending.has(key)) return
    const remaining = new Date(event.expiresAt).getTime() - Date.now()
    if (!/^\d{6}$/.test(event.code) || !event.inviter || !Number.isFinite(remaining) || remaining <= 0) return
    pending.set(key, { invitation: event, requestId: crypto.randomUUID(), busy: false, error: null,
      timer: window.setTimeout(() => remove(key), Math.min(remaining, 2147483647)),
    })
    render()
  })
  // Account events can also refresh balances, so only clear on logout/account switches.
  let accountId: string | undefined
  let accountVersion = 0
  void window.electronAPI.gameAccountGetState?.().then(state => {
    if (accountVersion === 0) accountId = state.account ? String(state.account.userId) : undefined
  }).catch(() => {})
  const unsubscribeAccount = window.electronAPI.onGameAccountStateChanged(state => {
    accountVersion += 1
    const next = state.account ? String(state.account.userId) : undefined
    if (!next || (accountId !== undefined && next !== accountId)) clear()
    accountId = next
  })
  const onClick = async (event: Event) => {
    const target = (event.target as Element).closest<HTMLElement>('[data-invite-action]')
    const key = target?.dataset.inviteRoom
    const item = key ? pending.get(key) : undefined
    if (!key || !item || item.busy) return
    if (target?.dataset.inviteAction === 'dismiss') { remove(key); return }
    if (target?.dataset.inviteAction !== 'accept') return
    item.busy = true
    item.error = null
    render()
    try {
      const result = await window.electronAPI.gameAccountJoinAnimalFlipRoom(item.invitation.code, item.requestId)
      if (pending.get(key) !== item) return
      if (result.ok) { remove(key); onJoined(result.data) }
      else { item.error = result.error.message; item.busy = false; render() }
    } catch {
      if (pending.get(key) === item) { item.error = '暂时无法加入，请稍后重试。'; item.busy = false; render() }
    }
  }
  root.addEventListener('click', onClick)
  render()
  return () => { unsubscribeRoom(); unsubscribeAccount(); root.removeEventListener('click', onClick); clear() }
}
