import { farmCatalogIconStyle } from './farmAssets'

export function decorCatalogIconStyle(src: string): string {
  return farmCatalogIconStyle(src)
}

export function decorCatalogIconHtml(src: string, className: string): string {
  return `<span class="${className} farm-catalog-icon" style="${decorCatalogIconStyle(src)}" aria-hidden="true"></span>`
}
