import { createRequire } from 'node:module'

export type GamePresenceEvent =
  | { type: 'presence.snapshot'; onlineUserIds: Array<number | string> }
  | { type: 'presence.changed'; userId: number | string; online: boolean }

type RealtimeSocket = {
  on: (event: string, listener: (payload?: unknown) => void) => unknown
  send?: (payload: string) => void
  close: () => void
}
type SocketConstructor = new (url: string, options: { headers: Record<string, string> }) => RealtimeSocket
type Timer = ReturnType<typeof setTimeout>

type Options = {
  url: string
  getToken: () => string | null | undefined
  onEvent?: (event: GamePresenceEvent) => void
  onStatus?: (status: 'connecting' | 'connected' | 'disconnected') => void
  WebSocketImpl?: SocketConstructor
  setTimeout?: (callback: () => void, delay: number) => Timer
  clearTimeout?: (timer: Timer) => void
}

function defaultSocket(): SocketConstructor {
  const runtimeRequire = createRequire(import.meta.url)
  const module = runtimeRequire('ws')
  return (module.WebSocket || module) as SocketConstructor
}

function parsePresenceEvent(payload: unknown): GamePresenceEvent | null {
  try {
    const parsed = typeof payload === 'string'
      ? JSON.parse(payload)
      : Buffer.isBuffer(payload)
        ? JSON.parse(payload.toString('utf8'))
        : payload
    if (!parsed || typeof parsed !== 'object') return null
    const event = parsed as Record<string, unknown>
    if (event.type === 'presence.snapshot' && Array.isArray(event.onlineUserIds)) {
      return { type: event.type, onlineUserIds: event.onlineUserIds.filter(id => typeof id === 'string' || typeof id === 'number') as Array<number | string> }
    }
    if (event.type === 'presence.changed' && (typeof event.userId === 'string' || typeof event.userId === 'number') && typeof event.online === 'boolean') {
      return { type: event.type, userId: event.userId, online: event.online }
    }
  } catch { /* Ignore malformed frames from a disconnected peer. */ }
  return null
}

export function createGameRealtime(options: Options) {
  const Socket = options.WebSocketImpl || defaultSocket()
  const schedule = options.setTimeout || ((callback, delay) => setTimeout(callback, delay))
  const cancel = options.clearTimeout || ((timer: Timer) => clearTimeout(timer))
  let stopped = true
  let socket: RealtimeSocket | null = null
  let retryTimer: Timer | undefined
  let retryAttempt = 0

  const clearRetry = () => {
    if (retryTimer !== undefined) cancel(retryTimer)
    retryTimer = undefined
  }

  const scheduleReconnect = () => {
    if (stopped || retryTimer !== undefined || !options.getToken()) return
    const delay = Math.min(30_000, 1_000 * (2 ** Math.min(retryAttempt++, 5)))
    retryTimer = schedule(() => { retryTimer = undefined; connect() }, delay)
  }

  const connect = () => {
    if (stopped || socket) return
    const token = options.getToken()
    if (!token) return
    options.onStatus?.('connecting')
    try {
      const current = new Socket(options.url, { headers: { Authorization: `Bearer ${token}` } })
      socket = current
      current.on('open', () => { retryAttempt = 0; options.onStatus?.('connected') })
      current.on('message', payload => {
        const event = parsePresenceEvent(payload)
        if (event) options.onEvent?.(event)
      })
      current.on('error', () => { /* close drives reconnection */ })
      current.on('close', () => {
        if (socket === current) socket = null
        options.onStatus?.('disconnected')
        scheduleReconnect()
      })
    } catch {
      socket = null
      options.onStatus?.('disconnected')
      scheduleReconnect()
    }
  }

  return {
    start() {
      stopped = false
      clearRetry()
      connect()
    },
    stop() {
      stopped = true
      clearRetry()
      const current = socket
      socket = null
      if (current) current.close()
      options.onStatus?.('disconnected')
    },
    refresh() {
      if (socket?.send) socket.send(JSON.stringify({ type: 'presence.refresh' }))
    },
    isConnected: () => socket !== null,
  }
}

export function getGameWebSocketUrl(baseUrl: string): string {
  const url = new URL(baseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/ws/game`
  url.search = ''
  url.hash = ''
  return url.toString()
}
