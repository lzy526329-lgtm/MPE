import { getBaitCatalogEntry } from '../electron/fishing/baitCatalog'
import { getFishCatalogEntry } from '../electron/fishing/fishCatalog'
import type { BaitId, FishId } from '../electron/fishing/fishingTypes'

export const FISHING_ASSETS = {
  pond: './fishing/pond-bg.svg',
  bobber: './fishing/bobber.svg',
}

export function getFishImagePath(fishId: FishId): string {
  const image = getFishCatalogEntry(fishId).image
  // Resolve public assets relative to index.html for packaged Electron file:// pages.
  const path = image.startsWith('/') ? image.slice(1) : `fishing/${image}`
  return `./${path.split('/').map(encodeURIComponent).join('/')}`
}

export function getBaitImagePath(baitId: BaitId): string {
  return `./fishing/${encodeURIComponent(getBaitCatalogEntry(baitId).image)}`
}
