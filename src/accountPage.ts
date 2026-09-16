import type { AccountResult, GameAccountState, SaveSummary, SyncStatus } from '../electron/gameAccount/types'
import { APP_HOME_PAGE } from './appPages'
import { getCurrentPage, navigateToPage, onPageChange } from './appNavigation'

type AccountView = 'guest' | 'login' | 'register' | 'forgot' | 'change-password'

const syncStatusLabels: Record<SyncStatus, string> = {
  'local-only': '仅本地',
  syncing: '正在同步',
  synced: '已同步',
  'offline-pending': '离线待同步',
  conflict: '需要选择存档',
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

function field(name: string): string {
  return document.querySelector<HTMLInputElement>(`[data-account-field="${name}"]`)?.value.trim() ?? ''
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidPassword(password: string): boolean {
  return password.length >= 8
}

function isValidCode(code: string): boolean {
  return /^\d{6}$/.test(code)
}

function summaryMarkup(summary: SaveSummary, name: string): string {
  const updatedAt = summary.clientUpdatedAt ? new Date(summary.clientUpdatedAt).toLocaleString() : '暂无记录'
  return `
    <article class="account-save-summary">
      <h3>${name}</h3>
      <dl>
        <div><dt>金币</dt><dd>${escapeHtml(summary.coins)}</dd></div>
        <div><dt>农场经验</dt><dd>${escapeHtml(summary.farmTotalXp)}</dd></div>
        <div><dt>捕鱼数量</dt><dd>${escapeHtml(summary.totalCaught)}</dd></div>
        <div><dt>更新时间</dt><dd>${escapeHtml(updatedAt)}</dd></div>
        <div><dt>来源设备</dt><dd>${escapeHtml(summary.sourceDeviceId || '未知设备')}</dd></div>
      </dl>
    </article>
  `
}

function formMessage(message: string | null): string {
  return message ? `<p class="account-message" role="alert">${escapeHtml(message)}</p>` : ''
}

function guestMarkup(message: string | null): string {
  return `
    <section class="account-guest" aria-labelledby="account-guest-title">
      <div>
        <p class="account-kicker">账号与同步</p>
        <h2 id="account-guest-title">本地进度已准备好</h2>
        <p>不注册也可以继续照顾宠物和游玩，进度会保存在这台设备。</p>
      </div>
      <div class="account-status-row">
        <span class="account-status account-status--local-only">仅本地</span>
        <span>当前未登录账号</span>
      </div>
      ${formMessage(message)}
      <div class="account-actions">
        <button class="primary-button account-primary" type="button" data-account-action="show-login">登录账号</button>
        <button class="secondary-button" type="button" data-account-action="show-register">注册账号</button>
        <button class="text-button account-text-action" type="button" data-account-action="continue-guest">先以游客身份继续</button>
      </div>
    </section>
  `
}

function loginMarkup(message: string | null): string {
  return `
    <section class="account-form-shell" aria-labelledby="account-login-title">
      <div class="account-form-heading"><p class="account-kicker">账号与同步</p><h2 id="account-login-title">登录账号</h2><p>登录后可将本机存档同步到你的账号。</p></div>
      <div class="account-form-fields">
        <label class="field"><span>邮箱</span><input data-account-field="email" type="email" autocomplete="email" placeholder="name@example.com" /></label>
        <label class="field"><span>密码</span><input data-account-field="password" type="password" autocomplete="current-password" placeholder="至少 8 位" /></label>
      </div>
      ${formMessage(message)}
      <div class="account-actions">
        <button class="primary-button account-primary" type="button" data-account-action="login">登录</button>
        <button class="text-button account-text-action" type="button" data-account-action="show-forgot">忘记密码</button>
        <button class="text-button account-text-action" type="button" data-account-action="show-register">注册账号</button>
        <button class="text-button account-text-action" type="button" data-account-action="show-guest">返回游客模式</button>
      </div>
    </section>
  `
}

function registerMarkup(message: string | null, countdown: number, sendingCode: boolean): string {
  const codeAction = countdown > 0
    ? `<button class="secondary-button" type="button" data-account-countdown disabled>${countdown} 秒后可重发</button>`
    : sendingCode
      ? '<button class="secondary-button" type="button" disabled>发送中…</button>'
      : '<button class="secondary-button" type="button" data-account-action="send-register-code">发送验证码</button>'
  return `
    <section class="account-form-shell" aria-labelledby="account-register-title">
      <div class="account-form-heading"><p class="account-kicker">账号与同步</p><h2 id="account-register-title">注册账号</h2><p>验证码将发送到邮箱；昵称可稍后修改。</p></div>
      <div class="account-form-fields">
        <label class="field"><span>邮箱</span><input data-account-field="email" type="email" autocomplete="email" placeholder="name@example.com" /></label>
        <div class="account-code-row"><label class="field"><span>六位验证码</span><input data-account-field="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" /></label>${codeAction}</div>
        <label class="field"><span>昵称 <em>可选</em></span><input data-account-field="nickname" maxlength="50" autocomplete="nickname" placeholder="显示名称" /></label>
        <label class="field"><span>密码</span><input data-account-field="password" type="password" autocomplete="new-password" placeholder="至少 8 位" /></label>
      </div>
      ${formMessage(message)}
      <div class="account-actions"><button class="primary-button account-primary" type="button" data-account-action="register">完成注册</button><button class="text-button account-text-action" type="button" data-account-action="show-login">已有账号，去登录</button></div>
    </section>
  `
}

function forgotMarkup(message: string | null, countdown: number, sendingCode: boolean): string {
  const codeAction = countdown > 0
    ? `<button class="secondary-button" type="button" data-account-countdown disabled>${countdown} 秒后可重发</button>`
    : sendingCode
      ? '<button class="secondary-button" type="button" disabled>发送中…</button>'
      : '<button class="secondary-button" type="button" data-account-action="send-reset-code">发送验证码</button>'
  return `
    <section class="account-form-shell" aria-labelledby="account-forgot-title">
      <div class="account-form-heading"><p class="account-kicker">账号与同步</p><h2 id="account-forgot-title">重置密码</h2><p>验证邮箱后设置新密码，其他已登录设备会退出。</p></div>
      <div class="account-form-fields">
        <label class="field"><span>邮箱</span><input data-account-field="email" type="email" autocomplete="email" placeholder="name@example.com" /></label>
        <div class="account-code-row"><label class="field"><span>六位验证码</span><input data-account-field="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" /></label>${codeAction}</div>
        <label class="field"><span>新密码</span><input data-account-field="password" type="password" autocomplete="new-password" placeholder="至少 8 位" /></label>
      </div>
      ${formMessage(message)}
      <div class="account-actions"><button class="primary-button account-primary" type="button" data-account-action="reset-password">重置密码</button><button class="text-button account-text-action" type="button" data-account-action="show-login">返回登录</button></div>
    </section>
  `
}

function authenticatedMarkup(state: GameAccountState, message: string | null, changingPassword: boolean): string {
  const account = state.account!
  const identity = account.nickname || account.email
  const conflict = state.status === 'conflict' && state.conflict
  return `
    <section class="account-dashboard" aria-labelledby="account-dashboard-title">
      <div class="account-identity">
        <div><p class="account-kicker">账号与同步</p><h2 id="account-dashboard-title">${escapeHtml(identity)}</h2><p>${escapeHtml(account.email)}</p>${account.uid ? `<p class="account-uid">UID：${escapeHtml(account.uid)}</p>` : ''}</div>
        <div class="account-status-row"><span class="account-status account-status--${state.status}">${syncStatusLabels[state.status]}</span><span>修订 ${escapeHtml(account.lastRevision)}</span></div>
      </div>
      ${formMessage(message)}
      ${conflict ? `
        <section class="account-conflict" aria-labelledby="account-conflict-title">
          <div><h3 id="account-conflict-title">请选择要保留的存档</h3><p>系统不会自动覆盖任一版本。选择后会保存当前云端历史。</p></div>
          <div class="account-conflict-grid">${summaryMarkup(conflict.local, '本地存档')}${summaryMarkup(conflict.cloud, '云端存档')}</div>
          <div class="account-actions"><button class="primary-button account-primary" type="button" data-account-action="resolve-local">使用本地存档</button><button class="secondary-button" type="button" data-account-action="resolve-cloud">使用云端存档</button></div>
        </section>
      ` : `
        <section class="account-sync-panel">
          <div><h3>存档同步</h3><p>${state.status === 'offline-pending' ? '网络恢复后会继续同步，本地进度不会丢失。' : state.status === 'syncing' ? '正在检查并同步最新进度。' : '本地游戏进度会在合适的时机同步到云端。'}</p></div>
          <button class="secondary-button" type="button" data-account-action="sync-now"${state.status === 'syncing' ? ' disabled' : ''}>立即同步</button>
        </section>
      `}
      <section class="account-security">
        <div><h3>账号安全</h3><p>修改密码后，本设备和其他设备都需要重新登录。</p></div>
        <div class="account-actions"><button class="secondary-button" type="button" data-account-action="show-change-password">修改密码</button><button class="text-button account-danger-action" type="button" data-account-action="logout">退出登录</button></div>
      </section>
      ${changingPassword ? `
        <section class="account-change-password" aria-labelledby="account-change-password-title">
          <h3 id="account-change-password-title">修改密码</h3>
          <div class="account-form-fields"><label class="field"><span>当前密码</span><input data-account-field="old-password" type="password" autocomplete="current-password" /></label><label class="field"><span>新密码</span><input data-account-field="new-password" type="password" autocomplete="new-password" placeholder="至少 8 位" /></label></div>
          <div class="account-actions"><button class="primary-button account-primary" type="button" data-account-action="change-password">确认修改</button><button class="text-button account-text-action" type="button" data-account-action="cancel-change-password">取消</button></div>
        </section>
      ` : ''}
    </section>
  `
}

export function mountAccountPage(): void {
  const root = document.querySelector<HTMLElement>('#account-root')
  if (!root) return

  let state: GameAccountState | null = null
  let view: AccountView = 'guest'
  let message: string | null = null
  let countdown = 0
  let sendingCode = false
  let changingPassword = false
  let loading = false
  const draftFieldNames = ['email', 'code', 'nickname', 'password', 'old-password', 'new-password']
  const draft = new Map<string, string>()
  let countdownTimer: ReturnType<typeof setTimeout> | null = null
  let emailCodeRequestGeneration = 0

  const preserveDraft = () => {
    for (const name of draftFieldNames) {
      const input = root.querySelector<HTMLInputElement>(`[data-account-field="${name}"]`)
      if (input) draft.set(name, input.value)
    }
  }

  const restoreDraft = () => {
    for (const name of draftFieldNames) {
      const input = root.querySelector<HTMLInputElement>(`[data-account-field="${name}"]`)
      if (input) input.value = draft.get(name) ?? ''
    }
  }

  const stopCountdown = () => {
    if (countdownTimer) clearTimeout(countdownTimer)
    countdownTimer = null
  }

  const startCountdown = () => {
    stopCountdown()
    countdown = 60
    const tick = () => {
      countdown = Math.max(0, countdown - 1)
      if (countdown === 0) countdownTimer = null
      const countdownButton = root.querySelector<HTMLButtonElement>('[data-account-countdown]')
      if (countdownButton && countdown > 0) countdownButton.textContent = `${countdown} 秒后可重发`
      else render()
      if (countdown === 0) return
      countdownTimer = setTimeout(tick, 1000)
      ;(countdownTimer as unknown as { unref?: () => void }).unref?.()
    }
    countdownTimer = setTimeout(tick, 1000)
    ;(countdownTimer as unknown as { unref?: () => void }).unref?.()
  }

  const invalidateEmailCodeRequests = () => {
    emailCodeRequestGeneration += 1
  }

  const isCurrentEmailCodeRequest = (generation: number) =>
    generation === emailCodeRequestGeneration && getCurrentPage() === 'account-page'

  const render = () => {
    preserveDraft()
    if (loading && !state) {
      root.innerHTML = '<div class="account-loading" aria-live="polite">正在读取账号状态…</div>'
      return
    }
    if (state?.account) {
      root.innerHTML = authenticatedMarkup(state, message, changingPassword)
      restoreDraft()
      return
    }
    if (view === 'login') root.innerHTML = loginMarkup(message)
    else if (view === 'register') root.innerHTML = registerMarkup(message, countdown, sendingCode)
    else if (view === 'forgot') root.innerHTML = forgotMarkup(message, countdown, sendingCode)
    else root.innerHTML = guestMarkup(message)
    restoreDraft()
  }

  const setState = (next: GameAccountState) => {
    const previousAccount = state?.account
    const sameAccount = previousAccount && next.account && previousAccount.userId === next.account.userId
    if (!sameAccount) {
      for (const name of draftFieldNames) draft.delete(name)
    }
    invalidateEmailCodeRequests()
    stopCountdown()
    countdown = 0
    sendingCode = false
    state = next
    loading = false
    if (!next.account) {
      view = 'guest'
      changingPassword = false
      if (next.error?.code === 'ACCOUNT_BANNED') message = next.error.message
    }
    render()
  }

  const applyResult = (result: AccountResult) => {
    if (result.ok) {
      message = null
      setState(result.data)
      return
    }
    if (result.error.code === 'ACCOUNT_BANNED') {
      state = { account: null, status: 'local-only', conflict: null, error: result.error }
      view = 'guest'
    }
    message = result.error.message
    render()
  }

  const show = (nextView: AccountView) => {
    invalidateEmailCodeRequests()
    view = nextView
    message = null
    countdown = 0
    sendingCode = false
    stopCountdown()
    render()
  }

  const sendCode = async (purpose: 'register' | 'reset_password') => {
    const requestGeneration = ++emailCodeRequestGeneration
    const email = field('email')
    if (!isValidEmail(email)) {
      message = '请输入有效的邮箱地址。'
      render()
      return
    }
    sendingCode = true
    message = null
    render()
    try {
      const result = await window.electronAPI.gameAccountSendEmailCode({ email, purpose })
      if (!isCurrentEmailCodeRequest(requestGeneration)) return
      sendingCode = false
      if (!result.ok) {
        message = result.error.message
        render()
        return
      }
      startCountdown()
      message = '验证码已发送，请查收邮箱。'
      render()
    } catch {
      if (!isCurrentEmailCodeRequest(requestGeneration)) return
      sendingCode = false
      message = '验证码暂时不可用，请稍后重试。'
      render()
    }
  }

  const load = async () => {
    loading = true
    render()
    try {
      setState(await window.electronAPI.gameAccountGetState())
    } catch {
      state = guestState()
      message = '暂时无法读取账号状态，请稍后重试。'
      loading = false
      render()
    }
  }

  const guestState = (): GameAccountState => ({ account: null, status: 'local-only', conflict: null, error: null })

  root.addEventListener('click', (event) => {
    const target = event.target as Element
    const action = (target.closest('[data-account-action]') as HTMLElement | null)?.dataset.accountAction
    if (!action) return
    event.preventDefault()
    if (action === 'show-login') show('login')
    else if (action === 'show-register') show('register')
    else if (action === 'show-forgot') show('forgot')
    else if (action === 'show-guest') show('guest')
    else if (action === 'continue-guest') navigateToPage(APP_HOME_PAGE)
    else if (action === 'send-register-code') void sendCode('register')
    else if (action === 'send-reset-code') void sendCode('reset_password')
    else if (action === 'show-change-password') { changingPassword = true; message = null; render() }
    else if (action === 'cancel-change-password') { changingPassword = false; message = null; render() }
    else if (action === 'sync-now') void window.electronAPI.gameAccountSyncNow().then(applyResult).catch(() => { message = '同步暂时不可用，稍后会自动重试。'; render() })
    else if (action === 'resolve-local') void window.electronAPI.gameAccountResolveConflict('local').then(applyResult).catch(() => { message = '暂时无法选择存档，请稍后重试。'; render() })
    else if (action === 'resolve-cloud') void window.electronAPI.gameAccountResolveConflict('cloud').then(applyResult).catch(() => { message = '暂时无法选择存档，请稍后重试。'; render() })
    else if (action === 'logout') void window.electronAPI.gameAccountLogout().then(applyResult).catch(() => { state = guestState(); message = '已退出当前账号，本地进度仍会保留。'; render() })
    else if (action === 'login') {
      const email = field('email')
      const password = field('password')
      if (!isValidEmail(email) || !isValidPassword(password)) { message = '请输入有效邮箱和至少 8 位密码。'; render(); return }
      void window.electronAPI.gameAccountLogin({ email, password }).then(applyResult).catch(() => { message = '登录暂时不可用，请稍后重试。'; render() })
    } else if (action === 'register') {
      const email = field('email')
      const code = field('code')
      const nickname = field('nickname')
      const password = field('password')
      if (!isValidEmail(email) || !isValidCode(code) || !isValidPassword(password)) { message = '请填写有效邮箱、六位验证码和至少 8 位密码。'; render(); return }
      void window.electronAPI.gameAccountRegister({ email, code, password, ...(nickname ? { nickname } : {}) }).then(applyResult).catch(() => { message = '注册暂时不可用，请稍后重试。'; render() })
    } else if (action === 'reset-password') {
      const email = field('email')
      const code = field('code')
      const newPassword = field('password')
      if (!isValidEmail(email) || !isValidCode(code) || !isValidPassword(newPassword)) { message = '请填写有效邮箱、六位验证码和至少 8 位新密码。'; render(); return }
      void window.electronAPI.gameAccountResetPassword({ email, code, newPassword }).then(applyResult).catch(() => { message = '重置密码暂时不可用，请稍后重试。'; render() })
    } else if (action === 'change-password') {
      const oldPassword = field('old-password')
      const newPassword = field('new-password')
      if (!oldPassword || !isValidPassword(newPassword)) { message = '请输入当前密码和至少 8 位新密码。'; render(); return }
      void window.electronAPI.gameAccountChangePassword({ oldPassword, newPassword }).then(applyResult).catch(() => { message = '修改密码暂时不可用，请稍后重试。'; render() })
    }
  })

  window.electronAPI.onGameAccountStateChanged(setState)
  onPageChange((pageId) => {
    if (pageId === 'account-page') void load()
    else {
      invalidateEmailCodeRequests()
      stopCountdown()
      countdown = 0
      sendingCode = false
    }
  })
  if (getCurrentPage() === 'account-page') void load()
  else render()
}
