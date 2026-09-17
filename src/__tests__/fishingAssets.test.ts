import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getFishIds } from '../../electron/fishing/fishCatalog'
import { FISHING_ASSETS, getBaitImagePath, getFishImagePath } from '../fishingAssets'

describe('fishing asset URLs', () => {
  it.each([
    ['Windows installation', 'file:///C:/Users/Test%20User/AppData/Local/Programs/MPT/resources/app.asar/dist/'],
    ['macOS installation', 'file:///Applications/MPT.app/Contents/Resources/app.asar/dist/'],
    ['development server', 'http://localhost:5173/'],
  ])('resolves every image inside the app assets on %s', (_name, assetRoot) => {
    const paths = [
      ...Object.values(FISHING_ASSETS),
      getBaitImagePath('basic'),
      getBaitImagePath('premium'),
      ...getFishIds().map(getFishImagePath),
    ]

    for (const path of paths) {
      const resolved = new URL(path, `${assetRoot}index.html`).href
      expect(resolved.startsWith(assetRoot), resolved).toBe(true)
      const publicPath = `public/${decodeURIComponent(resolved.slice(assetRoot.length))}`
      expect(existsSync(publicPath), publicPath).toBe(true)
    }
  })
})
