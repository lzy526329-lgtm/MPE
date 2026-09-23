import { chooseAnimalAction } from './animalFlipAi'
import { ANIMAL_NAMES, createAnimalGame, observeAnimalGame, playAnimalAction, type AnimalGame } from './animalFlipEngine'
import { ANIMAL_CARD_BACK, animalCardImage } from './animalFlipAssets'
import { getCurrentPage, navigateToPage, onPageChange } from './appNavigation'
import type { AnimalFlipRoomResult } from '../electron/gameAccount/types'
import { escapeHtml } from './gamePageShared'
import type { AnimalAction } from './animalFlipEngine'
import './animalFlip.css'
import { mountAnimalFlipFriendPage, renderAnimalFlipModeSelector } from './animalFlipFriendPage'

export type AnimalFlipViewModel = { state: AnimalGame; selected: number | null; busy: boolean; account?: { userId: number | string; nickname?: string | null; uid?: string } | null }

export function getPlayerMoveAction(state: AnimalGame, selected: number | null, target: number): AnimalAction | null {
  if (selected === null || selected === target || target < 0 || target >= state.board.length) return null
  if (state.turn !== 'red') return null
  const source = state.board[selected]
  const destination = state.board[target]
  if (!source?.revealed || source.side !== 'red') return null
  if (destination && (!destination.revealed || destination.side === 'red')) return null
  return { type: 'move', from: selected, to: target }
}

function cardMarkup(state: AnimalGame, at: number, selected: number | null): string {
  const card = state.board[at]
  if (!card) return `<div class="animal-flip-card animal-flip-card--empty" data-animal-at="${at}" role="gridcell" aria-label="空位"></div>`
  const selectedClass = selected === at ? ' animal-flip-card--selected' : ''
  if (!card.revealed) {
    return `<button class="animal-flip-card animal-flip-card--hidden${selectedClass}" type="button" data-animal-at="${at}" aria-label="暗牌"><img src="${ANIMAL_CARD_BACK}" alt="暗牌" draggable="false" /></button>`
  }
  const sideClass = ` animal-flip-card--${card.side}`
  const actionLabel = card.side === 'red' ? `${ANIMAL_NAMES[card.animal]}，红方，点击选择` : `${ANIMAL_NAMES[card.animal]}，蓝方`
  return `<button class="animal-flip-card${sideClass}${selectedClass}" type="button" data-animal-at="${at}" aria-label="${escapeHtml(actionLabel)}"><img src="${animalCardImage(card.animal, card.side)}" alt="${escapeHtml(ANIMAL_NAMES[card.animal])}" draggable="false" /></button>`
}

function remaining(state: AnimalGame, side: 'red' | 'blue'): number {
  return state.board.filter(card => card?.side === side).length
}

export function renderAnimalFlip({ state, selected, busy }: AnimalFlipViewModel): string {
  const turnCopy = state.result !== 'playing'
    ? state.result === 'draw' ? '和局' : `${state.result === 'red' ? '红方' : '蓝方'}获胜`
    : busy ? '电脑正在思考…' : state.turn === 'red' ? '轮到你' : '电脑回合'
  const hint = state.result !== 'playing'
    ? state.message
    : busy ? '电脑正在观察局面…'
      : selected !== null ? '请选择相邻空位移动，或选择旁边的敌牌攻击。'
        : '翻一张暗牌，或点击己方明牌开始行动。'
  const resultClass = state.result !== 'playing' ? ' animal-flip-status--result' : ''
  return `
    <button class="text-button animal-flip-back" type="button" data-animal-back>← 返回玩法选择</button>
    <div class="animal-flip-game">
      <div class="animal-flip-game-header">
        <div>
          <p class="animal-flip-kicker">童年翻牌游戏</p>
          <h1>象狮虎豹</h1>
          <p class="animal-flip-subtitle">红方对战电脑 · 每回合只能翻牌或行动一次</p>
        </div>
        <button class="secondary-button" type="button" data-animal-restart>重新开局</button>
      </div>
      <div class="animal-flip-scorebar" aria-live="polite">
        <span class="animal-flip-score animal-flip-score--red"><i></i>红方剩余 <strong>${remaining(state, 'red')}</strong></span>
        <span class="animal-flip-turn${resultClass}">${escapeHtml(turnCopy)}</span>
        <span class="animal-flip-score animal-flip-score--blue"><i></i>蓝方剩余 <strong>${remaining(state, 'blue')}</strong></span>
      </div>
      <div class="animal-flip-layout">
        <section class="animal-flip-table" aria-label="象狮虎豹棋盘">
          <div class="animal-flip-board" role="grid" aria-label="4乘4翻牌棋盘">
            ${state.board.map((_, at) => cardMarkup(state, at, selected)).join('')}
          </div>
          <p class="animal-flip-hint" role="status">${escapeHtml(hint)}</p>
        </section>
      </div>
    </div>
  `
}

