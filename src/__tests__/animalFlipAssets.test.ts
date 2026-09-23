import { describe, expect, it } from 'vitest'
import { ANIMAL_CARD_BACK, animalCardImage } from '../animalFlipAssets'
import { ANIMALS } from '../animalFlipEngine'

describe('animal flip assets', () => {
  it('resolves every card to a relative encoded file URL', () => {
    expect(ANIMAL_CARD_BACK).toBe('./%E5%8D%A1%E7%89%8C%E6%B8%B8%E6%88%8F%E7%B4%A0%E6%9D%90/bg-cutout.png')
    expect(animalCardImage('elephant', 'red')).toBe('./%E5%8D%A1%E7%89%8C%E6%B8%B8%E6%88%8F%E7%B4%A0%E6%9D%90/%E8%B1%A1-red-cutout.png')
    expect(animalCardImage('leopard', 'red')).toBe('./%E5%8D%A1%E7%89%8C%E6%B8%B8%E6%88%8F%E7%B4%A0%E6%9D%90/%E8%B1%B9%E5%AD%90-red-cutout.png')
    expect(animalCardImage('leopard', 'blue')).toBe('./%E5%8D%A1%E7%89%8C%E6%B8%B8%E6%88%8F%E7%B4%A0%E6%9D%90/%E8%B1%B9-blue-cutout.png')
    expect(ANIMALS.flatMap(animal => [animalCardImage(animal, 'red'), animalCardImage(animal, 'blue')])).toHaveLength(16)
  })
})
