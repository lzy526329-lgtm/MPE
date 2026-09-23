import type { Animal, AnimalSide } from './animalFlipEngine'

const DIRECTORY = '卡牌游戏素材'
const FILE_NAMES: Record<Animal, string> = {
  elephant: '象', lion: '狮子', tiger: '虎', leopard: '豹', wolf: '狼', dog: '狗', cat: '猫', mouse: '鼠',
}
const LEOPARD_RED_FILE = '豹子-red-cutout.png'

function assetUrl(fileName: string): string {
  return `./${[DIRECTORY, fileName].map(segment => encodeURIComponent(segment)).join('/')}`
}

export const ANIMAL_CARD_BACK = assetUrl('bg-cutout.png')

export function animalCardImage(animal: Animal, side: AnimalSide): string {
  const stem = FILE_NAMES[animal]
  const fileName = animal === 'leopard' && side === 'red'
    ? LEOPARD_RED_FILE
    : `${stem}-${side}-cutout.png`
  return assetUrl(fileName)
}
