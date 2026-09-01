/** Electron 打包后走 file://，杂货图在 public/杂货/ */
const SUPPLIES_PUBLIC = './杂货'

function supplyAsset(fileName: string): string {
  return `${SUPPLIES_PUBLIC}/${encodeURIComponent(fileName)}`
}

export function resolveSupplyAssetUrl(fileName: string): string {
  return supplyAsset(fileName)
}

export function supplyCatalogIconStyle(fileName: string): string {
  return `background-image:url('${supplyAsset(fileName)}');background-size:contain;background-position:center;background-repeat:no-repeat;`
}

export function supplyCatalogIconHtml(fileName: string, className: string): string {
  return `<span class="${className} farm-catalog-icon" style="${supplyCatalogIconStyle(fileName)}" aria-hidden="true"></span>`
}

export function formatSupplyHygieneLabel(hygiene: number): string {
  return `+${hygiene} 卫生`
}
