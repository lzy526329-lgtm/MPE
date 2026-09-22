import { expect, it } from 'vitest'
import type { FriendList, FriendSearchResult } from '../../electron/gameAccount/types'
import { renderFriendPanel } from '../friendPage'

const list: FriendList = {
  friends: [{ id: 7, uid: '123456789', nickname: '好友', remark: '同事小王' }],
  incomingRequests: [{ id: 8, requesterId: 7, recipientId: 42, status: 'pending', user: { id: 7, uid: '123456789', nickname: '好友' } }],
  outgoingRequests: [{ id: 9, requesterId: 42, recipientId: 11, status: 'pending', user: { id: 11, uid: '987654321', nickname: '小王' } }],
}

it('renders the standalone friend page with search, friend list, and request actions', () => {
  const search: FriendSearchResult = { user: { id: 11, uid: '987654321', nickname: '小王' }, relation: 'none' }
  const html = renderFriendPanel({ list, search, loading: false, message: null })

  expect(html).toContain('好友列表')
  expect(html).toContain('输入 9 位 UID')
  expect(html).toContain('data-account-action="send-friend-request"')
  expect(html).toContain('data-account-action="accept-friend"')
  expect(html).toContain('data-account-action="reject-friend"')
  expect(html).toContain('data-account-action="remove-friend"')
  expect(html).toContain('同事小王')
  expect(html).toContain('data-account-action="edit-friend-remark"')
  expect(html).toContain('好友')
  expect(html).toContain('小王')
})

it('renders a realtime online status for friends', () => {
  const html = renderFriendPanel({ list, search: null, loading: false, message: null, onlineUserIds: ['7'] })
  expect(html).toContain('好友在线')
})
