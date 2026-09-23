import { ANIMALS, animalCanCapture, animalNeighbors, legalAnimalActions, type AnimalAction, type AnimalObservation } from './animalFlipEngine'

const distance = (a: number, b: number) => Math.abs(a % 4 - b % 4) + Math.abs(Math.floor(a / 4) - Math.floor(b / 4))

/** Receives an observation with hidden identities removed, never the full game. */
export function chooseAnimalAction(state: AnimalObservation, rng: () => number = Math.random): AnimalAction | null {
  const legal = legalAnimalActions(state)
  if (!legal.length) return null
  const attacks = legal.filter(a => a.type === 'move' && state.board[a.to])
  const moves = legal.filter(a => a.type === 'move' && !state.board[a.to])
  const candidates = attacks.length ? attacks : moves.length ? moves : legal
  function score(action: AnimalAction): number {
    if (action.type === 'flip') return 0
    const card = state.board[action.from]
    if (!card?.revealed) return 0
    const target = state.board[action.to]
    if (target?.revealed) return 100 + (8 - ANIMALS.indexOf(target.animal)) * (target.animal === card.animal ? 1 : 3)
    const threats = animalNeighbors(action.to).filter(at => {
      const enemy = state.board[at]
      return enemy?.revealed && enemy.side !== card.side && animalCanCapture(enemy.animal, card.animal)
    }).length
    const prey = state.board.flatMap((enemy, at) => enemy?.revealed && enemy.side !== card.side && animalCanCapture(card.animal, enemy.animal) ? [at] : [])
    // A small approach preference keeps visible opponents in play; unknown cards carry no value.
    const approach = prey.length ? Math.min(...prey.map(at => distance(action.from, at))) - Math.min(...prey.map(at => distance(action.to, at))) : 0
    return approach - threats * 10
  }
  const scores = candidates.map(score)
  const best = Math.max(...scores)
  const tied = candidates.filter((_, i) => scores[i] === best)
  return tied[Math.floor(rng() * tied.length)]
}
