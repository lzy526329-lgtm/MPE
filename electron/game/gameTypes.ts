import type { FoodId, FoodOffer } from './foodCatalog'
import type { SupplyId, SupplyOffer } from './supplyCatalog'
import type { DecorId, DecorOffer } from './decorCatalog'
import type { FurnitureId, FurnitureOffer } from './furnitureCatalog'
import type { FarmActionResult } from '../farm/farmEngine'
import type { CropId, FarmState, HouseDecorPlacement } from '../farm/farmTypes'
import type { BaitId, BaitOffer, FishCatch, FishingState } from '../fishing/fishingTypes'

export type { FoodId } from './foodCatalog'
export type { SupplyId } from './supplyCatalog'
export type { DecorId } from './decorCatalog'
export type { FurnitureId } from './furnitureCatalog'
export type { BaitId, FishId, FishCatch, FishingState } from '../fishing/fishingTypes'
export type FarmCoreState = Omit<FarmState, 'seeds' | 'inventory'>

export type WalletState = { coins: number }
export type InventoryState = {
  food: Record<FoodId, number>
  supplies: Record<SupplyId, number>
  seeds: Record<CropId, number>
  produce: Record<string, number>
  decors: Record<DecorId, number>
  furniture?: Record<FurnitureId, number>
  baits: Record<BaitId, number>
  fish: FishCatch[]
}
export type GameMigrationState = {
  starterCoinsGranted: boolean
  legacyPetImported: boolean
  legacyFarmImported: boolean
}
export type GameState = {
  version: 2
  wallet: WalletState
  inventory: InventoryState
  farm: FarmCoreState
  house?: { placedDecors: HouseDecorPlacement[] }
  fishing: FishingState
  migrations: GameMigrationState
}
export type SeedOffer = { cropId: CropId; name: string; price: number }
export type ProduceOffer = { produceId: string; name: string; price: number }
export type GameViewState = {
  wallet: WalletState
  inventory: InventoryState
  house?: { placedDecors: HouseDecorPlacement[] }
  /** 已摆放装饰数量（按类型），用于商店上限展示 */
  placedDecorCounts: Record<DecorId, number>
  seedOffers: SeedOffer[]
  produceOffers: ProduceOffer[]
  foodOffers: FoodOffer[]
  supplyOffers: SupplyOffer[]
  decorOffers: DecorOffer[]
  furnitureOffers?: FurnitureOffer[]
  baitOffers: BaitOffer[]
  fishing: FishingState
}
export type GameErrorCode =
  | 'UNKNOWN_ITEM'
  | 'INSUFFICIENT_COINS'
  | 'INSUFFICIENT_STOCK'
  | 'INVALID_STATE'
  | 'FISH_BAG_FULL'
  | 'PERSISTENCE_FAILED'
export type GameActionResult =
  | { ok: true; state: GameViewState }
  | { ok: false; code: GameErrorCode; message: string; state: GameViewState }
export type GameMutationResult =
  | { ok: true; game: GameState; state: GameViewState }
  | {
      ok: false
      code: GameErrorCode
      message: string
      game: GameState
      state: GameViewState
    }
export type FarmGameMutationResult =
  | { ok: true; game: GameState; farm: FarmActionResult & { ok: true } }
  | { ok: false; game: GameState; farm: FarmActionResult & { ok: false } }
