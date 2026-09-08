export type BaitId = 'basic' | 'premium'
export type FishId =
  | 'crucian'
  | 'carp'
  | 'grassCarp'
  | 'mandarin'
  | 'goldenKoi'
  | 'loach'
  | 'sardine'
  | 'clownfish'
  | 'blueTang'
  | 'eel'
  | 'guppy'
  | 'hairtail'
  | 'goldfish'
  | 'betta'
  | 'oceanSunfish'
  | 'whiteStrip'
  | 'tuna'
  | 'flounder'
  | 'lionfish'
  | 'ray'
  | 'seahorse'
  | 'angelfish'
  | 'paleChub'
export type FishRarity = 'common' | 'uncommon' | 'rare' | 'precious'

export type FishCatch = {
  id: string
  fishId: FishId
  weightKg: number
  sellPrice: number
  caughtAt: number
}

export type FishingState = {
  discoveredFish: FishId[]
  totalCaught: number
}

export type BaitOffer = {
  baitId: BaitId
  name: string
  price: number
  description: string
  image: string
}
