import { describe, expect, it, vi } from 'vitest'
import { createGameRealtime } from './realtime'

class FakeSocket {
  static instances: FakeSocket[] = []
  handlers = new Map<string, (payload?: unknown) => void>()
  sent: string[] = []
  closed = false
  constructor(public url: string, public options: unknown) { FakeSocket.instances.push(this) }
  on(event: string, handler: (payload?: unknown) => void) { this.handlers.set(event, handler); return this }
  close() { this.closed = true; this.handlers.get('close')?.() }
  send(payload: string) { this.sent.push(payload) }
  open() { this.handlers.get('open')?.() }
  message(payload: unknown) { this.handlers.get('message')?.(payload) }
}

describe('game realtime client', () => {
  it('connects with the main-process token and forwards presence events', () => {
    FakeSocket.instances = []
    const onEvent = vi.fn()
    const realtime = createGameRealtime({
      url: 'ws://localhost:8088/ws/game',
      getToken: () => 'private-token',
      WebSocketImpl: FakeSocket as never,
      onEvent,
    })

    realtime.start()
    expect(FakeSocket.instances[0].options).toEqual({ headers: { Authorization: 'Bearer private-token' } })
    FakeSocket.instances[0].message(JSON.stringify({ type: 'presence.changed', userId: 7, online: true }))
    expect(onEvent).toHaveBeenCalledWith({ type: 'presence.changed', userId: 7, online: true })
    realtime.refresh()
    expect(JSON.parse(FakeSocket.instances[0].sent[0])).toEqual({ type: 'presence.refresh' })
    realtime.stop()
    expect(FakeSocket.instances[0].closed).toBe(true)
  })

  it('backs off and reconnects after an unexpected close', () => {
    FakeSocket.instances = []
    let retry: (() => void) | undefined
    const realtime = createGameRealtime({
      url: 'ws://localhost:8088/ws/game',
      getToken: () => 'private-token',
      WebSocketImpl: FakeSocket as never,
      setTimeout: (callback) => { retry = callback; return 1 as never },
      clearTimeout: vi.fn(),
    })

    realtime.start()
    FakeSocket.instances[0].open()
    FakeSocket.instances[0].close()
    expect(retry).toBeTypeOf('function')
    retry?.()
    expect(FakeSocket.instances).toHaveLength(2)
  })
})
