import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  PhotoplusDownloadController,
  buildDownloadPlan,
  extractActivityNo,
  normalizeImageUrl,
  pickBestImageUrl,
  runControlledPool,
  sanitizeFileName,
  signParams,
} from './index'

describe('extractActivityNo', () => {
  it('parses live/pc links', () => {
    expect(extractActivityNo('https://live.photoplus.cn/live/pc/55543392/#/live')).toBe('55543392')
  })

  it('parses activityNo query and bare live paths', () => {
    expect(extractActivityNo('https://live.photoplus.cn/live/55543392?accessFrom=live')).toBe(
      '55543392',
    )
    expect(
      extractActivityNo('打开相册 https://live.photoplus.cn/activity/live?activityNo=12345678'),
    ).toBe('12345678')
  })

  it('rejects unsupported urls', () => {
    expect(() => extractActivityNo('https://example.com/foo')).toThrow(/PhotoPlus/)
  })
})

describe('signParams', () => {
  it('adds _t and md5 _s with laxiaoheiwu secret', () => {
    const signed = signParams({ activityNo: '55543392', count: 3 }, 1_787_830_125_641)
    expect(signed._t).toBe(1_787_830_125_641)
    const raw = '_t=1787830125641&activityNo=55543392&count=3'.replace(/"/g, '')
    expect(signed._s).toBe(createHash('md5').update(`${raw}laxiaoheiwu`).digest('hex'))
  })
})

describe('sanitizeFileName / normalizeImageUrl / pickBestImageUrl', () => {
  it('sanitizes folder and file names', () => {
    expect(sanitizeFileName('2026级中欧/在职MBA\n开学典礼')).toBe('2026级中欧 在职MBA 开学典礼')
  })

  it('normalizes protocol-relative urls', () => {
    expect(normalizeImageUrl('//pb.plusx.cn/a.jpg')).toBe('https://pb.plusx.cn/a.jpg')
  })

  it('prefers origin_img over preview sizes', () => {
    expect(
      pickBestImageUrl({
        origin_img: '//a/origin.jpg',
        big_img: '//a/big.jpg',
        middle_img: '//a/middle.jpg',
      }),
    ).toBe('https://a/origin.jpg')
  })
})

describe('buildDownloadPlan', () => {
  it('uses album names as subfolders when albums exist', () => {
    const plan = buildDownloadPlan({
      activityNo: '55543392',
      activityName: '开学典礼',
      albums: [
        { albumId: 1, name: '8月23日', locked: false },
        { albumId: 2, name: '8月24日', locked: false },
      ],
    })
    expect(plan.rootFolderName).toBe('PhotoPlus-开学典礼')
    expect(plan.groups).toEqual([
      { kind: 'album', albumId: 1, folderName: '8月23日' },
      { kind: 'album', albumId: 2, folderName: '8月24日' },
    ])
  })

  it('falls back to a single root group when there are no albums', () => {
    const plan = buildDownloadPlan({
      activityNo: '55543392',
      activityName: '',
      albums: [],
    })
    expect(plan.rootFolderName).toBe('PhotoPlus-55543392')
    expect(plan.groups).toEqual([{ kind: 'all', folderName: '' }])
  })

  it('skips password-locked albums', () => {
    const plan = buildDownloadPlan({
      activityNo: '1',
      activityName: '活动',
      albums: [
        { albumId: 1, name: '公开', locked: false },
        { albumId: 2, name: '锁定', locked: true },
      ],
    })
    expect(plan.groups).toEqual([{ kind: 'album', albumId: 1, folderName: '公开' }])
    expect(plan.skippedAlbums).toEqual([{ albumId: 2, name: '锁定' }])
  })
})

describe('PhotoplusDownloadController', () => {
  it('blocks waitForProceed while paused and resumes after resume()', async () => {
    const controller = new PhotoplusDownloadController()
    controller.pause()
    expect(controller.status).toBe('paused')

    let released = false
    const pending = controller.waitForProceed().then((value) => {
      released = true
      return value
    })

    await Promise.resolve()
    expect(released).toBe(false)

    controller.resume()
    await expect(pending).resolves.toBe('run')
    expect(controller.status).toBe('running')
  })

  it('returns cancel from waitForProceed after cancel()', async () => {
    const controller = new PhotoplusDownloadController()
    controller.pause()
    const pending = controller.waitForProceed()
    controller.cancel()
    await expect(pending).resolves.toBe('cancel')
    expect(controller.status).toBe('cancelled')
    await expect(controller.waitForProceed()).resolves.toBe('cancel')
  })
})

describe('runControlledPool', () => {
  it('stops starting new jobs after cancel', async () => {
    const controller = new PhotoplusDownloadController()
    const started: number[] = []
    const items = [1, 2, 3, 4, 5]

    await runControlledPool(
      items,
      1,
      async (item) => {
        started.push(item)
        if (item === 2) controller.cancel()
      },
      controller,
    )

    expect(started).toEqual([1, 2])
  })

  it('pauses between jobs and continues after resume', async () => {
    const controller = new PhotoplusDownloadController()
    const started: number[] = []
    const gate = {
      resume: null as null | (() => void),
    }

    const done = runControlledPool(
      [1, 2, 3],
      1,
      async (item) => {
        started.push(item)
        if (item === 1) {
          controller.pause()
          await new Promise<void>((resolve) => {
            gate.resume = () => {
              controller.resume()
              resolve()
            }
          })
        }
      },
      controller,
    )

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(started).toEqual([1])
    gate.resume?.()
    await done
    expect(started).toEqual([1, 2, 3])
  })
})
