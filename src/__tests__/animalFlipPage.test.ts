import { describe, expect, it } from 'vitest'
import { getPlayerMoveAction, renderAnimalFlip, type AnimalFlipViewModel } from '../animalFlipPage'
import { createAnimalGame } from '../animalFlipEngine'

describe('animal flip page', () => {
  it('keeps hidden card identities out of rendered markup', () => {
    const html = renderAnimalFlip({ state: createAnimalGame(() => 0), selected: null, busy: false })
    expect(html).toContain('animal-flip-board')
    expect(html.match(/animal-flip-card--hidden/g)).toHaveLength(16)
    expect(html).not.toContain('animal-flip-card--red')
    expect(html).not.toContain('animal-flip-card--blue')
    expect(html).toContain('翻一张暗牌')
    expect(html).not.toContain('animal-flip-rules')
    expect(html).not.toContain('最近动作')
  })

  it('renders a revealed card image and selected state', () => {
    const state = createAnimalGame(() => 0)
    state.board[0] = { animal: 'mouse', side: 'red', revealed: true }
    const view: AnimalFlipViewModel = { state, selected: 0, busy: false }
    const html = renderAnimalFlip(view)
    expect(html).toContain('鼠')
    expect(html).toContain('animal-flip-card--red')
    expect(html).toContain('animal-flip-card--selected')
    expect(decodeURIComponent(html)).toContain('鼠-red-cutout.png')
  })

  it('shows computer thinking and terminal messages', () => {
    const state = createAnimalGame(() => 0)
    state.turn = 'blue'
    state.message = '电脑正在思考…'
    expect(renderAnimalFlip({ state, selected: null, busy: true })).toContain('电脑正在思考')
    state.result = 'red'
    state.message = '红方获胜！'
    expect(renderAnimalFlip({ state, selected: null, busy: false })).toContain('红方获胜')
  })
})


describe('player board targeting', () => {
  it('creates a move action when a selected red card targets an adjacent empty cell', () => {
    const state = createAnimalGame(() => 0)
    state.board[0] = { animal: 'cat', side: 'red', revealed: true }
    state.board[1] = null
    expect(getPlayerMoveAction(state, 0, 1)).toEqual({ type: 'move', from: 0, to: 1 })
  })

  it('does not treat a hidden card as an attack target', () => {
    const state = createAnimalGame(() => 0)
    state.board[0] = { animal: 'cat', side: 'red', revealed: true }
    state.board[1] = { animal: 'dog', side: 'blue', revealed: false }
    expect(getPlayerMoveAction(state, 0, 1)).toBeNull()
  })
})

it('shows only game controls on the computer page with a return to the selection page', () => {
  const html = renderAnimalFlip({ state: createAnimalGame(), selected: null, busy: false })
  expect(html).not.toContain('data-animal-mode=')
  expect(html).not.toContain('role="tablist"')
  expect(html).toContain('data-animal-back')
})
