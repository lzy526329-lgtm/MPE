import { describe, expect, it } from 'vitest'
import { decorCatalogIconStyle } from './decorAssets'

describe('decor asset paths', () => {
  it('keeps farm assets under farm and supports the new furniture directory', () => {
    expect(decorCatalogIconStyle('goods.png')).toContain("./farm/goods.png")
    expect(decorCatalogIconStyle('家具/床-cutout.png')).toContain("./%E5%AE%B6%E5%85%B7/%E5%BA%8A-cutout.png")
  })
})
