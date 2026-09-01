/** Electron 打包后走 file://，食物图在 public/foods/ */
const FOODS_PUBLIC = './foods'

function foodAsset(fileName: string): string {
  return `${FOODS_PUBLIC}/${encodeURIComponent(fileName)}`
}

export function resolveFoodAssetUrl(fileName: string): string {
  return foodAsset(fileName)
}

export function foodCatalogIconStyle(fileName: string): string {
  return `background-image:url('${foodAsset(fileName)}');background-size:contain;background-position:center;background-repeat:no-repeat;`
}

export function foodCatalogIconHtml(fileName: string, className: string): string {
  return `<span class="${className} farm-catalog-icon" style="${foodCatalogIconStyle(fileName)}" aria-hidden="true"></span>`
}

export function formatFoodSatietyLabel(satiety: number): string {
  return `+${satiety} 饱食度`
}
