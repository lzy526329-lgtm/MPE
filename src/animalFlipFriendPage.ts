import type { AccountResult, AnimalFlipAction, AnimalFlipRealtimeEvent, AnimalFlipRoom, AnimalFlipRoomMember, AnimalFlipRoomResult, AnimalFlipSnapshot, FriendUser, GamePresenceEvent } from '../electron/gameAccount/types'
import { animalCardImage, ANIMAL_CARD_BACK } from './animalFlipAssets'
import { ANIMAL_NAMES, animalNeighbors, animalCanCapture, type Animal } from './animalFlipEngine'
import { escapeHtml } from './gamePageShared'
import './animalFlip.css'
import { navigateToPage } from './appNavigation'

type FriendAccount = { userId: number | string; nickname?: string | null; uid?: string }
type FriendModel = { account: FriendAccount | null; friends: FriendUser[]; room: AnimalFlipRoom | null; snapshot: AnimalFlipSnapshot | null; error: string | null; busy: boolean; selected?: number | null; onlineUserIds?: Array<number | string> }

export function renderAnimalFlipModeSelector(account: FriendAccount | null): string {
  return `<section class="animal-flip-menu" aria-label="选择玩法">
    <p class="animal-flip-kicker">童年翻牌游戏</p>
    <h1>象狮虎豹</h1>
    <p class="animal-flip-menu-intro">选择玩法，开始一局对战</p>
    <div class="animal-flip-mode-choices">
      <button class="animal-flip-mode-choice" type="button" data-animal-mode="computer">
        <span class="animal-flip-choice-art" aria-hidden="true"><img src="${animalCardImage('tiger', 'red')}" alt="" /></span>
        <strong>人机对战</strong><span>随时开局，和电脑切磋</span><span class="animal-flip-choice-enter">进入对战 →</span>
      </button>
      <button class="animal-flip-mode-choice animal-flip-mode-choice--friend" type="button" data-animal-mode="friend">
        <span class="animal-flip-choice-art" aria-hidden="true"><img src="${animalCardImage('lion', 'blue')}" alt="" /></span>
        <strong>好友对战</strong><span>邀请在线好友，或通过房间码加入</span><span class="animal-flip-choice-enter">进入房间 →</span>
      </button>
    </div>
    <p class="animal-flip-menu-note">好友对战每人 10 金币，胜者获得 20 金币</p>
    ${account ? `<p class="animal-flip-menu-account">已登录：${escapeHtml(account.nickname || account.uid || '')}</p>` : ''}
  </section>`
}

