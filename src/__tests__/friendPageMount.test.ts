import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FriendList, GameAccountState } from '../../electron/gameAccount/types'

vi.mock('../appNavigation', () => ({
  getCurrentPage: () => 'friend-page',
  navigateToPage: vi.fn(),
  onPageChange: () => () => undefined,
}))

const accountState: GameAccountState = {
  account: {
    userId: 42,
    uid: '123456789',
    email: 'player@example.com',
    nickname: '小明',
    deviceId: 'desktop-1',
    lastRevision: 1,
    status: 1,
  },
  status: 'synced',
  conflict: null,
  error: null,
}

const emptyList: FriendList = { friends: [], incomingRequests: [], outgoingRequests: [] }

class ElementStub {
  constructor(private readonly action: string) {}

  closest(selector: string) {
    return selector === '[data-account-action]'
      ? { dataset: { accountAction: this.action } }
      : null
  }
}

function fakeRoot() {
  let html = ''
  let listener: ((event: { target: unknown; preventDefault: () => void }) => void) | null = null
  const fields = new Map<string, { value: string }>()
  const root = {
    get innerHTML() { return html },
    set innerHTML(value: string) {
      html = value
      for (const name of ['friend-uid']) fields.set(name, { value: '' })
    },
    addEventListener: (_event: string, next: typeof listener) => { listener = next },
    querySelector: (selector: string) => {
      const match = selector.match(/^\[data-account-field="(.+)"\]$/)
      return match ? fields.get(match[1]) ?? null : null
    },
  }
  return {
    root,
    setField(name: string, value: string) { fields.set(name, { value }) },
    click(action: string) { listener?.({ target: new ElementStub(action), preventDefault: () => undefined }) },
  }
}

describe('mounted friend page', () => {
  beforeEach(() => vi.resetModules())

  it('shows a newly sent request in outgoing requests immediately', async () => {
    const dom = fakeRoot()
    const api = {
      gameAccountGetState: vi.fn().mockResolvedValue(accountState),
      gameAccountListFriends: vi.fn().mockResolvedValue({ ok: true, data: emptyList }),
      gameAccountSearchFriend: vi.fn().mockResolvedValue({ ok: true, data: {
        user: { id: 7, uid: '987654321', nickname: '小王' },
        relation: 'none',
      } }),
      gameAccountSendFriendRequest: vi.fn().mockResolvedValue({ ok: true, data: {
        request: { id: 9, requesterId: 42, recipientId: 7, status: 'pending' },
        user: { id: 7, uid: '987654321', nickname: '小王' },
      } }),
      onGameAccountStateChanged: vi.fn(() => () => undefined),
      onGameAccountPresenceChanged: vi.fn(() => () => undefined),
    }
    vi.stubGlobal('document', { querySelector: (selector: string) => selector === '#friend-root' ? dom.root : null })
    vi.stubGlobal('window', { electronAPI: api })

    const { mountFriendPage } = await import('../friendPage')
    mountFriendPage()
    await vi.waitFor(() => expect(dom.root.innerHTML).toContain('好友列表'))

    dom.setField('friend-uid', '987654321')
    dom.click('search-friend')
    await vi.waitFor(() => expect(dom.root.innerHTML).toContain('data-account-action="send-friend-request"'))
    dom.click('send-friend-request')

    await vi.waitFor(() => expect(dom.root.innerHTML).toContain('等待 <strong>小王</strong> 确认'))
  })
})
