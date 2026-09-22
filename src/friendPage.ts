import type {
  FriendList,
  FriendSearchResult,
  GamePresenceEvent,
  GameAccountState,
} from '../electron/gameAccount/types'
import { getCurrentPage, navigateToPage, onPageChange } from './appNavigation'

export type FriendPanelState = {
  list: FriendList | null
  search: FriendSearchResult | null
  loading: boolean
  message: string | null
  uidDraft?: string
  editingFriendId?: string | number
  remarkDraft?: string
  onlineUserIds?: Array<number | string>
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]!)
}

function formMessage(message: string | null): string {
  return message
    ? `<p class="account-message account-message--info" role="status">${escapeHtml(message)}</p>`
    : ''
}

export function renderFriendPanel(panel: FriendPanelState): string {
  const list = panel.list
  const search = panel.search
  const friendRows = list?.friends.length
    ? list.friends.map(friend => {
      const editing = panel.editingFriendId !== undefined && String(panel.editingFriendId) === String(friend.id)
      const online = panel.onlineUserIds?.some(id => String(id) === String(friend.id)) === true
      const identity = `<span><strong>${escapeHtml(friend.nickname || '未命名玩家')}</strong><small>UID：${escapeHtml(friend.uid)}</small><small class="account-friend-presence ${online ? 'is-online' : 'is-offline'}">${online ? '好友在线' : '好友离线'}</small>${friend.remark ? `<small class="account-friend-remark">备注：${escapeHtml(friend.remark)}</small>` : ''}</span>`
      const actions = `<span class="account-friend-actions"><button class="text-button" type="button" data-account-action="edit-friend-remark" data-friend-id="${escapeHtml(friend.id)}">${friend.remark ? '修改备注' : '加备注'}</button><button class="text-button account-danger-action" type="button" data-account-action="remove-friend" data-friend-id="${escapeHtml(friend.id)}">删除</button></span>`
      return `<li>${editing ? `<span class="account-friend-remark-editor"><input data-account-field="friend-remark" maxlength="50" value="${escapeHtml(panel.remarkDraft || '')}" placeholder="输入好友备注" /><span><button class="secondary-button" type="button" data-account-action="save-friend-remark" data-friend-id="${escapeHtml(friend.id)}">保存</button><button class="text-button" type="button" data-account-action="cancel-friend-remark">取消</button></span></span>` : `${identity}${actions}`}</li>`
    }).join('')
    : '<li class="account-friend-empty">还没有好友，输入 UID 发出第一条申请。</li>'
  const incomingRows = list?.incomingRequests.length
    ? list.incomingRequests.map(request => `<li><span><strong>${escapeHtml(request.user?.nickname || '玩家')}</strong><small>UID：${escapeHtml(request.user?.uid || '')}</small></span><span class="account-friend-request-actions"><button class="secondary-button" type="button" data-account-action="accept-friend" data-friend-request-id="${escapeHtml(request.id)}">同意</button><button class="text-button" type="button" data-account-action="reject-friend" data-friend-request-id="${escapeHtml(request.id)}">拒绝</button></span></li>`).join('')
    : '<li class="account-friend-empty">暂无新的好友申请。</li>'
  const outgoingRows = list?.outgoingRequests.length
    ? list.outgoingRequests.map(request => `<li><span>等待 <strong>${escapeHtml(request.user?.nickname || '玩家')}</strong> 确认</span></li>`).join('')
    : '<li class="account-friend-empty">暂无发出的申请。</li>'

  return `
    <section class="account-friends" aria-labelledby="account-friends-title">
      <div class="account-friends-heading"><div><h2 id="account-friends-title">好友列表</h2><p>通过 UID 添加好友，双方同意后即可互相访问农场。</p></div><button class="secondary-button" type="button" data-account-action="load-friends"${panel.loading ? ' disabled' : ''}>${panel.loading ? '加载中…' : '刷新'}</button></div>
      <div class="account-friend-search"><input data-account-field="friend-uid" inputmode="numeric" maxlength="9" value="${escapeHtml(panel.uidDraft || '')}" placeholder="输入 9 位 UID" /><button class="secondary-button" type="button" data-account-action="search-friend">搜索</button></div>
      ${search ? `<div class="account-friend-search-result"><span><strong>${escapeHtml(search.user.nickname || '未命名玩家')}</strong><small>UID：${escapeHtml(search.user.uid)}</small></span>${search.relation === 'none' ? '<button class="primary-button" type="button" data-account-action="send-friend-request">加好友</button>' : `<span class="account-friend-relation">${search.relation === 'friend' ? '已是好友' : search.relation === 'incoming' ? '对方已发申请' : '申请已发出'}</span>`}</div>` : ''}
      ${formMessage(panel.message)}
      <div class="account-friend-columns"><div><h4>好友列表</h4><ul>${friendRows}</ul></div><div><h4>收到的申请</h4><ul>${incomingRows}</ul><h4>发出的申请</h4><ul>${outgoingRows}</ul></div></div>
    </section>
  `
}

function loginPrompt(): string {
  return `
    <section class="account-guest" aria-labelledby="friend-login-title">
      <p class="account-kicker">好友</p>
      <h2 id="friend-login-title">登录后添加好友</h2>
      <p>登录账号后，可以通过 UID 添加好友并处理好友申请。</p>
      <div class="account-actions"><button class="primary-button account-primary" type="button" data-account-action="show-login">去登录</button></div>
    </section>
  `
}