function memberName(member: AnimalFlipRoomMember, friends: FriendUser[]): string {
  return friends.find(friend => String(friend.id) === String(member.userId))?.nickname || member.nickname || `玩家 ${member.userId}`
}
function mySide(model: FriendModel) {
  return model.room?.members.find(member => String(member.userId) === String(model.account?.userId))?.side
}
function canPlay(model: FriendModel): boolean {
  return !model.busy && model.room?.state === 'playing' && model.snapshot?.result === 'playing' && model.snapshot.turn === mySide(model)
}
function canMoveTo(model: FriendModel, at: number): boolean {
  if (!canPlay(model) || model.selected == null || !model.snapshot || !animalNeighbors(model.selected).includes(at)) return false
  const source = model.snapshot.board[model.selected]
  const target = model.snapshot.board[at]
  return !!source?.revealed && source.side === mySide(model) && (!target || (target.revealed && target.side !== source.side && animalCanCapture(source.animal as Animal, target.animal as Animal)))
}
function cardMarkup(card: AnimalFlipSnapshot['board'][number], at: number, model: FriendModel): string {
  const target = canMoveTo(model, at)
  const selected = model.selected === at
  const enabled = canPlay(model) && (target || !!card && (!card.revealed || card.side === mySide(model)))
  const kind = !card ? 'empty' : card.revealed ? card.side : 'hidden'
  const label = !card ? `空位${target ? '，可移动到这里' : ''}` : card.revealed ? `${card.side === 'red' ? '红方' : '蓝方'}${ANIMAL_NAMES[card.animal as Animal]}` : '暗牌'
  const image = !card ? '' : `<img src="${card.revealed ? animalCardImage(card.animal as Animal, card.side) : ANIMAL_CARD_BACK}" alt="" draggable="false" />`
  return `<button class="animal-flip-card animal-flip-card--${kind}${selected ? ' animal-flip-card--selected' : ''}${target ? ' animal-flip-card--target' : ''}" type="button" data-friend-card="${at}" aria-label="${label}" aria-pressed="${selected}"${enabled ? '' : ' disabled'}>${image}${target && !card ? '<span class="animal-flip-move-dot" aria-hidden="true"></span>' : ''}</button>`
}
function roomControls(model: FriendModel): string {
  const room = model.room
  if (!room) {
    const onlineIds = new Set((model.onlineUserIds || []).map(String))
    const hasOnlineFriends = model.friends.some(friend => onlineIds.has(String(friend.id)))
    const friends = model.friends.length ? model.friends.map(friend => {
      const online = onlineIds.has(String(friend.id))
      return `<li><span><strong>${escapeHtml(friend.nickname || '未命名玩家')}</strong><small>UID：${escapeHtml(friend.uid)} · ${online ? '在线' : '离线'}</small></span><button class="secondary-button" type="button" data-friend-action="invite" data-friend-id="${escapeHtml(String(friend.id))}"${!online || model.busy ? ' disabled' : ''}>${online ? '邀请好友' : '好友离线'}</button></li>`
    }).join('') : '<li class="animal-flip-empty">暂无好友，请先在好友页添加。</li>'
    return `<div class="animal-flip-friend-lobby"><div class="animal-flip-friend-code"><label>输入 6 位房间码<input data-friend-field="room-code" inputmode="numeric" maxlength="6" placeholder="123456" /></label><button class="secondary-button" type="button" data-friend-action="join">加入房间</button></div><h3>好友列表</h3>${!hasOnlineFriends ? '<p role="status">暂无在线好友，等好友上线后再邀请。</p>' : ''}<ul>${friends}</ul></div>`
  }
  const members = room.members.map(member => `<li><span><strong>${escapeHtml(memberName(member, model.friends))}</strong><small>${member.side === 'red' ? '红方' : '蓝方'} · ${member.ready ? '已准备' : '未准备'}${member.depositLocked ? ' · 已锁定 10 金币' : ''}</small></span></li>`).join('')
  const current = model.account && room.members.find(member => String(member.userId) === String(model.account?.userId))
  return `<div class="animal-flip-friend-room"><div class="animal-flip-room-code"><span>房间码</span><strong>${escapeHtml(room.code)}</strong><small>准备时锁定 10 金币，胜者获得 20 金币；邀请好友加入或分享房间码</small></div><ul class="animal-flip-room-members">${members}</ul>${room.state === 'waiting' || room.state === 'ready' ? `<button class="primary-button" type="button" data-friend-action="ready"${model.busy ? ' disabled' : ''}>${current?.ready ? '取消准备' : '准备对战'}</button>` : ''}<button class="text-button" type="button" data-friend-action="leave">退出房间</button></div>`
}

export function renderAnimalFlipFriendRoom(model: FriendModel): string {
  if (!model.account) return `<section class="animal-flip-friend-panel"><p class="animal-flip-kicker">好友对战</p><h2>登录后进行好友对战</h2><p>好友对战需要登录账号，并从服务端扣除 10 金币作为押金。</p><button class="primary-button" type="button" data-friend-action="login">去登录</button></section>`
  const error = model.error ? `<p class="animal-flip-error" role="alert">${escapeHtml(model.error)}</p>` : ''
  if (model.room && ['playing', 'finished', 'cancelled'].includes(model.room.state)) {
    const playing = model.room.state === 'playing'
    const won = String(model.room.winnerUserId) === String(model.account.userId)
    const draw = model.room.result === 'draw'
    const cancelled = model.room.state === 'cancelled'
    const status = playing ? canPlay({ ...model, busy: false }) ? '轮到你了' : '等待对手' : cancelled ? '房间已结束' : draw ? '本局和棋' : won ? '你赢了！' : '本局落败'
    const hint = playing ? model.busy ? '正在同步…' : canPlay(model) ? model.selected != null ? '点击标记位置移动或吃牌，再点选中的牌取消。' : '翻开一张暗牌，或选择己方明牌移动。' : '对手正在行动，请稍候。' : cancelled || draw ? '已退回准备时锁定的金币。' : won ? '获得 20 金币，已完成结算。' : '本局 10 金币已结算给对手。'
    const player = (side: 'red' | 'blue') => {
      const member = model.room!.members.find(item => item.side === side)
      const name = member && String(member.userId) === String(model.account!.userId) ? '你' : member ? memberName(member, model.friends) : '对手'
      return `<span class="animal-flip-battle-player animal-flip-battle-player--${side}"><i aria-hidden="true"></i><strong>${escapeHtml(name)}</strong><small>${side === 'red' ? '红方' : '蓝方'}</small></span>`
    }
    return `<section class="animal-flip-battle" aria-label="好友对战">
      <header class="animal-flip-battle-header"><h2>好友对战</h2><button class="text-button" type="button" data-friend-action="leave"${model.busy ? ' disabled' : ''}>${playing ? '认输退出' : '返回大厅'}</button></header>
      <div class="animal-flip-scorebar">${player('red')}<span class="animal-flip-turn${playing ? '' : ' animal-flip-status--result'}" role="status">${status}</span>${player('blue')}</div>
      ${error}<div class="animal-flip-table">${model.snapshot ? `<div class="animal-flip-board" role="group" aria-label="好友对战棋盘">${model.snapshot.board.map((card, at) => cardMarkup(card, at, model)).join('')}</div>` : ''}<p class="animal-flip-hint" role="status">${hint}</p></div>
    </section>`
  }
  return `<section class="animal-flip-friend-panel"><div class="animal-flip-friend-heading"><div><p class="animal-flip-kicker">好友对战</p><h2>${model.room ? '准备房间' : '邀请好友'}</h2></div>${model.busy ? '<span class="animal-flip-network-status">连接中…</span>' : ''}</div>${error}${roomControls(model)}</section>`
}

