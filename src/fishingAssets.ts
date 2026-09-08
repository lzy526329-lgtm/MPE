import { getBaitCatalogEntry } from '../electron/fishing/baitCatalog'
import { getFishCatalogEntry } from '../electron/fishing/fishCatalog'
import type { BaitId, FishId } from '../electron/fishing/fishingTypes'

export const FISHING_ASSETS = {
  pond: '/fishing/pond-bg.svg',
  bobber: '/fishing/bobber.svg',
}

export function getFishImagePath(fishId: FishId): string {
  return `/fishing/${getFishCatalogEntry(fishId).image}`
}

export function getBaitImagePath(baitId: BaitId): string {
  return `/fishing/${getBaitCatalogEntry(baitId).image}`
}
