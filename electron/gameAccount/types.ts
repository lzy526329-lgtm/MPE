export type GameUser = { id: number | string; uid: string; email: string; nickname: string | null; status: number }
export type GameAccountSession = {
  userId: number | string
  uid: string
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
export type FriendUser = { id: number | string; uid: string; nickname: string | null; remark?: string }
export type FriendRequest = {
  id: number | string
  requesterId: number | string
  recipientId: number | string
  status: 'pending' | 'accepted' | 'rejected' | 'canceled'
  createdAt?: string
  user?: FriendUser
}
export type FriendSearchResult = { user: FriendUser; relation: 'none' | 'incoming' | 'outgoing' | 'friend' }
export type FriendList = { friends: FriendUser[]; incomingRequests: FriendRequest[]; outgoingRequests: FriendRequest[] }

export type AnimalFlipAction =
  | { type: 'flip'; at: number }
  | { type: 'move' | 'attack'; from: number; to: number }
export type AnimalFlipCard = { animal: string; side: 'red' | 'blue'; revealed: true } | { revealed: false } | null
export type AnimalFlipSnapshot = { board: AnimalFlipCard[]; turn: 'red' | 'blue'; result: 'playing' | 'red' | 'blue' | 'draw' | 'forfeit'; actionSeq: number; lastAction?: AnimalFlipAction | null }
export type AnimalFlipRoomMember = { userId: number | string; side: 'red' | 'blue'; ready: boolean; depositLocked: boolean; connected?: boolean; balance?: number; nickname?: string | null }
export type AnimalFlipRoom = { id: number | string; code: string; state: 'waiting' | 'ready' | 'playing' | 'finished' | 'cancelled'; hostUserId: number | string; expiresAt: string; members: AnimalFlipRoomMember[]; result?: string | null; winnerUserId?: number | string | null }
export type AnimalFlipRoomResult = { room: AnimalFlipRoom; snapshot: AnimalFlipSnapshot | null }
export type AnimalFlipRealtimeEvent =
  | { type: 'animal_flip.invitation'; roomId: number | string; code: string; inviter: { userId: number | string; nickname: string | null }; expiresAt: string }
  | { type: 'animal_flip.room_snapshot' | 'animal_flip.state_changed' | 'animal_flip.game_started' | 'animal_flip.finished' | 'animal_flip.cancelled'; roomId: number | string; room: AnimalFlipRoom; snapshot: AnimalFlipSnapshot | null }
  | { type: 'animal_flip.member_changed'; roomId: number | string; room: AnimalFlipRoom }
  | { type: 'animal_flip.error'; roomId?: number | string; code: string; message: string }
export type GamePresenceEvent =
  | { type: 'presence.snapshot'; onlineUserIds: Array<number | string> }
  | { type: 'presence.changed'; userId: number | string; online: boolean }
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
  gameAccountListFriends: () => Promise<AccountResult<FriendList>>
  gameAccountSearchFriend: (uid: string) => Promise<AccountResult<FriendSearchResult>>
  gameAccountSendFriendRequest: (uid: string) => Promise<AccountResult<{ request: FriendRequest; user: FriendUser }>>
  gameAccountRespondFriendRequest: (requestId: number | string, action: 'accept' | 'reject') => Promise<AccountResult<{ status: string; request: FriendRequest }>>
  gameAccountRemoveFriend: (userId: number | string) => Promise<AccountResult<Record<string, never>>>
  gameAccountUpdateFriendRemark: (userId: number | string, remark: string) => Promise<AccountResult<{ remark: string }>>
  gameAccountCreateAnimalFlipRoom: (friendId: number | string, requestId?: string) => Promise<AccountResult<AnimalFlipRoomResult>>
  gameAccountJoinAnimalFlipRoom: (code: string, requestId?: string) => Promise<AccountResult<AnimalFlipRoomResult>>
  gameAccountGetAnimalFlipRoom: (roomId: number | string) => Promise<AccountResult<AnimalFlipRoomResult>>
  gameAccountSetAnimalFlipReady: (roomId: number | string, ready: boolean, requestId?: string) => Promise<AccountResult<AnimalFlipRoomResult>>
  gameAccountLeaveAnimalFlipRoom: (roomId: number | string, requestId?: string) => Promise<AccountResult<AnimalFlipRoomResult>>
  gameAccountRecoverAnimalFlipRoom: (roomId: number | string, requestId?: string) => Promise<AccountResult<AnimalFlipRoomResult>>
  gameAccountSubmitAnimalFlipAction: (roomId: number | string, action: AnimalFlipAction, actionSeq: number, requestId: string) => Promise<AccountResult<AnimalFlipRoomResult>>
  gameAccountSubscribeAnimalFlipRoom: (roomId: number | string) => Promise<AccountResult<Record<string, never>>>
  onAnimalFlipRoomEvent: (callback: (event: AnimalFlipRealtimeEvent) => void) => () => void
  onGameAccountStateChanged: (callback: (state: GameAccountState) => void) => () => void
  onGameAccountPresenceChanged?: (callback: (event: GamePresenceEvent) => void) => () => void
}
