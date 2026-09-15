import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { GameAccountSession } from './types'

export type SessionEncryption = {
  isEncryptionAvailable: () => boolean
  encryptString: (text: string) => Buffer
  decryptString: (encrypted: Buffer) => string
  getSelectedStorageBackend?: () => string
}
export type SyncMetadata = { checksum: string | null; pending: boolean }
export function createSessionStore(userDataPath: string, encryption: SessionEncryption) {
  const file = path.join(userDataPath, 'game-account.json')
  let session: GameAccountSession | null = null
  let deviceId = randomUUID()
  let metadata: SyncMetadata = { checksum: null, pending: false }
  const canEncrypt = () => encryption.isEncryptionAvailable() && encryption.getSelectedStorageBackend?.() !== 'basic_text'
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (typeof data.deviceId === 'string' && /^[a-f\d-]{36}$/i.test(data.deviceId)) deviceId = data.deviceId
    const account = data.account
    if (account && (typeof account.userId === 'number' || typeof account.userId === 'string') && typeof account.email === 'string' && Number.isSafeInteger(account.lastRevision) && account.lastRevision >= 0 && typeof data.encryptedToken === 'string' && canEncrypt()) {
      const token = encryption.decryptString(Buffer.from(data.encryptedToken, 'base64'))
      if (token) session = { userId: account.userId, email: account.email, nickname: typeof account.nickname === 'string' ? account.nickname : null, status: Number(account.status), lastRevision: account.lastRevision, deviceId, token }
      if (session) metadata = { checksum: typeof data.sync?.checksum === 'string' ? data.sync.checksum : null, pending: data.sync?.pending === true }
    }
  } catch {
    // An unreadable or undecryptable credential requires a fresh login.
  }
  function persist() {
    fs.mkdirSync(userDataPath, { recursive: true })
    const account = session ? { userId: session.userId, email: session.email, nickname: session.nickname, status: session.status, lastRevision: session.lastRevision } : null
    let encryptedToken: string | undefined
    try {
      if (session && canEncrypt()) encryptedToken = encryption.encryptString(session.token).toString('base64')
    } catch {
      // Encryption failures never permit a plaintext fallback.
    }
    const temporary = `${file}.tmp-${randomUUID()}`
    try {
      fs.writeFileSync(temporary, JSON.stringify({ deviceId, account, encryptedToken, sync: metadata }), { mode: 0o600, flag: 'wx' })
      fs.renameSync(temporary, file)
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
    }
  }
  persist()
  return {
    getDeviceId: () => deviceId,
    getSession: () => session ? { ...session } : null,
    getSyncMetadata: () => ({ ...metadata }),
    setSession(value: GameAccountSession) {
      session = { ...value, deviceId }
      persist()
    },
    setSyncMetadata(value: SyncMetadata) { metadata = { ...value }; persist() },
    clearSession() { session = null; metadata = { checksum: null, pending: false }; persist() },
  }
}
export type SessionStore = ReturnType<typeof createSessionStore>
