import type { AuthResult, ChangePasswordRequest, Device, EmailCodeRequest, GameUser, LoginRequest, RegisterRequest, ResetPasswordRequest, SaveResolution, SaveResult, SaveUpload } from './types'

export class GameApiError extends Error {
  constructor(public code: string, message: string, public status = 0, public data?: unknown) {
    super(message)
    this.name = 'GameApiError'
  }
}
export type GameTransport = (url: string, options: RequestInit) => Promise<Response>

export function createGameApi(baseUrl: string, transport: GameTransport = fetch) {
  const root = baseUrl.replace(/\/+$/, '') + '/api/game'
  async function request<T>(route: string, method: string, body?: unknown, token?: string): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await transport(root + route, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error',
      })
      const result = await response.json() as { code: string | number; msg: string; data: T }
      if (!response.ok || result.code !== 200) {
        throw new GameApiError(String(result.code || 'SERVICE_UNAVAILABLE'), result.msg || 'Request failed', response.status, result.data)
      }
      return result.data
    } catch (error) {
      if (error instanceof GameApiError) throw error
      throw new GameApiError(controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR', controller.signal.aborted ? 'Request timed out' : 'Unable to reach the game service')
    } finally { clearTimeout(timeout) }
  }
  return {
    sendEmailCode: (input: EmailCodeRequest) => request<{ email: string; purpose: string }>('/auth/email-code', 'POST', input),
    register: (input: RegisterRequest & Device) => request<AuthResult>('/auth/register', 'POST', input),
    login: (input: LoginRequest & Device) => request<AuthResult>('/auth/login', 'POST', input),
    logout: (token: string) => request<Record<string, never>>('/auth/logout', 'POST', undefined, token),
    me: (token: string) => request<{ user: GameUser; save: unknown }>('/auth/me', 'GET', undefined, token),
    changePassword: (token: string, input: ChangePasswordRequest) => request<Record<string, never>>('/auth/change-password', 'POST', input, token),
    resetPassword: (input: ResetPasswordRequest) => request<Record<string, never>>('/auth/reset-password', 'POST', input),
    getSave: (token: string) => request<SaveResult>('/save', 'GET', undefined, token),
    putSave: (token: string, input: SaveUpload) => request<SaveResult>('/save', 'PUT', input, token),
    resolveSave: (token: string, input: SaveResolution) => request<SaveResult>('/save/resolve', 'POST', input, token),
  }
}
export type GameApi = ReturnType<typeof createGameApi>
