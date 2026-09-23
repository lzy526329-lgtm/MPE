import { describe, expect, it } from 'vitest'
import { createAnimalGame, legalAnimalActions, observeAnimalGame, playAnimalAction, type AnimalCard, type AnimalGame, type AnimalAction } from '../animalFlipEngine'
import { chooseAnimalAction } from '../animalFlipAi'

const card = (animal: AnimalCard['animal'], side: AnimalCard['side'], revealed = true): AnimalCard => ({ animal, side, revealed })
function position(entries: Record<number, AnimalCard>, turn: AnimalGame['turn'] = 'red'): AnimalGame {
  return { board: Array.from({ length: 16 }, (_, i) => entries[i] ?? null), turn, result: 'playing', ply: 0, lastAction: null, message: '' }
}

describe('animal flip rules', () => {
  it('deals sixteen unique hidden cards, eight per side, and shuffles', () => {
    const game = createAnimalGame(() => 0)
    expect(game.board).toHaveLength(16)
    expect(new Set(game.board.map(c => `${c?.side}:${c?.animal}`)).size).toBe(16)
    expect(game.board.filter(c => c?.side === 'red')).toHaveLength(8)
    expect(game.board.every(c => c && !c.revealed)).toBe(true)
    expect(game.turn).toBe('red')
    expect(game.board).not.toEqual(createAnimalGame(() => 0.99).board)
  })
  it('flips exactly one card, preserves ownership, and rejects a second player action', () => {
    const start = position({ 0: card('tiger', 'blue', false), 1: card('cat', 'red', false) })
    const next = playAnimalAction(start, 'red', { type: 'flip', at: 0 })
    expect(next.board[0]).toEqual(card('tiger', 'blue'))
    expect(next.board[1]?.revealed).toBe(false)
    expect(next.turn).toBe('blue')
    expect(next.ply).toBe(1)
    expect(start.board[0]?.revealed).toBe(false)
    expect(playAnimalAction(next, 'red', { type: 'flip', at: 1 })).toBe(next)
  })
  it('moves one square orthogonally without mutating the old board', () => {
    const start = position({ 0: card('tiger', 'red'), 15: card('cat', 'blue') })
    const next = playAnimalAction(start, 'red', { type: 'move', from: 0, to: 4 })
    expect(next.board[0]).toBeNull()
    expect(next.board[4]).toEqual(card('tiger', 'red'))
    expect(next.turn).toBe('blue')
    expect(start.board[0]).toEqual(card('tiger', 'red'))
  })
  it.each([
    { type: 'move', from: 0, to: 5 }, { type: 'move', from: 0, to: 2 },
    { type: 'move', from: 3, to: 4 }, { type: 'move', from: 0, to: 1 },
    { type: 'move', from: 0, to: 4 }, { type: 'move', from: 8, to: 9 },
    { type: 'flip', at: 0 }, { type: 'flip', at: -1 }, { type: 'flip', at: 16 },
    { type: 'move', from: 0.5, to: 1 },
  ] as AnimalAction[])('rejects illegal action %j without consuming a turn', action => {
    const start = position({ 0: card('cat', 'red'), 1: card('dog', 'red'), 3: card('lion', 'red'), 4: card('mouse', 'blue', false), 8: card('tiger', 'blue') })
    expect(playAnimalAction(start, 'red', action)).toBe(start)
  })
  it.each([
    ['elephant', 'lion', true], ['lion', 'tiger', true], ['tiger', 'leopard', true],
    ['leopard', 'wolf', true], ['wolf', 'dog', true], ['dog', 'cat', true], ['cat', 'mouse', true],
    ['cat', 'dog', false], ['mouse', 'elephant', true], ['elephant', 'mouse', false],
  ] as const)('%s attacking %s is allowed=%s', (attacker, defender, allowed) => {
    const start = position({ 0: card(attacker, 'red'), 1: card(defender, 'blue'), 15: card('wolf', 'blue', false) })
    const next = playAnimalAction(start, 'red', { type: 'move', from: 0, to: 1 })
    if (!allowed) expect(next).toBe(start)
    else {
      expect(next.board[0]).toBeNull()
      expect(next.board[1]).toEqual(card(attacker, 'red'))
      expect(next.turn).toBe('blue')
      expect(next.result).toBe('playing')
    }
  })
  it('removes both equal cards and keeps playing when hidden cards remain', () => {
    const start = position({ 0: card('cat', 'red'), 1: card('cat', 'blue'), 14: card('mouse', 'red', false), 15: card('mouse', 'blue', false) })
    const next = playAnimalAction(start, 'red', { type: 'move', from: 0, to: 1 })
    expect(next.board.slice(0, 2)).toEqual([null, null])
    expect(next.result).toBe('playing')
  })
  it('awards the surviving side and prevents play after a win', () => {
    const next = playAnimalAction(position({ 0: card('lion', 'red'), 1: card('cat', 'blue') }), 'red', { type: 'move', from: 0, to: 1 })
    expect(next.result).toBe('red')
    expect(legalAnimalActions(next)).toEqual([])
    expect(playAnimalAction(next, 'blue', { type: 'move', from: 1, to: 0 })).toBe(next)
  })
  it('draws when the final equal pair disappears', () => {
    expect(playAnimalAction(position({ 0: card('cat', 'red'), 1: card('cat', 'blue') }), 'red', { type: 'move', from: 0, to: 1 }).result).toBe('draw')
  })
  it('draws if the next side has no legal actions', () => {
    const entries: Record<number, AnimalCard> = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [i, card('elephant', 'red')]))
    entries[0] = card('cat', 'blue')
    entries[15] = card('wolf', 'red', false)
    expect(playAnimalAction(position(entries), 'red', { type: 'flip', at: 15 }).result).toBe('draw')
  })
})

describe('computer decisions use only visible information', () => {
  it('prefers a legal capture over an empty move or flip', () => {
    const start = position({ 0: card('tiger', 'blue'), 1: card('cat', 'red'), 15: card('elephant', 'red', false) }, 'blue')
    expect(chooseAnimalAction(observeAnimalGame(start), () => 0)).toEqual({ type: 'move', from: 0, to: 1 })
  })
  it('prefers movement over flipping when no capture exists', () => {
    const start = position({ 0: card('tiger', 'blue'), 15: card('cat', 'red', false) }, 'blue')
    const action = chooseAnimalAction(observeAnimalGame(start), () => 0)
    expect(action?.type).toBe('move')
    expect(legalAnimalActions(start)).toContainEqual(action)
  })
  it('reveals a card when no owned card is playable', () => {
    const start = createAnimalGame(() => 0)
    expect(chooseAnimalAction(observeAnimalGame(start), () => 0)).toEqual({ type: 'flip', at: 0 })
  })
  it('does not receive or react to hidden card identities', () => {
    const a = position({ 0: card('cat', 'red', false), 1: card('elephant', 'blue', false) }, 'blue')
    const b = position({ 0: card('elephant', 'blue', false), 1: card('cat', 'red', false) }, 'blue')
    expect(observeAnimalGame(a).board[0]).toEqual({ revealed: false })
    expect(observeAnimalGame(a)).toEqual(observeAnimalGame(b))
    expect(chooseAnimalAction(observeAnimalGame(a), () => 0.5)).toEqual(chooseAnimalAction(observeAnimalGame(b), () => 0.5))
  })
  it('returns no action after the game ends', () => {
    expect(chooseAnimalAction(observeAnimalGame({ ...createAnimalGame(), result: 'draw' }))).toBeNull()
  })
})
