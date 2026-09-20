import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountResult, GameAccountState } from '../../electron/gameAccount/types'

const navigation = {
  currentPage: 'account-page',
  listener: null as ((pageId: string) => void) | null,
}

vi.mock('../appNavigation', () => ({
  getCurrentPage: () => navigation.currentPage,
  navigateToPage: (pageId: string) => {
    navigation.currentPage = pageId
    navigation.listener?.(pageId)
  },
  onPageChange: (listener: (pageId: string) => void) => {
    navigation.listener = listener
    return () => undefined
  },
}))

const guestState: GameAccountState = {
  account: null,
  status: 'local-only',
  conflict: null,
  error: null,
}

const signedInState: GameAccountState = {
  account: {
    userId: 42,
    uid: '123456789',
    email: 'player@example.com',
    nickname: '小明',
    deviceId: 'desktop-1',
    lastRevision: 3,
    status: 1,
  },
  status: 'synced',
  conflict: null,
  error: null,
}

class ElementStub {
  constructor(private readonly action?: string) {}

  closest(selector: string) {
    return selector === '[data-account-action]' && this.action
      ? { dataset: { accountAction: this.action } }
      : null
  }
}

type FakeRoot = {
  root: {
    innerHTML: string
    addEventListener: (event: string, listener: (event: { target: unknown; preventDefault: () => void }) => void) => void
    querySelector: (selector: string) => { value: string } | null
  }
  set: (name: string, value: string) => void
  value: (name: string) => string
  renderCount: () => number
  click: (action: string) => void
}

