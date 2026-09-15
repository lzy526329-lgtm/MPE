export type GameUser = { id: number | string; email: string; nickname: string | null; status: number }
export type GameAccountSession = {
  userId: number | string
  email: string
  nickname: string | null
  token: string
  deviceId: string
  lastRevision: number
  status: number
}
export type EmailCodeRequest = { email: string; purpose: 'register' | 'reset_password' }
export type LoginRequest = { email: string; password: string }
export type RegisterRequest = LoginRequest & { code: string; nickname?: string }
export type ResetPasswordRequest = { email: string; code: string; newPassword: string }
export type ChangePasswordRequest = { oldPassword: string; newPassword: string }
export type Device = { deviceId: string; deviceName: string }
export type AuthResult = { user: GameUser; token: string; expiresAt: string }
export type SaveSummary = { coins: number; farmTotalXp: number; totalCaught: number; clientUpdatedAt: string | null; sourceDeviceId: string }
export type CloudSave = {
  userId: number | string
  payload: string
  schemaVersion: number
  revision: number
  checksum: string
  sourceDeviceId: string
  clientUpdatedAt: string | null
  createdAt: string
  updatedAt: string
}
export type SaveResult = { status: 'empty' | 'synced' | 'conflict'; save: CloudSave | null; summary: SaveSummary | null }
export type SaveUpload = { baseRevision: number; schemaVersion: 2; payload: string; checksum: string; deviceId: string; clientUpdatedAt: string }
export type SaveResolution = ({ choice: 'local' } & SaveUpload) | { choice: 'cloud'; baseRevision: number }
export type SyncStatus = 'local-only' | 'syncing' | 'synced' | 'offline-pending' | 'conflict'
export type AccountError = { code: string; message: string; retryAfterMs?: number }
export type GameAccountState = {
  account: Omit<GameAccountSession, 'token'> | null
  status: SyncStatus
  conflict: { local: SaveSummary; cloud: SaveSummary; cloudRevision: number } | null
  error: AccountError | null
}
export type AccountResult<T = GameAccountState> = { ok: true; data: T } | { ok: false; error: AccountError }
export type GameAccountBridge = {
  gameAccountGetState: () => Promise<GameAccountState>
  gameAccountSendEmailCode: (request: EmailCodeRequest) => Promise<AccountResult<{ email: string; purpose: string }>>
  gameAccountRegister: (request: RegisterRequest) => Promise<AccountResult>
  gameAccountLogin: (request: LoginRequest) => Promise<AccountResult>
  gameAccountLogout: () => Promise<AccountResult>
  gameAccountMe: () => Promise<AccountResult>
  gameAccountChangePassword: (request: ChangePasswordRequest) => Promise<AccountResult>
  gameAccountResetPassword: (request: ResetPasswordRequest) => Promise<AccountResult>
  gameAccountSyncNow: () => Promise<AccountResult>
  gameAccountResolveConflict: (choice: 'local' | 'cloud') => Promise<AccountResult>
  onGameAccountStateChanged: (callback: (state: GameAccountState) => void) => () => void
}
