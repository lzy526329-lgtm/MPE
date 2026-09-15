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
