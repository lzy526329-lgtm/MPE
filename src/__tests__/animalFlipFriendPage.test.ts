import { afterEach, expect, it, vi } from 'vitest'
import { mountAnimalFlipFriendPage, renderAnimalFlipModeSelector, renderAnimalFlipFriendRoom } from '../animalFlipFriendPage'

it('renders mode selection and login prompt for guest', () => {
  const html = renderAnimalFlipModeSelector(null)
  expect(html).toContain('data-animal-mode="computer"')
  expect(html).toContain('data-animal-mode="friend"')
  expect(html).toContain('选择玩法')
  expect(html).not.toContain('role="tablist"')
  expect(html).not.toContain('animal-flip-board')
  expect(renderAnimalFlipFriendRoom({ account: null, friends: [], room: null, snapshot: null, error: null, busy: false })).toContain('登录后进行好友对战')
})

it('renders room code, deposit and hidden board state', () => {
  const html = renderAnimalFlipFriendRoom({
    account: { userId: 1 },
    friends: [{ id: 2, uid: '123456789', nickname: '好友' }],
    room: { id: 7, code: '123456', state: 'waiting', hostUserId: 1, expiresAt: '', members: [{ userId: 1, side: 'red', ready: false, depositLocked: false }] },
    snapshot: null,
    error: null,
    busy: false,
  })
  expect(html).toContain('123456')
  expect(html).toContain('准备时锁定 10 金币')
  expect(html).toContain('邀请好友')
})

const lobby = {
  account: { userId: 1 }, friends: [{ id: 2, uid: '123456789', nickname: '好友' }],
  room: null, snapshot: null, error: null, busy: false,
}

it('disables invitations until a friend is known to be online', () => {
  const html = renderAnimalFlipFriendRoom(lobby)
  expect(html).toMatch(/data-friend-action="invite"[^>]*disabled/)
  expect(html).toContain('离线')
  expect(html).toContain('暂无在线好友')
})

it('enables invitations for online friends and disables them again after going offline', () => {
  const online = renderAnimalFlipFriendRoom({ ...lobby, onlineUserIds: ['2'] })
  expect(online).not.toMatch(/data-friend-action="invite"[^>]*disabled/)
  expect(online).toContain('在线')
  expect(online).not.toContain('暂无在线好友')
  expect(renderAnimalFlipFriendRoom({ ...lobby, onlineUserIds: [] })).toMatch(/data-friend-action="invite"[^>]*disabled/)
})


afterEach(() => vi.unstubAllGlobals())