function fakeRoot(): FakeRoot {
  let html = ''
  let renders = 0
  let listener: ((event: { target: unknown; preventDefault: () => void }) => void) | null = null
  let fields = new Map<string, { value: string }>()
  const root = {
    get innerHTML() {
      return html
    },
    set innerHTML(value: string) {
      html = value
      renders += 1
      fields = new Map([...value.matchAll(/data-account-field="([^"]+)"/g)].map((match) => [match[1], { value: '' }]))
    },
    addEventListener: (_event: string, nextListener: (event: { target: unknown; preventDefault: () => void }) => void) => {
      listener = nextListener
    },
    querySelector: (selector: string) => {
      const match = selector.match(/^\[data-account-field="(.+)"\]$/)
      return match ? fields.get(match[1]) ?? null : null
    },
  }
  return {
    root,
    set: (name, value) => fields.set(name, { value }),
    value: (name) => fields.get(name)?.value ?? '',
    renderCount: () => renders,
    click: (action) => listener?.({ target: new ElementStub(action), preventDefault: () => undefined }),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function mount(options: { state?: GameAccountState } = {}) {
  vi.resetModules()
  const dom = fakeRoot()
  const state = options.state ?? guestState
  const accountEvents: { listener: ((next: GameAccountState) => void) | null } = { listener: null }
  const api = {
    gameAccountGetState: vi.fn().mockResolvedValue(state),
    gameAccountSendEmailCode: vi.fn().mockResolvedValue({ ok: true, data: { email: 'player@example.com', purpose: 'register' } }),
    gameAccountRegister: vi.fn().mockResolvedValue({ ok: true, data: signedInState }),
    gameAccountLogin: vi.fn().mockResolvedValue({ ok: true, data: signedInState }),
    gameAccountLogout: vi.fn().mockResolvedValue({ ok: true, data: guestState }),
    gameAccountMe: vi.fn(),
    gameAccountChangePassword: vi.fn().mockResolvedValue({ ok: true, data: guestState }),
    gameAccountResetPassword: vi.fn().mockResolvedValue({ ok: true, data: guestState }),
    gameAccountSyncNow: vi.fn().mockResolvedValue({ ok: true, data: signedInState }),
    gameAccountResolveConflict: vi.fn().mockResolvedValue({ ok: true, data: signedInState }),
    onGameAccountStateChanged: vi.fn((listener: (next: GameAccountState) => void) => {
      accountEvents.listener = listener
      return () => undefined
    }),
  }
  vi.stubGlobal('Element', ElementStub)
  vi.stubGlobal('document', {
    querySelector: (selector: string) => selector === '#account-root' ? dom.root : dom.root.querySelector(selector),
  })
  vi.stubGlobal('window', { electronAPI: api })
  const { mountAccountPage } = await import('../accountPage')
  mountAccountPage()
  await vi.waitFor(() => expect(dom.root.innerHTML).not.toContain('正在读取账号状态'))
  return { dom, api, accountEvents }
}

describe('account page', () => {
  beforeEach(() => {
    navigation.currentPage = 'account-page'
    navigation.listener = null
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('offers guests local play and returns to the home page when continuing locally', async () => {
    const { dom } = await mount()

    expect(dom.root.innerHTML).toContain('先以游客身份继续')
    expect(dom.root.innerHTML).toContain('仅本地')
    dom.click('show-login')
    expect(dom.root.innerHTML).toContain('登录账号')
    dom.click('show-register')
    expect(dom.root.innerHTML).toContain('注册账号')
    dom.click('show-guest')
    dom.click('continue-guest')
    expect(navigation.currentPage).toBe('pet-settings-page')
  })

  it('sends a registration code, shows a countdown, and registers validated fields', async () => {
    const { dom, api } = await mount()
    dom.click('show-register')
    dom.set('email', 'player@example.com')
    dom.click('send-register-code')
    expect(dom.root.innerHTML).toContain('发送中…')
    await vi.waitFor(() => expect(api.gameAccountSendEmailCode).toHaveBeenCalledWith({ email: 'player@example.com', purpose: 'register' }))
    expect(dom.root.innerHTML).toContain('60 秒后可重发')
    expect(dom.value('email')).toBe('player@example.com')

    dom.set('code', '123456')
    dom.set('nickname', '小明')
    dom.set('password', 'Password1')
    dom.click('register')
    await vi.waitFor(() => expect(api.gameAccountRegister).toHaveBeenCalledWith({ email: 'player@example.com', code: '123456', nickname: '小明', password: 'Password1' }))
    expect(dom.root.innerHTML).toContain('player@example.com')
    expect(dom.root.innerHTML).toContain('已同步')
  })

  it('shows a sending indicator immediately while the verification email request is in flight', async () => {
    const pending = deferred<{ ok: true; data: { email: string; purpose: string } }>()
    const { dom, api } = await mount()
    api.gameAccountSendEmailCode.mockReturnValueOnce(pending.promise)
    dom.click('show-register')
    dom.set('email', 'player@example.com')
    dom.click('send-register-code')

    expect(dom.root.innerHTML).toContain('发送中…')
    expect(dom.root.innerHTML).not.toContain('发送验证码')

    pending.resolve({ ok: true, data: { email: 'player@example.com', purpose: 'register' } })
    await vi.waitFor(() => expect(dom.root.innerHTML).toContain('60 秒后可重发'))
  })

  it('clears the resend countdown at zero and stops it while the account page is hidden', async () => {
    vi.useFakeTimers()
    const { dom, api } = await mount()
    dom.click('show-register')
    dom.set('email', 'player@example.com')
    dom.click('send-register-code')
    await vi.waitFor(() => expect(api.gameAccountSendEmailCode).toHaveBeenCalledTimes(1))
    expect(dom.root.innerHTML).toContain('60 秒后可重发')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(dom.root.innerHTML).toContain('发送验证码')
    expect(vi.getTimerCount()).toBe(0)

    dom.click('send-register-code')
    await vi.waitFor(() => expect(api.gameAccountSendEmailCode).toHaveBeenCalledTimes(2))
    const rendersBeforeExit = dom.renderCount()
    navigation.listener?.('pet-settings-page')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(dom.renderCount()).toBe(rendersBeforeExit)

    navigation.listener?.('account-page')
    await vi.runAllTicks()
    dom.click('show-register')
    expect(dom.root.innerHTML).toContain('发送验证码')

    dom.set('email', 'player@example.com')
    dom.click('send-register-code')
    await vi.waitFor(() => expect(api.gameAccountSendEmailCode).toHaveBeenCalledTimes(3))
    dom.set('code', '123456')
    dom.set('password', 'Password1')
    dom.click('register')
    expect(api.gameAccountRegister).not.toHaveBeenCalled()
    expect(dom.root.innerHTML).toContain('请填写邮箱、昵称、六位验证码和至少 8 位密码。')
    dom.set('nickname', '小明')
    dom.click('register')
    await vi.waitFor(() => expect(api.gameAccountRegister).toHaveBeenCalledTimes(1))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores a delayed email-code response after leaving the account page', async () => {
    vi.useFakeTimers()
    const pending = deferred<{ ok: true; data: { email: string; purpose: string } }>()
    const { dom, api } = await mount()
    api.gameAccountSendEmailCode.mockReturnValueOnce(pending.promise)
    dom.click('show-register')
    dom.set('email', 'player@example.com')
    dom.click('send-register-code')
    await vi.waitFor(() => expect(api.gameAccountSendEmailCode).toHaveBeenCalledTimes(1))

    const rendersBeforeExit = dom.renderCount()
    navigation.listener?.('pet-settings-page')
    pending.resolve({ ok: true, data: { email: 'player@example.com', purpose: 'register' } })
    await vi.runAllTicks()

    expect(dom.renderCount()).toBe(rendersBeforeExit)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores a delayed email-code rejection after leaving the account page', async () => {
    vi.useFakeTimers()
    const pending = deferred<{ ok: true; data: { email: string; purpose: string } }>()
    const { dom, api } = await mount()
    api.gameAccountSendEmailCode.mockReturnValueOnce(pending.promise)
    dom.click('show-register')
    dom.set('email', 'player@example.com')
    dom.click('send-register-code')
    await vi.waitFor(() => expect(api.gameAccountSendEmailCode).toHaveBeenCalledTimes(1))

    const rendersBeforeExit = dom.renderCount()
    navigation.listener?.('pet-settings-page')
    pending.reject(new Error('offline'))
    await vi.runAllTicks()

    expect(dom.renderCount()).toBe(rendersBeforeExit)
    expect(dom.root.innerHTML).not.toContain('验证码暂时不可用')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores an older overlapping email-code response', async () => {
    vi.useFakeTimers()
    const first = deferred<{ ok: true; data: { email: string; purpose: string } }>()
    const { dom, api } = await mount()
    api.gameAccountSendEmailCode.mockImplementationOnce(() => first.promise)
    dom.click('show-register')
    dom.set('email', 'player@example.com')
    dom.click('send-register-code')
    await vi.waitFor(() => expect(api.gameAccountSendEmailCode).toHaveBeenCalledTimes(1))

    dom.click('send-register-code')
    await vi.waitFor(() => expect(api.gameAccountSendEmailCode).toHaveBeenCalledTimes(2))
    expect(dom.root.innerHTML).toContain('60 秒后可重发')
    const rendersAfterSecondRequest = dom.renderCount()
    first.resolve({ ok: true, data: { email: 'player@example.com', purpose: 'register' } })
    await vi.runAllTicks()

    expect(dom.renderCount()).toBe(rendersAfterSecondRequest)
    expect(dom.root.innerHTML).toContain('60 秒后可重发')
  })

  it('submits login and password reset only after basic local validation', async () => {
    const { dom, api } = await mount()
    dom.click('show-login')
    dom.set('email', 'player@example.com')
    dom.set('password', 'Password1')
    dom.click('login')
    await vi.waitFor(() => expect(api.gameAccountLogin).toHaveBeenCalledWith({ email: 'player@example.com', password: 'Password1' }))

    const reset = await mount()
    reset.dom.click('show-forgot')
    reset.dom.set('email', 'player@example.com')
    reset.dom.set('code', '123456')
    reset.dom.set('password', 'Password2')
    reset.dom.click('reset-password')
    await vi.waitFor(() => expect(reset.api.gameAccountResetPassword).toHaveBeenCalledWith({ email: 'player@example.com', code: '123456', newPassword: 'Password2' }))
  })

  it('shows account identity and executes sync, password change, and logout actions', async () => {
    const { dom, api } = await mount({ state: signedInState })
    expect(dom.root.innerHTML).toContain('小明')
    expect(dom.root.innerHTML).toContain('已同步')
    dom.click('sync-now')
    await vi.waitFor(() => expect(api.gameAccountSyncNow).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(dom.root.innerHTML).toContain('同步成功'))

    dom.click('show-change-password')
    dom.set('old-password', 'Password1')
    dom.set('new-password', 'Password2')
    dom.click('change-password')
    await vi.waitFor(() => expect(api.gameAccountChangePassword).toHaveBeenCalledWith({ oldPassword: 'Password1', newPassword: 'Password2' }))
    expect(dom.root.innerHTML).toContain('先以游客身份继续')
  })

  it('requires a deliberate local or cloud choice when saves conflict', async () => {
    const conflictState: GameAccountState = {
      ...signedInState,
      status: 'conflict',
      conflict: {
        cloudRevision: 7,
        local: { coins: 21, farmTotalXp: 10, totalCaught: 3, clientUpdatedAt: '2026-09-15T08:00:00.000Z', sourceDeviceId: 'this-device' },
        cloud: { coins: 18, farmTotalXp: 12, totalCaught: 5, clientUpdatedAt: '2026-09-14T08:00:00.000Z', sourceDeviceId: 'other-device' },
      },
    }
    const { dom, api } = await mount({ state: conflictState })
    expect(dom.root.innerHTML).toContain('需要选择存档')
    expect(dom.root.innerHTML).toContain('本地存档')
    expect(dom.root.innerHTML).toContain('云端存档')
    dom.click('resolve-cloud')
    await vi.waitFor(() => expect(api.gameAccountResolveConflict).toHaveBeenCalledWith('cloud'))
  })

  it('shows in-progress, conflict, and failure feedback after manual sync', async () => {
    const conflictState: GameAccountState = {
      ...signedInState,
      status: 'conflict',
      conflict: {
        cloudRevision: 7,
        local: { coins: 21, farmTotalXp: 10, totalCaught: 3, clientUpdatedAt: '2026-09-15T08:00:00.000Z', sourceDeviceId: 'this-device' },
        cloud: { coins: 18, farmTotalXp: 12, totalCaught: 5, clientUpdatedAt: '2026-09-14T08:00:00.000Z', sourceDeviceId: 'other-device' },
      },
    }
    const pending = deferred<AccountResult>()
    const first = await mount({ state: signedInState })
    first.api.gameAccountSyncNow.mockReturnValue(pending.promise)
    first.dom.click('sync-now')
    await vi.waitFor(() => expect(first.dom.root.innerHTML).toContain('正在同步'))
    pending.resolve({ ok: true, data: conflictState })
    await vi.waitFor(() => expect(first.dom.root.innerHTML).toContain('发现存档冲突'))

    const failed = await mount({ state: signedInState })
    failed.api.gameAccountSyncNow.mockResolvedValue({
      ok: true,
      data: { ...signedInState, status: 'offline-pending', error: { code: 'NETWORK_ERROR', message: 'Unable to reach the game service' } },
    })
    failed.dom.click('sync-now')
    await vi.waitFor(() => expect(failed.dom.root.innerHTML).toContain('网络异常'))
    expect(failed.dom.root.innerHTML).toContain('account-message--error')
  })

  it('returns to the guest view with the server ban reason', async () => {
    const { dom, api } = await mount({ state: signedInState })
    api.gameAccountSyncNow.mockResolvedValue({ ok: false, error: { code: 'ACCOUNT_BANNED', message: '因违规行为暂停使用' } })
    dom.click('sync-now')
    await vi.waitFor(() => expect(dom.root.innerHTML).toContain('因违规行为暂停使用'))
    expect(dom.root.innerHTML).toContain('先以游客身份继续')
  })

  it('clears credentials after login, logout, and returning to guest mode', async () => {
    const { dom, accountEvents } = await mount()
    dom.click('show-register')
    dom.set('password', 'secret-password')
    dom.set('code', '123456')
    accountEvents.listener?.(signedInState)
    dom.click('show-change-password')
    dom.set('old-password', 'old-secret')
    dom.set('new-password', 'new-secret')
    accountEvents.listener?.(guestState)
    dom.click('show-register')
    expect(dom.value('password')).toBe('')
    expect(dom.value('code')).toBe('')
    accountEvents.listener?.(signedInState)
    dom.click('show-change-password')
    expect(dom.value('old-password')).toBe('')
    expect(dom.value('new-password')).toBe('')
  })

  it('preserves active change-password inputs across same-account sync state events', async () => {
    const { dom, accountEvents } = await mount({ state: signedInState })
    dom.click('show-change-password')
    dom.set('old-password', 'current-password')
    dom.set('new-password', 'replacement-password')
    accountEvents.listener?.({ ...signedInState, status: 'syncing' })
    expect(dom.value('old-password')).toBe('current-password')
    expect(dom.value('new-password')).toBe('replacement-password')
  })

  it('keeps the active code input node intact while the resend countdown ticks', async () => {
    vi.useFakeTimers()
    const { dom, api } = await mount()
    dom.click('show-register')
    dom.set('email', 'player@example.com')
    dom.click('send-register-code')
    await vi.waitFor(() => expect(api.gameAccountSendEmailCode).toHaveBeenCalledTimes(1))
    const focusedInput = dom.root.querySelector('[data-account-field="code"]')
    vi.stubGlobal('document', { activeElement: focusedInput, querySelector: (selector: string) => dom.root.querySelector(selector) })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(dom.root.querySelector('[data-account-field="code"]')?.value).toBe((document.activeElement as HTMLInputElement | null)?.value)
  })
})
