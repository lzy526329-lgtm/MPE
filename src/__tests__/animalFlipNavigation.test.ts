import { afterEach, expect, it, vi } from 'vitest'
import { mountAnimalFlipPage } from '../animalFlipPage'
import { onPageChange } from '../appNavigation'

vi.mock('../appNavigation', () => ({
  getCurrentPage: () => 'animal-flip-page',
  onPageChange: vi.fn(),
  navigateToPage: vi.fn(),
}))

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })

it('enters through the menu and keeps delayed updates isolated from the visible screen', async () => {
  vi.useFakeTimers()
  const screens = Object.fromEntries(['menu', 'computer', 'friend'].map(name => [name, {
    innerHTML: '', hidden: name !== 'menu', addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }]))
  let click: (event: Event) => void = () => {}
  const root = {
    innerHTML: '',
    querySelector: (selector: string) => screens[selector.match(/"(.*?)"/)![1]],
    addEventListener: (_name: string, callback: typeof click) => { click = callback },
  }
  type AccountState = { account: { userId: number; nickname: string } | null }
  const accountListeners: Array<(state: AccountState) => void> = []
  let resolveAccount!: (state: AccountState) => void
  const accountPromise = new Promise<AccountState>(resolve => { resolveAccount = resolve })
  const subscribeRoom = vi.fn(() => () => {})
  vi.stubGlobal('document', { querySelector: () => root })
  vi.stubGlobal('window', {
    setTimeout, clearTimeout, setInterval, clearInterval,
    electronAPI: {
      gameAccountGetState: () => accountPromise,
      gameAccountListFriends: async () => ({ ok: true, data: { friends: [] } }),
      onGameAccountStateChanged: (listener: typeof accountListeners[number]) => {
        accountListeners.push(listener); return () => {}
      },
      onAnimalFlipRoomEvent: subscribeRoom,
      gameAccountSubscribeAnimalFlipRoom: async () => ({ ok: true, data: {} }),
    },
  })
  const tap = (attribute: string, value = '') => click({ target: { closest: () => ({
    dataset: { animalMode: attribute === 'data-animal-mode' ? value : undefined, animalAt: value },
    hasAttribute: (name: string) => name === attribute,
  }) } } as unknown as Event)
  const visible = () => Object.entries(screens).filter(([, screen]) => !screen.hidden).map(([name]) => name)

  const page = mountAnimalFlipPage()!
  expect(visible()).toEqual(['menu'])
  expect(screens.menu.innerHTML).toContain('选择玩法')
  expect(screens.menu.innerHTML).not.toContain('animal-flip-board')
  tap('data-animal-mode', 'computer')
  expect(visible()).toEqual(['computer'])
  expect(screens.computer.innerHTML).toContain('animal-flip-board')
  expect(screens.computer.innerHTML).not.toContain('data-animal-mode=')
  tap('data-animal-at', '0')
  expect(screens.computer.innerHTML).toContain('电脑正在思考')
  tap('data-animal-back')
  tap('data-animal-mode', 'friend')
  expect(visible()).toEqual(['friend'])
  expect(screens.friend.innerHTML).toContain('登录后进行好友对战')

  resolveAccount({ account: { userId: 1, nickname: '玩家' } })
  await vi.advanceTimersByTimeAsync(1000)
  accountListeners.forEach(listener => listener({ account: { userId: 1, nickname: '新昵称' } }))
  expect(visible()).toEqual(['friend'])
  expect(screens.friend.innerHTML).toContain('加入房间')
  expect(screens.friend.innerHTML).not.toContain('animal-flip-board')
  tap('data-animal-back')
  expect(visible()).toEqual(['menu'])
  tap('data-animal-mode', 'friend')
  expect(subscribeRoom).toHaveBeenCalledOnce()

  const navigate = vi.mocked(onPageChange).mock.calls[0][0]
  navigate('account-page')
  navigate('animal-flip-page')
  expect(visible()).toEqual(['menu'])

  page.openFriendRoom({ room: {
    id: 7, code: '654321', state: 'waiting', hostUserId: 2,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    members: [{ userId: 2, side: 'red', ready: false, depositLocked: false }, { userId: 1, side: 'blue', ready: false, depositLocked: false }],
  }, snapshot: null })
  expect(visible()).toEqual(['friend'])
  expect(screens.friend.innerHTML).toContain('654321')
  expect(screens.friend.innerHTML).toContain('准备对战')
  expect(screens.friend.innerHTML).not.toContain('data-animal-mode=')
})
