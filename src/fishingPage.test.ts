import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { createDefaultGameState, toGameViewState } from '../electron/game/gameEngine'
import {
  isFishingReelShortcut,
  nextTimedEvent,
  normalizePondPoint,
  renderFishingPage,
} from './fishingPage'
import type { FishingUiState } from './fishingStateMachine'

describe('fishing page', () => {
  it('renders cast controls and selected bait while idle', () => {
    const view = toGameViewState(createDefaultGameState(1_000))
    view.inventory.baits.basic = 2
    const html = renderFishingPage(view, { phase: 'idle' }, 'basic', '')
    expect(html).toContain('普通鱼饵')
    expect(html).toContain('适合钓常见鱼类')
    expect(html).toContain('点击水面抛竿')
    expect(html).not.toContain('data-fishing-cast')
    expect(html).toContain('data-fishing-backpack-open')
    expect(html).toContain('图鉴 0 / 22')
    expect(html).toContain('×2')
  })

  it('places the hud and status text outside the pond', () => {
    const view = toGameViewState(createDefaultGameState(1_000))
    const html = renderFishingPage(view, { phase: 'idle' }, 'basic', '')
    const hudAt = html.indexOf('class="fishing-hud"')
    const pondAt = html.indexOf('data-fishing-pond')
    const statusAt = html.indexOf('class="fishing-status"')
    const controlsAt = html.indexOf('class="fishing-controls"')

    expect(hudAt).toBeGreaterThan(-1)
    expect(pondAt).toBeGreaterThan(hudAt)
    expect(statusAt).toBeGreaterThan(pondAt)
    expect(controlsAt).toBeGreaterThan(statusAt)
    expect(html).toMatch(/fishing-splash[\s\S]*?<\/div>\s*<\/div>\s*<p class="fishing-status"/)
  })

  it('maps current time to bite and timeout events', () => {
    const waiting: FishingUiState = {
      phase: 'waiting',
      baitId: 'basic',
      token: 't1',
      biteAt: 3_500,
      deadline: 4_700,
    }
    expect(nextTimedEvent(waiting, 3_499)).toBeNull()
    expect(nextTimedEvent(waiting, 3_500)).toEqual({ type: 'BITE_STARTED' })
    expect(nextTimedEvent({ ...waiting, phase: 'biting' }, 4_701)).toEqual({
      type: 'BITE_EXPIRED',
    })
  })

  it('normalizes the clicked pond position and clamps it inside the water', () => {
    const rect = { left: 100, top: 50, width: 300, height: 200 }
    expect(normalizePondPoint(250, 150, rect)).toEqual({ x: 50, y: 50 })
    expect(normalizePondPoint(80, 260, rect)).toEqual({ x: 6, y: 90 })
  })

  it('uses a non-repeating space key as the reel shortcut', () => {
    expect(isFishingReelShortcut('Space', false)).toBe(true)
    expect(isFishingReelShortcut('Space', true)).toBe(false)
    expect(isFishingReelShortcut('Enter', false)).toBe(false)
  })

  it('positions the fishing line and bobber at the clicked point', () => {
    const view = toGameViewState(createDefaultGameState(1_000))
    const state: FishingUiState = { phase: 'casting', baitId: 'basic' }
    const html = renderFishingPage(view, state, 'basic', '', false, { x: 32, y: 64 })

    expect(html).toContain('--fishing-cast-x:32%')
    expect(html).toContain('--fishing-cast-y:64%')
    expect(html).toContain('--fishing-cast-duration:1200ms')
    expect(html).toContain('--fishing-line-width:2.5px')
    expect(html).toContain('--fishing-bobber-size:44px')
    expect(html).toContain('class="fishing-line"')
    expect(html).toContain('<line x1="8" y1="100" x2="32" y2="64"></line>')
    expect(html).not.toContain('pathLength')
    expect(html).toContain('class="fishing-bobber"')
    expect(html).toContain('class="fishing-splash"')
  })

  it('keeps fishing svg assets free of invalid xml control characters', () => {
    for (const asset of ['bobber.svg', 'bait-basic.svg']) {
      const svg = readFileSync(`public/fishing/${asset}`, 'utf8')
      expect(svg).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/)
    }
  })

  it('renders the fishing line as one continuous stroke', () => {
    const css = readFileSync('src/style.css', 'utf8')
    expect(css).not.toContain('stroke-dasharray')
    expect(css).not.toContain('stroke-dashoffset')
  })

  it('opens a catalog with discovered fish details and hidden silhouettes', () => {
    const view = toGameViewState(createDefaultGameState(1_000))
    view.fishing.discoveredFish = ['crucian']

    const closed = renderFishingPage(view, { phase: 'idle' }, 'basic', '', false)
    expect(closed).toContain('data-fishing-catalog-open')
    expect(closed).not.toContain('aria-label="鱼类图鉴"')

    const opened = renderFishingPage(view, { phase: 'idle' }, 'basic', '', true)
    expect(opened).toContain('aria-label="鱼类图鉴"')
    expect(opened).toContain('鲫鱼')
    expect(opened).toContain('src="/fishingGrounds/鲫鱼-cutout.png"')
    expect(opened).toContain('尚未发现')
    expect(opened).toContain('data-fishing-catalog-close')
  })
})