export function mountAnimalFlipPage(): { openFriendRoom: (result: AnimalFlipRoomResult) => void } | undefined {
  const root = document.querySelector<HTMLElement>('#animal-flip-root')
  if (!root) return
  root.innerHTML = '<div data-animal-screen="menu"></div><div data-animal-screen="computer" hidden></div><div data-animal-screen="friend" hidden></div>'
  const menuRoot = root.querySelector<HTMLElement>('[data-animal-screen="menu"]')!
  const computerRoot = root.querySelector<HTMLElement>('[data-animal-screen="computer"]')!
  const friendRoot = root.querySelector<HTMLElement>('[data-animal-screen="friend"]')!
  let screen: 'menu' | 'computer' | 'friend' = 'menu'
  let state = createAnimalGame()
  let selected: number | null = null
  let busy = false
  let computerTimer: number | undefined
  let paused = getCurrentPage() !== 'animal-flip-page'
  let account: { userId: number | string; nickname?: string | null; uid?: string } | null = null
  let friendPage: ReturnType<typeof mountAnimalFlipFriendPage> | undefined

  const clearComputerTimer = () => {
    if (computerTimer !== undefined) window.clearTimeout(computerTimer)
    computerTimer = undefined
  }
  const renderMenu = () => { menuRoot.innerHTML = renderAnimalFlipModeSelector(account) }
  const render = () => { computerRoot.innerHTML = renderAnimalFlip({ state, selected, busy }) }
  const showScreen = (next: typeof screen) => {
    clearComputerTimer()
    busy = false
    screen = next
    menuRoot.hidden = next !== 'menu'
    computerRoot.hidden = next !== 'computer'
    friendRoot.hidden = next !== 'friend'
    if (next === 'menu') renderMenu()
    if (next === 'computer') { render(); scheduleComputer() }
    if (next === 'friend' && !friendPage) friendPage = mountAnimalFlipFriendPage(friendRoot)
  }
  const scheduleComputer = () => {
    clearComputerTimer()
    if (screen !== 'computer' || paused || busy || state.result !== 'playing' || state.turn !== 'blue') return
    busy = true
    render()
    computerTimer = window.setTimeout(() => {
      computerTimer = undefined
      if (screen !== 'computer' || paused || state.result !== 'playing' || state.turn !== 'blue') { busy = false; render(); return }
      const action = chooseAnimalAction(observeAnimalGame(state))
      if (action) state = playAnimalAction(state, 'blue', action)
      busy = false
      selected = null
      render()
      if (state.result === 'playing' && state.turn === 'blue') scheduleComputer()
    }, 600)
  }
  const reset = () => {
    clearComputerTimer()
    state = createAnimalGame()
    selected = null
    busy = false
    render()
  }
  root.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-animal-restart], [data-animal-at], [data-animal-mode], [data-animal-back]')
    if (!target) return
    if (target.hasAttribute('data-animal-back')) { showScreen('menu'); return }
    if (screen === 'menu') {
      if (target.dataset.animalMode === 'friend') showScreen('friend')
      if (target.dataset.animalMode === 'computer') showScreen('computer')
      return
    }
    if (screen !== 'computer') return
    if (target.hasAttribute('data-animal-restart')) { reset(); return }
    if (paused || busy || state.turn !== 'red' || state.result !== 'playing') return
    const at = Number(target.dataset.animalAt)
    const card = state.board[at]
    const move = getPlayerMoveAction(state, selected, at)
    if (move) {
      const next = playAnimalAction(state, 'red', move)
      if (next === state) return
      state = next
      selected = null
      render()
      scheduleComputer()
      return
    }
    if (!card) return
    if (!card.revealed) {
      if (selected !== null) return
      state = playAnimalAction(state, 'red', { type: 'flip', at })
      selected = null
      render()
      scheduleComputer()
      return
    }
    if (card.side === 'red') {
      selected = selected === at ? null : at
      render()
      return
    }
  })
  window.electronAPI?.onGameAccountStateChanged?.(next => {
    account = next.account ? { userId: next.account.userId, nickname: next.account.nickname, uid: next.account.uid } : null
    renderMenu()
  })
  void window.electronAPI?.gameAccountGetState?.().then(next => {
    account = next.account ? { userId: next.account.userId, nickname: next.account.nickname, uid: next.account.uid } : null
    renderMenu()
  }).catch(() => {})
  onPageChange(pageId => {
    paused = pageId !== 'animal-flip-page'
    if (paused) {
      clearComputerTimer()
      busy = false
      render()
    } else showScreen('menu')
  })
  showScreen('menu')
  return { openFriendRoom: result => {
    navigateToPage('animal-flip-page')
    showScreen('friend')
    friendPage?.enterRoom(result)
  } }
}
