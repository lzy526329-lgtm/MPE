import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { createDefaultGameState, toGameViewState } from '../electron/game/gameEngine'
import {
  getDisplayedFishingLineColor,
  getDisplayedFishingLineStatus,
  getDisplayedFishingTension,
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
    expect(html).toContain('选择鱼饵后，点击水面抛竿')
    expect(html).not.toContain('fishing-cast-hint')
    expect(html).not.toContain('data-fishing-cast')
    expect(html).toContain('data-fishing-backpack-open')
    expect(html).toContain('图鉴 0 / 22')
    expect(html).toContain('×2')
  })

  it('locks page scroll and keeps bait list horizontally scrollable', () => {
    const css = readFileSync('src/style.css', 'utf8')
    expect(css).toMatch(/\.tool-page--fishing\s*\{[\s\S]*?overflow:\s*hidden/)
    expect(css).toMatch(/\.fishing-bait-list\s*\{[\s\S]*?overflow-x:\s*auto/)
  })

  it('lets the fishing page use the available workspace width', () => {
    const css = readFileSync('src/style.css', 'utf8')
    expect(css).toMatch(/\.tool-page--fishing > header,\s*#fishing-page \.panel\s*\{[\s\S]*?max-width:\s*none/)
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

  it('never renders an action button beside the bait list', () => {
    const view = toGameViewState(createDefaultGameState(1_000))
    const states: FishingUiState[] = [
      { phase: 'casting', baitId: 'basic' },
      { phase: 'waiting', baitId: 'basic', token: 't1', biteAt: 3_500, deadline: 5_500 },
      { phase: 'biting', baitId: 'basic', token: 't1', deadline: 5_500 },
      { phase: 'resolving', token: 't1' },
    ]

    for (const state of states) {
      const html = renderFishingPage(view, state, 'basic', '')
      expect(html).not.toContain('fishing-main-action')
      expect(html).not.toContain('data-fishing-reel')
    }
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
    expect(html).toContain('data-fishing-line-status="safe"')
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
    expect(opened).toContain('fishing-rarity--common">普通</span>')
    expect(opened).not.toContain('fishing-rarity--common">common</span>')
    expect(opened).toContain('尚未发现')
    expect(opened).toContain('data-fishing-catalog-close')
  })

  it('renders the fight meters and turns the line red during the random danger window', () => {
    const view = toGameViewState(createDefaultGameState(1_000))
    const now = Date.now()
    const html = renderFishingPage(view, {
      phase: 'biting',
      baitId: 'basic',
      token: 't1',
      deadline: 9_000,
      fight: {
        progress: 0.4,
        tension: 0.3,
        tensionAt: now,
        fishPull: 0.58,
        lineDangerUntil: now + 2_000,
        lineRecoveryUntil: now + 3_000,
        lineRecoveryStatus: 'warning',
      },
    }, 'basic', '')

    expect(html).toContain('收线进度')
    expect(html).toContain('40%')
    expect(html).toContain('data-fishing-line-status="danger"')
    expect(html).toContain('鱼线变红了！松开空格')
    expect(html).toContain('鱼的反拉 58%')
  })

  it('lets line tension recover over time', () => {
    const state: FishingUiState = {
      phase: 'biting',
      baitId: 'basic',
      token: 't1',
      deadline: 9_000,
      fight: {
        progress: 0,
        tension: 0.8,
        tensionAt: 1_000,
        fishPull: 0,
        lineDangerUntil: 0,
        lineRecoveryUntil: 0,
        lineRecoveryStatus: 'safe',
      },
    }
    expect(getDisplayedFishingTension(state, 1_000)).toBe(0.8)
    expect(getDisplayedFishingTension(state, 2_200)).toBeCloseTo(0.3)
  })

  it('uses the random red-line window instead of tension to color the line red', () => {
    const state: FishingUiState = {
      phase: 'biting',
      baitId: 'basic',
      token: 't1',
      deadline: 9_000,
      fight: {
        progress: 0,
        tension: 0.2,
        tensionAt: 1_000,
        fishPull: 0,
        lineDangerUntil: 3_000,
        lineRecoveryUntil: 3_700,
        lineRecoveryStatus: 'warning',
      },
    }
    expect(getDisplayedFishingLineStatus(state, 2_999)).toBe('danger')
    expect(getDisplayedFishingLineStatus(state, 3_001)).toBe('warning')
    expect(getDisplayedFishingLineStatus(state, 3_701)).toBe('safe')

    const fight = state.fight!
    const highTensionState: FishingUiState = {
      ...state,
      fight: {
        ...fight,
        tension: 0.95,
        lineDangerUntil: 0,
        lineRecoveryUntil: 0,
      },
    }
    expect(getDisplayedFishingLineStatus(highTensionState, 1_000)).toBe('warning')
    expect(getDisplayedFishingLineColor(highTensionState, 1_000)).not.toBe('#ef4141')
  })
})
