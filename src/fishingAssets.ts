import { getBaitCatalogEntry } from '../electron/fishing/baitCatalog'
import { getFishCatalogEntry } from '../electron/fishing/fishCatalog'
import type { BaitId, FishId } from '../electron/fishing/fishingTypes'

export const FISHING_ASSETS = {
  pond: '/fishing/pond-bg.svg',
  bobber: '/fishing/bobber.svg',
}

export function getFishImagePath(fishId: FishId): string {
  const image = getFishCatalogEntry(fishId).image
  return image.startsWith('/') ? image : `/fishing/${image}`
}

export function getBaitImagePath(baitId: BaitId): string {
  return `/fishing/${getBaitCatalogEntry(baitId).image}`
}
