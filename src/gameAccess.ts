import type { GameAccountState } from '../electron/gameAccount/types'
import type { AppPageId } from './appPages'

const ACCOUNT_GAME_PAGES = new Set<AppPageId>([
  'farm-page',
  'shop-page',
  'backpack-page',
  'fishing-page',
  'friend-page',
  'animal-flip-page',
])

let accountState: GameAccountState | null = null
let pendingGamePage: AppPageId | null = null

export function requiresGameAccount(pageId: AppPageId): boolean {
  return ACCOUNT_GAME_PAGES.has(pageId)
}

export function setGameAccountState(state: GameAccountState | null): void {
  accountState = state
}

export function isGameAccountAuthenticated(): boolean {
  return Boolean(accountState?.account)
}

export function setPendingGamePage(pageId: AppPageId): void {
  pendingGamePage = pageId
}

export function consumePendingGamePage(): AppPageId | null {
  const pageId = pendingGamePage
  pendingGamePage = null
  return pageId
}

export function installGameAccessGate(): () => void {
  const removeListener = window.electronAPI?.onGameAccountStateChanged?.(setGameAccountState) ?? (() => undefined)
  void window.electronAPI?.gameAccountGetState?.().then(setGameAccountState).catch(() => undefined)
  return removeListener
}
