export type GameTab = 'food' | 'seeds'

export const DEFAULT_GAME_TAB: GameTab = 'seeds'

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
  return value === 'food' || value === 'seeds'
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
