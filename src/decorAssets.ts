export function decorCatalogIconStyle(src: string): string {
  const url = src.includes('/')
    ? `./${src.split('/').map(encodeURIComponent).join('/')}`
    : `./farm/${encodeURIComponent(src)}`
  return `background-image:url('${url}');background-size:contain;background-position:center;background-repeat:no-repeat;`
}

export function decorCatalogIconHtml(src: string, className: string): string {
  return `<span class="${className} farm-catalog-icon" style="${decorCatalogIconStyle(src)}" aria-hidden="true"></span>`
}