it('updates a mounted lobby from presence events and blocks stale offline invitation clicks', async () => {
  const { account, friends } = lobby
  let presence: ((event: import('../../electron/gameAccount/types').GamePresenceEvent) => void) | undefined
  let click: ((event: Event) => void) | undefined
  const unsubscribePresence = vi.fn()
  const createRoom = vi.fn()
  const root = {
    innerHTML: '',
    addEventListener: (_name: string, handler: (event: Event) => void) => { click = handler },
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal('window', {
    setInterval: () => 1, clearInterval: vi.fn(),
    electronAPI: {
      gameAccountGetState: async () => ({ account }),
      gameAccountListFriends: async () => ({ ok: true, data: { friends } }),
      onGameAccountStateChanged: () => () => {}, onAnimalFlipRoomEvent: () => () => {},
      onGameAccountPresenceChanged: (callback: typeof presence) => { presence = callback; return unsubscribePresence },
      gameAccountCreateAnimalFlipRoom: createRoom,
    },
  })
  const { dispose } = mountAnimalFlipFriendPage(root as unknown as HTMLElement)
  try {
    await vi.waitFor(() => expect(root.innerHTML).toContain('好友离线'))
    expect(root.innerHTML).not.toContain('data-animal-mode=')
    expect(root.innerHTML).toContain('data-animal-back')
    presence?.({ type: 'presence.snapshot', onlineUserIds: [2] })
    expect(root.innerHTML).not.toMatch(/data-friend-action="invite"[^>]*disabled/)
    presence?.({ type: 'presence.changed', userId: '2', online: false })
    expect(root.innerHTML).toMatch(/data-friend-action="invite"[^>]*disabled/)
    click?.({ target: { closest: () => ({ dataset: { friendAction: 'invite', friendId: '2' } }) } } as unknown as Event)
    expect(createRoom).not.toHaveBeenCalled()
    expect(root.innerHTML).toContain('好友已离线')
    presence?.({ type: 'presence.changed', userId: 2, online: true })
    expect(root.innerHTML).not.toMatch(/data-friend-action="invite"[^>]*disabled/)
  } finally { dispose() }
  expect(unsubscribePresence).toHaveBeenCalledOnce()
})

function playingRoom(): import('../../electron/gameAccount/types').AnimalFlipRoomResult {
  return {
    room: { id: 8, code: '654321', hostUserId: 1, state: 'playing', expiresAt: '', members: [
      { userId: 1, side: 'red', ready: true, depositLocked: true },
      { userId: 2, side: 'blue', ready: true, depositLocked: true },
    ] },
    snapshot: { board: [{ revealed: true, side: 'red', animal: 'tiger' }, null, ...Array.from({ length: 14 }, () => ({ revealed: false as const }))], turn: 'red', result: 'playing', actionSeq: 4 },
  }
}

it('shows a focused board during play, without preparation or room code', () => {
  const html = renderAnimalFlipFriendRoom({ ...lobby, ...playingRoom() })
  expect(html).toContain('animal-flip-battle')
  expect(html).toContain('轮到你了')
  expect(html).toContain('认输退出')
  expect(html).not.toContain('654321')
  expect(html).not.toContain('准备房间')
  expect(html).not.toContain('已准备')
  expect(html).not.toContain('animal-flip-room-members')
})

it('uses the settled room result even when a forfeit leaves the board unfinished', () => {
  const result = playingRoom()
  result.room.state = 'finished'; result.room.result = 'forfeit'; result.room.winnerUserId = 1
  const html = renderAnimalFlipFriendRoom({ ...lobby, ...result })
  expect(html).toContain('你赢了')
  expect(html).toContain('返回大厅')
  expect(html).not.toContain('轮到你了')
  expect(html).not.toContain('认输退出')
})

it('selects own cards, moves to an adjacent empty cell and blocks further actions on the opponent turn', async () => {
  let click: (event: Event) => void = () => {}
  let poll: () => void = () => {}
  let resolvePoll!: (value: unknown) => void
  const root = { innerHTML: '', addEventListener: (_: string, callback: typeof click) => { click = callback }, removeEventListener: vi.fn() }
  const initial = playingRoom()
  const next = structuredClone(initial)
  next.snapshot!.board[1] = next.snapshot!.board[0]; next.snapshot!.board[0] = null
  next.snapshot!.turn = 'blue'; next.snapshot!.actionSeq++
  const submit = vi.fn(async () => ({ ok: true, data: next }))
  vi.stubGlobal('window', {
    setInterval: (callback: () => void) => { poll = callback; return 1 }, clearInterval: vi.fn(),
    electronAPI: {
      gameAccountGetState: async () => ({ account: lobby.account }),
      gameAccountListFriends: async () => ({ ok: true, data: { friends: lobby.friends } }),
      onGameAccountStateChanged: () => () => {}, onAnimalFlipRoomEvent: () => () => {},
      gameAccountSubscribeAnimalFlipRoom: async () => ({ ok: true, data: {} }),
      gameAccountGetAnimalFlipRoom: () => new Promise(resolve => { resolvePoll = resolve }),
      gameAccountSubmitAnimalFlipAction: submit,
    },
  })
  const page = mountAnimalFlipFriendPage(root as unknown as HTMLElement)
  const tap = (at: number) => click({ target: { closest: () => ({ dataset: { friendCard: String(at) } }) } } as unknown as Event)
  try {
    await vi.waitFor(() => expect(root.innerHTML).toContain('好友列表'))
    page.enterRoom(initial)
    poll() // A delayed pre-action snapshot must not undo the successful move.
    tap(0)
    expect(root.innerHTML).toContain('animal-flip-card--selected')
    expect(root.innerHTML).toMatch(/<button[^>]*data-friend-card="1"[^>]*aria-label="空位，可移动到这里"/)
    tap(1)
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce())
    expect(submit).toHaveBeenCalledWith(8, { type: 'move', from: 0, to: 1 }, 4, expect.any(String))
    await vi.waitFor(() => expect(root.innerHTML).toContain('等待对手'))
    resolvePoll({ ok: true, data: initial })
    await Promise.resolve(); await Promise.resolve()
    expect(root.innerHTML).toContain('等待对手')
    tap(2)
    expect(submit).toHaveBeenCalledOnce()
  } finally { page.dispose() }
})
