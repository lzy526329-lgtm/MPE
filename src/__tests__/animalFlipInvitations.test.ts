import { afterEach, expect, it, vi } from 'vitest'
import { mountAnimalFlipInvitations } from '../animalFlipInvitations'
import type { AnimalFlipRealtimeEvent, AnimalFlipRoomResult, GameAccountState } from '../../electron/gameAccount/types'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function fixture() {
  vi.useFakeTimers()
  let receive: (event: AnimalFlipRealtimeEvent) => void = () => {}
  let accountChanged: (state: GameAccountState) => void = () => {}
  let click: (event: Event) => void = () => {}
  let opened: AnimalFlipRoomResult | undefined
  const root = { innerHTML: '', hidden: true, addEventListener: (_: string, handler: typeof click) => { click = handler }, removeEventListener() {} }
  const join = vi.fn()
  vi.stubGlobal('window', { setTimeout, clearTimeout, electronAPI: {
    onAnimalFlipRoomEvent: (handler: typeof receive) => { receive = handler; return () => {} },
    onGameAccountStateChanged: (handler: typeof accountChanged) => { accountChanged = handler; return () => {} },
    gameAccountJoinAnimalFlipRoom: join,
  } })
  const dispose = mountAnimalFlipInvitations(result => { opened = result }, root as unknown as HTMLElement)
  const invite = { type: 'animal_flip.invitation' as const, roomId: 7, code: '123456', inviter: { userId: 1, nickname: '<红方>' }, expiresAt: new Date(Date.now() + 60000).toISOString() }
  const tap = (action: string) => click({ target: { closest: () => ({ dataset: { inviteRoom: '7', inviteAction: action } }) } } as unknown as Event)
  return { root, join, dispose, invite, receive: (event: AnimalFlipRealtimeEvent) => receive(event), accountChanged: () => accountChanged({ account: null } as GameAccountState), tap, opened: () => opened }
}

it('shows an invitation outside the game page and opens the returned room only after acceptance', async () => {
  const f = fixture()
  const room = { room: { id: 7 }, snapshot: null }
  f.join.mockResolvedValue({ ok: true, data: room })
  f.receive(f.invite)
  f.receive(f.invite)
  expect(f.root.hidden).toBe(false)
  expect(f.root.innerHTML).toContain('&lt;红方&gt;')
  expect(f.root.innerHTML.match(/data-invite-action="accept"/g)).toHaveLength(1)
  expect(f.join).not.toHaveBeenCalled()
  f.tap('accept')
  f.tap('accept')
  await vi.advanceTimersByTimeAsync(0)
  expect(f.join).toHaveBeenCalledOnce()
  expect(f.join).toHaveBeenCalledWith('123456', expect.any(String))
  expect(f.opened()).toEqual(room)
  expect(f.root.hidden).toBe(true)
  f.dispose()
})

it('allows dismissal and expiry without joining a room', async () => {
  const f = fixture()
  f.receive(f.invite)
  f.tap('dismiss')
  expect(f.root.hidden).toBe(true)
  f.receive({ ...f.invite, roomId: 8 })
  await vi.advanceTimersByTimeAsync(60001)
  expect(f.root.hidden).toBe(true)
  expect(f.join).not.toHaveBeenCalled()
  f.dispose()
})

it('keeps a failed invitation visible and ignores a pending response after account changes', async () => {
  const f = fixture()
  f.join.mockResolvedValueOnce({ ok: false, error: { message: '房间已满' } })
  f.receive(f.invite)
  f.tap('accept')
  await vi.advanceTimersByTimeAsync(0)
  expect(f.root.innerHTML).toContain('房间已满')
  expect(f.opened()).toBeUndefined()
  let complete!: (value: unknown) => void
  f.join.mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
  f.tap('accept')
  f.accountChanged()
  complete({ ok: true, data: { room: { id: 7 }, snapshot: null } })
  await vi.advanceTimersByTimeAsync(0)
  expect(f.root.hidden).toBe(true)
  expect(f.opened()).toBeUndefined()
  f.dispose()
})
