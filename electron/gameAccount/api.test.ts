import { afterEach, expect, it, vi } from 'vitest'
import { createGameApi, GameApiError } from './api'
import { getGameApiBaseUrl } from './config'

afterEach(() => vi.useRealTimers())
it('uses the server envelope and sends bearer auth only to the configured API', async () => {
  let received: { url: string; options?: RequestInit } | undefined
  const api = createGameApi('https://game.example', async (url, options) => {
    received = { url: String(url), options }
    return new Response(JSON.stringify({ code: 200, msg: 'success', data: { user: { id: 42 }, save: null } }))
  })
  expect(await api.me('token')).toMatchObject({ user: { id: 42 } })
  expect(received?.url).toBe('https://game.example/api/game/auth/me')
  expect(received?.options?.headers).toMatchObject({ Authorization: 'Bearer token' })
  expect(received?.options?.redirect).toBe('error')
})

it('supports UID friend search, requests, responses, and list retrieval', async () => {
  const calls: Array<{ url: string; options?: RequestInit }> = []
  const api = createGameApi('https://game.example', async (url, options) => {
    calls.push({ url: String(url), options })
    return new Response(JSON.stringify({ code: 200, msg: 'success', data: { friends: [], incomingRequests: [], outgoingRequests: [] } }))
  })
  await api.searchFriend('token', '123456789')
  await api.sendFriendRequest('token', '123456789')
  await api.respondFriendRequest('token', 7, 'accept')
  await api.listFriends('token')
  await api.updateFriendRemark('token', 7, '小王')
  expect(calls.map(call => call.url)).toEqual([
    'https://game.example/api/game/friends/search?uid=123456789',
    'https://game.example/api/game/friends/requests',
    'https://game.example/api/game/friends/requests/7/respond',
    'https://game.example/api/game/friends',
    'https://game.example/api/game/friends/7',
  ])
  expect(JSON.parse(String(calls[1].options?.body))).toEqual({ uid: '123456789' })
  expect(JSON.parse(String(calls[2].options?.body))).toEqual({ action: 'accept' })
  expect(JSON.parse(String(calls[4].options?.body))).toEqual({ remark: '小王' })
})

it('preserves stable error codes and conflict details', async () => {
  const api = createGameApi('https://game.example', async () => new Response(JSON.stringify({
    code: 'SAVE_CONFLICT', msg: 'choose a save', data: { status: 'conflict', save: { revision: 4 } },
  }), { status: 409 }))
  await expect(api.getSave('token')).rejects.toMatchObject({ code: 'SAVE_CONFLICT', status: 409, data: { save: { revision: 4 } } })
})

it('aborts a request after fifteen seconds', async () => {
  vi.useFakeTimers()
  const api = createGameApi('https://game.example', (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
  }))
  const pending = expect(api.me('token')).rejects.toBeInstanceOf(GameApiError)
  await vi.advanceTimersByTimeAsync(15_000)
  await pending
})

it('requires an explicit production API address and permits local development only', () => {
  expect(getGameApiBaseUrl(false, {})).toBe('http://localhost:8088')
  expect(() => getGameApiBaseUrl(true, {})).toThrow('GAME_API_BASE_URL')
  expect(() => getGameApiBaseUrl(true, { GAME_API_BASE_URL: 'http://localhost:8088' })).toThrow()
  expect(getGameApiBaseUrl(true, { GAME_API_BASE_URL: 'https://game.example/' })).toBe('https://game.example')
})

it('exposes animal flip room lifecycle and action endpoints', async () => {
  const calls: Array<{ url: string; method?: string; body?: unknown }> = []
  const api = createGameApi('https://game.example', async (url, options) => {
    calls.push({ url: String(url), method: options?.method, body: options?.body && JSON.parse(String(options.body)) })
    return new Response(JSON.stringify({ code: 200, msg: 'success', data: { room: { id: 7 } } }))
  })
  await api.createAnimalFlipRoom('token', 2, 'r1')
  await api.joinAnimalFlipRoom('token', '123456', 'r2')
  await api.getAnimalFlipRoom('token', 7)
  await api.setAnimalFlipReady('token', 7, true, 'r3')
  await api.submitAnimalFlipAction('token', 7, { type: 'flip', at: 0 }, 0, 'r4')
  expect(calls.map(call => call.url)).toEqual([
    'https://game.example/api/game/animal-flip/rooms',
    'https://game.example/api/game/animal-flip/rooms/join',
    'https://game.example/api/game/animal-flip/rooms/7',
    'https://game.example/api/game/animal-flip/rooms/7/ready',
    'https://game.example/api/game/animal-flip/rooms/7/action',
  ])
  expect(calls[0].body).toEqual({ friendId: 2, requestId: 'r1' })
  expect(calls[4].body).toEqual({ action: { type: 'flip', at: 0 }, actionSeq: 0, requestId: 'r4' })
})
