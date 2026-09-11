export type BaitId = 'basic' | 'premium'
export type FishId =
  | 'crucian'
  | 'carp'
  | 'grassCarp'
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
export type FishQuality = 'white' | 'gold' | 'red'

export type FishCatch = {
  id: string
  fishId: FishId
  quality: FishQuality
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