export function mountFriendPage(): void {
  const root = document.querySelector<HTMLElement>('#friend-root')
  if (!root) return

  let account: GameAccountState['account'] = null
  let panel: FriendPanelState = { list: null, search: null, loading: false, message: null, uidDraft: '', onlineUserIds: [] }

  const render = () => {
    root.innerHTML = account ? renderFriendPanel(panel) : loginPrompt()
  }

  const refreshFriends = async () => {
    if (!account) return
    panel = { ...panel, loading: true, message: null }
    render()
    try {
      const result = await window.electronAPI.gameAccountListFriends()
      panel = result.ok
        ? { ...panel, list: result.data, loading: false, message: null }
        : { ...panel, loading: false, message: result.error.message }
    } catch {
      panel = { ...panel, loading: false, message: '好友列表暂时不可用，请稍后重试。' }
    }
    render()
  }

  const applyState = (state: GameAccountState) => {
    const changedAccount = account?.userId !== state.account?.userId
    account = state.account
    if (changedAccount) panel = { list: null, search: null, loading: false, message: null, uidDraft: '', onlineUserIds: [] }
    render()
    if (account && getCurrentPage() === 'friend-page' && (changedAccount || !panel.list)) void refreshFriends()
  }

  const load = async () => {
    try {
      applyState(await window.electronAPI.gameAccountGetState())
    } catch {
      account = null
      render()
    }
  }

  root.addEventListener('click', (event) => {
    const target = event.target as Element
    const button = target.closest('[data-account-action]') as HTMLElement | null
    const action = button?.dataset.accountAction
    if (!action) return
    event.preventDefault()

    if (action === 'show-login') {
      navigateToPage('account-page')
      return
    }
    if (!account) return
    if (action === 'load-friends') {
      void refreshFriends()
      return
    }
    if (action === 'search-friend') {
      const input = root.querySelector<HTMLInputElement>('[data-account-field="friend-uid"]')
      const uid = input?.value.trim() || ''
      panel = { ...panel, uidDraft: uid, search: null, message: null }
      if (!/^\d{9}$/.test(uid)) {
        panel.message = '请输入 9 位 UID。'
        render()
        return
      }
      panel.loading = true
      render()
      void window.electronAPI.gameAccountSearchFriend(uid).then(result => {
        panel = result.ok
          ? { ...panel, search: result.data, loading: false }
          : { ...panel, loading: false, message: result.error.message }
        render()
      }).catch(() => {
        panel = { ...panel, loading: false, message: '搜索暂时不可用，请稍后重试。' }
        render()
      })
      return
    }
    if (action === 'send-friend-request') {
      const uid = panel.search?.user.uid
      if (!uid) return
      panel = { ...panel, loading: true }
      render()
      void window.electronAPI.gameAccountSendFriendRequest(uid).then(result => {
        panel = result.ok
          ? { ...panel, loading: false, message: '好友申请已发送。', search: panel.search ? { ...panel.search, relation: 'outgoing' } : null }
          : { ...panel, loading: false, message: result.error.message }
        render()
      }).catch(() => {
        panel = { ...panel, loading: false, message: '申请暂时不可用，请稍后重试。' }
        render()
      })
      return
    }
    if (action === 'edit-friend-remark') {
      const friendId = button?.dataset.friendId
      const friend = panel.list?.friends.find(item => String(item.id) === String(friendId))
      if (!friendId || !friend) return
      panel = { ...panel, editingFriendId: friendId, remarkDraft: friend.remark || '', message: null }
      render()
      return
    }
    if (action === 'cancel-friend-remark') {
      panel = { ...panel, editingFriendId: undefined, remarkDraft: '' }
      render()
      return
    }
    if (action === 'save-friend-remark') {
      const friendId = button?.dataset.friendId
      const input = root.querySelector<HTMLInputElement>('[data-account-field="friend-remark"]')
      const remark = input?.value || ''
      if (!friendId || !window.electronAPI.gameAccountUpdateFriendRemark) return
      panel = { ...panel, loading: true, remarkDraft: remark }
      render()
      void window.electronAPI.gameAccountUpdateFriendRemark(friendId, remark).then(result => {
        if (!result.ok) {
          panel = { ...panel, loading: false, message: result.error.message }
          render()
          return
        }
        panel = { ...panel, loading: false, editingFriendId: undefined, remarkDraft: '', message: '备注已保存。' }
        void refreshFriends()
      }).catch(() => {
        panel = { ...panel, loading: false, message: '保存备注失败，请稍后重试。' }
        render()
      })
      return
    }
    if (action === 'accept-friend' || action === 'reject-friend') {
      const requestId = button?.dataset.friendRequestId
      if (!requestId) return
      void window.electronAPI.gameAccountRespondFriendRequest(requestId, action === 'accept-friend' ? 'accept' : 'reject')
        .then(() => refreshFriends())
        .catch(() => {
          panel = { ...panel, message: '处理好友申请失败，请稍后重试。' }
          render()
        })
      return
    }
    if (action === 'remove-friend') {
      const userId = button?.dataset.friendId
      if (!userId) return
      void window.electronAPI.gameAccountRemoveFriend(userId)
        .then(() => refreshFriends())
        .catch(() => {
          panel = { ...panel, message: '删除好友失败，请稍后重试。' }
          render()
        })
    }
  })

  window.electronAPI.onGameAccountStateChanged(applyState)
  window.electronAPI.onGameAccountPresenceChanged?.((event: GamePresenceEvent) => {
    if (event.type === 'presence.snapshot') panel = { ...panel, onlineUserIds: event.onlineUserIds }
    else {
      const current = new Set((panel.onlineUserIds || []).map(id => String(id)))
      if (event.online) current.add(String(event.userId))
      else current.delete(String(event.userId))
      panel = { ...panel, onlineUserIds: [...current] }
    }
    if (account) render()
  })
  onPageChange((pageId) => {
    if (pageId === 'friend-page') void load()
  })
  if (getCurrentPage() === 'friend-page') void load()
  else render()
}
