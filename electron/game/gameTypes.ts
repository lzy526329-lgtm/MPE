import type { FarmActionResult } from '../farm/farmEngine'
import type { CropId, FarmState } from '../farm/farmTypes'

export type FoodId = string
export type FarmCoreState = Omit<FarmState, 'seeds' | 'inventory'>

export type WalletState = { coins: number }
export type InventoryState = {
  food: Record<FoodId, number>
  seeds: Record<CropId, number>
  produce: Record<string, number>
}
export type GameMigrationState = {
  starterCoinsGranted: boolean
  legacyPetImported: boolean
  legacyFarmImported: boolean
}
export type GameState = {
  version: 1
  wallet: WalletState
  inventory: InventoryState
  farm: FarmCoreState
  migrations: GameMigrationState
}
export type SeedOffer = { cropId: CropId; name: string; price: number }
export type GameViewState = {
  wallet: WalletState
  inventory: InventoryState
  seedOffers: SeedOffer[]
}
export type GameErrorCode =
  | 'UNKNOWN_ITEM'
  | 'INSUFFICIENT_COINS'
  | 'INVALID_STATE'
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
