import type { GameErrorCode } from '../electron/game/gameTypes'

export type GameTab = 'food' | 'seeds' | 'supplies' | 'decors'

export const DEFAULT_GAME_TAB: GameTab = 'seeds'

export function gameErrorMessage(code: GameErrorCode): string {
  const messages: Record<GameErrorCode, string> = {
    UNKNOWN_ITEM: '商品不存在，请刷新后重试。',
    INSUFFICIENT_COINS: '金币不足，无法购买。',
    INSUFFICIENT_STOCK: '库存不足，无法出售。',
    INVALID_STATE: '游戏数据异常，请重试。',
    PERSISTENCE_FAILED: '保存失败，请重试。',
  }
  return messages[code]
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[character]
  })
}

export function isGameTab(value: string | undefined): value is GameTab {
  return value === 'food' || value === 'seeds' || value === 'supplies' || value === 'decors'
}

export function switchGameTab(root: HTMLElement, tab: GameTab): void {
  root.querySelectorAll<HTMLElement>('.game-tab').forEach((button) => {
    const active = button.dataset.gameTab === tab
    button.classList.toggle('active', active)
    button.setAttribute('aria-selected', String(active))
  })
  root.querySelectorAll<HTMLElement>('.game-pane').forEach((pane) => {
    pane.classList.toggle('hidden', pane.dataset.gamePane !== tab)
  })
}
