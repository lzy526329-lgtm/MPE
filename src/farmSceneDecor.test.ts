import { describe, expect, it } from 'vitest'
import {
  createFarmDecorFromCatalog,
  exportFarmDecorJson,
  FARM_DECOR_CATALOG,
  farmDecorInlineStyle,
  normalizeFarmDecor,
  normalizeFarmDecorDraft,
  renderFarmDecorHtml,
} from './farmSceneDecor'

describe('farm scene decor', () => {
  it('lists scene decoration assets', () => {
    expect(FARM_DECOR_CATALOG.length).toBeGreaterThanOrEqual(5)
    expect(FARM_DECOR_CATALOG.some((item) => item.src === 'pond.png')).toBe(true)
  })

  it('creates decor with percentage layout defaults', () => {
    const decor = createFarmDecorFromCatalog('pond', 0)
    expect(decor).not.toBeNull()
    expect(decor!.src).toBe('pond.png')
    expect(decor!.width).toBeGreaterThan(0)
    expect(decor!.left).toBeGreaterThanOrEqual(0)
  })

  it('renders decor layer html', () => {
    const decor = normalizeFarmDecor({
      id: 'pond-1',
      decorId: 'pond',
      src: 'pond.png',
      left: 10,
      top: 20,
      width: 15,
      zIndex: 2,
    })
    const html = renderFarmDecorHtml([decor])
    expect(html).toContain('farm-decor-layer')
    expect(html).toContain('data-decor-id="pond-1"')
    expect(html).toContain('left:10%')
  })

  it('exports stable json for handoff', () => {
    const json = exportFarmDecorJson([
      {
        id: 'sign-1',
        decorId: 'sign',
        src: 'sign-cutout.png',
        left: 72.125,
        top: 38.5,
        width: 12,
        zIndex: 5,
      },
    ])
    expect(JSON.parse(json)).toEqual([
      {
        id: 'sign-1',
        decorId: 'sign',
        src: 'sign-cutout.png',
        left: 72.13,
        top: 38.5,
        width: 12,
        zIndex: 5,
      },
    ])
  })

  it('supports flipX in inline style with left anchor', () => {
    const style = farmDecorInlineStyle({
      id: 'tree',
      decorId: 'tree',
      src: 'trre-cutout.png',
      left: 0,
      top: 0,
      width: 10,
      zIndex: 1,
      flipX: true,
    })
    expect(style).toContain('scaleX(-1)')
    expect(style).toContain('transform-origin:left center')
  })

  it('omits flipX from normalized export when false', () => {
    const normalized = normalizeFarmDecor({
      id: 'tree',
      decorId: 'tree',
      src: 'trre-cutout.png',
      left: 1,
      top: 2,
      width: 10,
      zIndex: 1,
      flipX: false,
    })
    expect(normalized.flipX).toBeUndefined()
  })

  it('keeps locked in draft but not in export json', () => {
    const draft = normalizeFarmDecorDraft({
      id: 'room-1',
      decorId: 'room',
      src: 'room-cutout.png',
      left: 1,
      top: 2,
      width: 20,
      zIndex: 2,
      locked: true,
    })
    expect(draft.locked).toBe(true)

    const exported = JSON.parse(exportFarmDecorJson([draft]))
    expect(exported[0].locked).toBeUndefined()
  })
})
