export const ANIMALS = ['elephant', 'lion', 'tiger', 'leopard', 'wolf', 'dog', 'cat', 'mouse'] as const
export type Animal = typeof ANIMALS[number]
export type AnimalSide = 'red' | 'blue'
export const ANIMAL_NAMES: Record<Animal, string> = { elephant: '象', lion: '狮', tiger: '虎', leopard: '豹', wolf: '狼', dog: '狗', cat: '猫', mouse: '鼠' }
export const SIDE_NAMES: Record<AnimalSide, string> = { red: '红方', blue: '蓝方' }
export type AnimalCard = { animal: Animal; side: AnimalSide; revealed: boolean }
export type AnimalAction = { type: 'flip'; at: number } | { type: 'move'; from: number; to: number }
export type AnimalGame = {
  board: (AnimalCard | null)[]
  turn: AnimalSide
  result: 'playing' | AnimalSide | 'draw'
  ply: number
  lastAction: AnimalAction | null
  message: string
}
export type VisibleAnimalCard = (AnimalCard & { revealed: true }) | { revealed: false }
export type AnimalObservation = Pick<AnimalGame, 'turn' | 'result'> & { board: (VisibleAnimalCard | null)[] }

export function createAnimalGame(rng: () => number = Math.random): AnimalGame {
  const board: AnimalCard[] = (['red', 'blue'] as const).flatMap(side => ANIMALS.map(animal => ({ animal, side, revealed: false })))
  for (let i = board.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[board[i], board[j]] = [board[j], board[i]]
  }
  return { board, turn: 'red', result: 'playing', ply: 0, lastAction: null, message: '牌已洗好，翻开一张，开始对战。' }
}

export function observeAnimalGame(state: AnimalGame): AnimalObservation {
  return { turn: state.turn, result: state.result, board: state.board.map(card => card ? card.revealed ? { ...card, revealed: true } : { revealed: false } : null) }
}

export function animalCanCapture(attacker: Animal, defender: Animal): boolean {
  if (attacker === 'mouse' && defender === 'elephant') return true
  if (attacker === 'elephant' && defender === 'mouse') return false
  return ANIMALS.indexOf(attacker) <= ANIMALS.indexOf(defender)
}

export function animalNeighbors(at: number): number[] {
  return [at - 4, at + 4, at % 4 > 0 ? at - 1 : -1, at % 4 < 3 ? at + 1 : -1].filter(i => i >= 0 && i < 16)
}

export function legalAnimalActions(state: AnimalObservation): AnimalAction[] {
  if (state.result !== 'playing') return []
  const actions: AnimalAction[] = []
  state.board.forEach((card, at) => {
    if (!card) return
    if (!card.revealed) {
      actions.push({ type: 'flip', at })
      return
    }
    if (card.side !== state.turn) return
    for (const to of animalNeighbors(at)) {
      const target = state.board[to]
      if (!target || (target.revealed && target.side !== card.side && animalCanCapture(card.animal, target.animal))) {
        actions.push({ type: 'move', from: at, to })
      }
    }
  })
  return actions
}

export function playAnimalAction(state: AnimalGame, actor: AnimalSide, action: AnimalAction): AnimalGame {
  if (state.turn !== actor || state.result !== 'playing') return state
  const legal = legalAnimalActions(observeAnimalGame(state)).some(candidate =>
    candidate.type === 'flip' && action.type === 'flip' ? candidate.at === action.at
      : candidate.type === 'move' && action.type === 'move' && candidate.from === action.from && candidate.to === action.to,
  )
  if (!legal) return state
  const board = state.board.slice()
  let message: string
  if (action.type === 'flip') {
    const card = board[action.at]!
    board[action.at] = { ...card, revealed: true }
    message = `${SIDE_NAMES[actor]}翻开了${SIDE_NAMES[card.side]}的${ANIMAL_NAMES[card.animal]}。`
  } else {
    const card = board[action.from]!
    const target = board[action.to]
    board[action.from] = null
    const equal = target?.animal === card.animal
    board[action.to] = equal ? null : card
    message = equal ? `两张${ANIMAL_NAMES[card.animal]}同归于尽。`
      : target ? `${SIDE_NAMES[actor]}的${ANIMAL_NAMES[card.animal]}吃掉了${ANIMAL_NAMES[target.animal]}。`
        : `${SIDE_NAMES[actor]}移动了${ANIMAL_NAMES[card.animal]}。`
  }
  const next: AnimalGame = { board, turn: actor === 'red' ? 'blue' : 'red', result: 'playing', ply: state.ply + 1, lastAction: { ...action }, message }
  const red = board.some(c => c?.side === 'red')
  const blue = board.some(c => c?.side === 'blue')
  if (!red && !blue) next.result = 'draw'
  else if (!red) next.result = 'blue'
  else if (!blue) next.result = 'red'
  else if (legalAnimalActions(observeAnimalGame(next)).length === 0) next.result = 'draw'
  return next
}