export function mountAnimalFlipFriendPage(root: HTMLElement): { dispose: () => void; enterRoom: (result: AnimalFlipRoomResult) => void } {
  let model: FriendModel = { account: null, friends: [], room: null, snapshot: null, error: null, busy: true, selected: null }
  let unsubscribePresence = () => {}; let unsubscribeState = () => {}; let unsubscribeRoom = () => {}; let pollTimer: number | undefined
  let revision = 0; let polling = false; let disposed = false
  const render = () => {
    if (disposed) return
    root.innerHTML = `${model.room && ['playing', 'finished', 'cancelled'].includes(model.room.state) ? '' : '<button class="text-button animal-flip-back" type="button" data-animal-back>← 返回玩法选择</button>'}${renderAnimalFlipFriendRoom(model)}`
  }
  const acceptRoom = (result: AnimalFlipRoomResult) => {
    if (String(model.room?.id) === String(result.room.id)) {
      if ((result.snapshot?.actionSeq ?? -1) < (model.snapshot?.actionSeq ?? -1)) return
      if (['finished', 'cancelled'].includes(model.room!.state) && !['finished', 'cancelled'].includes(result.room.state)) return
    }
    const changed = model.snapshot?.actionSeq !== result.snapshot?.actionSeq || model.room?.state !== result.room.state
    model = { ...model, room: result.room, snapshot: result.snapshot, selected: changed ? null : model.selected }
  }
  const enterRoom = (result: AnimalFlipRoomResult) => {
    revision++
    model = { ...model, room: result.room, snapshot: result.snapshot, selected: null, busy: false, error: null }
    void window.electronAPI.gameAccountSubscribeAnimalFlipRoom(result.room.id).catch(() => {})
    render()
  }
  const refreshRoom = async () => {
    if (!model.room || polling || model.busy || disposed) return
    const roomId = model.room.id; const startedAt = revision
    polling = true
    try {
      const result = await window.electronAPI.gameAccountGetAnimalFlipRoom(roomId)
      if (disposed || revision !== startedAt || String(model.room?.id) !== String(roomId)) return
      if (result.ok) acceptRoom(result.data)
      else model.error = result.error.message
      render()
    } catch { if (revision === startedAt && !disposed) { model.error = '连接暂时中断，正在重试…'; render() } }
    finally { polling = false }
  }
  const runRequest = async (request: () => Promise<AccountResult<AnimalFlipRoomResult>>, leave = false) => {
    const startedAt = ++revision
    model.busy = true; model.error = null; render()
    try {
      const result = await request()
      if (disposed || revision !== startedAt) return
      if (result.ok) {
        if (leave) model = { ...model, room: null, snapshot: null, selected: null }
        else { acceptRoom(result.data); model.selected = null }
      } else model.error = result.error.message
    } catch { if (revision === startedAt) model.error = '连接失败，请稍后重试。' }
    finally { if (revision === startedAt && !disposed) { model.busy = false; render(); if (model.error) void refreshRoom() } }
  }
  const load = async () => {
    const accountState = await window.electronAPI.gameAccountGetState()
    model.account = accountState.account ? { userId: accountState.account.userId, nickname: accountState.account.nickname, uid: accountState.account.uid } : null
    if (model.account) {
      const friends = await window.electronAPI.gameAccountListFriends()
      if (friends.ok) model.friends = friends.data.friends
    }
    model.busy = false; render()
  }
  const applyPresence = (event: GamePresenceEvent) => {
    if (event.type === 'presence.snapshot') model.onlineUserIds = event.onlineUserIds
    else {
      const ids = new Set((model.onlineUserIds || []).map(String))
      if (event.online) ids.add(String(event.userId))
      else ids.delete(String(event.userId))
      model.onlineUserIds = [...ids]
    }
    if (!model.room) render()
  }
  const applyRoomEvent = (event: AnimalFlipRealtimeEvent) => {
    if (!model.room || String(event.roomId) !== String(model.room.id)) return
    // The request response owns busy state; realtime updates may arrive first.
    if (!model.busy) revision++
    if (event.type === 'animal_flip.error') { model.error = event.message; render(); return }
    if ('room' in event) { acceptRoom({ room: event.room, snapshot: 'snapshot' in event ? event.snapshot : model.snapshot }); render() }
  }
  const onClick = (event: Event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-friend-action], [data-friend-card]')
    if (!target) return
    const action = target.dataset.friendAction
    if (action === 'login') { navigateToPage('account-page'); return }
    if (!model.account || model.busy) return
    if (action === 'invite') {
      const friendId = target.dataset.friendId
      if (!model.friends.some(friend => String(friend.id) === friendId) || !(model.onlineUserIds || []).some(id => String(id) === friendId)) {
        model.error = '好友已离线，请等好友上线后再邀请。'
        render()
        return
      }
      model.busy = true; model.error = null; render(); void window.electronAPI.gameAccountCreateAnimalFlipRoom(target.dataset.friendId || '', crypto.randomUUID()).then(result => { if (result.ok) enterRoom(result.data); else { model = { ...model, busy: false, error: result.error.message }; render() } }).catch(() => { model.busy = false; model.error = '暂时无法邀请，请稍后重试。'; render() }); return
    }
    if (action === 'join') {
      const code = root.querySelector<HTMLInputElement>('[data-friend-field="room-code"]')?.value.trim() || ''
      model.busy = true; model.error = null; render(); void window.electronAPI.gameAccountJoinAnimalFlipRoom(code, crypto.randomUUID()).then(result => { if (result.ok) enterRoom(result.data); else { model = { ...model, busy: false, error: result.error.message }; render() } }).catch(() => { model.busy = false; model.error = '暂时无法加入，请稍后重试。'; render() }); return
    }
    if (action === 'ready' && model.room) {
      const roomId = model.room.id
      const me = model.room.members.find(member => String(member.userId) === String(model.account?.userId))
      void runRequest(() => window.electronAPI.gameAccountSetAnimalFlipReady(roomId, !me?.ready, crypto.randomUUID())); return
    }
    if (action === 'leave' && model.room) {
      if (model.room.state === 'playing' && !window.confirm('确定认输退出吗？本局 10 金币将结算给对手。')) return
      const roomId = model.room.id
      void runRequest(() => window.electronAPI.gameAccountLeaveAnimalFlipRoom(roomId, crypto.randomUUID()), true); return
    }
    if (target.dataset.friendCard !== undefined && model.room && model.snapshot && canPlay(model)) {
      const at = Number(target.dataset.friendCard)
      if (!Number.isInteger(at) || at < 0 || at >= model.snapshot.board.length) return
      const card = model.snapshot.board[at]; let nextAction: AnimalFlipAction | null = null
      if (canMoveTo(model, at)) nextAction = { type: 'move', from: model.selected!, to: at }
      else if (card?.revealed && card.side === mySide(model)) model.selected = model.selected === at ? null : at
      else if (card && !card.revealed) nextAction = { type: 'flip', at }
      if (!nextAction) { render(); return }
      const roomId = model.room.id; const seq = model.snapshot.actionSeq; const move = nextAction
      void runRequest(() => window.electronAPI.gameAccountSubmitAnimalFlipAction(roomId, move, seq, crypto.randomUUID()))
    }
  }

  unsubscribePresence = window.electronAPI.onGameAccountPresenceChanged?.(applyPresence) || (() => {})
  root.addEventListener('click', onClick); unsubscribeRoom = window.electronAPI.onAnimalFlipRoomEvent(applyRoomEvent); pollTimer = window.setInterval(() => { if (model.room && !model.busy) void refreshRoom() }, 2000); unsubscribeState = window.electronAPI.onGameAccountStateChanged(state => { if (String(model.account?.userId) !== String(state.account?.userId)) { revision++; model.onlineUserIds = []; model.friends = []; model.room = null; model.snapshot = null; model.selected = null; model.busy = false }; model.account = state.account ? { userId: state.account.userId, nickname: state.account.nickname, uid: state.account.uid } : null; render() }); void load(); render()
  return { enterRoom, dispose: () => { disposed = true; revision++; root.removeEventListener('click', onClick); unsubscribeState(); unsubscribeRoom(); unsubscribePresence(); if (pollTimer !== undefined) window.clearInterval(pollTimer) } }
}
