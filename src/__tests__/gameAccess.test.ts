import { afterEach, describe, expect, it } from 'vitest'
import {
  consumePendingGamePage,
  isGameAccountAuthenticated,
  requiresGameAccount,
  setGameAccountState,
  setPendingGamePage,
} from '../gameAccess'

afterEach(() => {
  setGameAccountState(null)
  consumePendingGamePage()
})

describe('game page account access', () => {
  it('requires an account for shared game pages but not pet and tool pages', () => {
    expect(requiresGameAccount('farm-page')).toBe(true)
    expect(requiresGameAccount('shop-page')).toBe(true)
    expect(requiresGameAccount('backpack-page')).toBe(true)
    expect(requiresGameAccount('fishing-page')).toBe(true)
    expect(requiresGameAccount('friend-page')).toBe(true)
    expect(requiresGameAccount('pet-settings-page')).toBe(false)
    expect(requiresGameAccount('image-page')).toBe(false)
  })

  it('tracks authentication and the page requested before login', () => {
    expect(isGameAccountAuthenticated()).toBe(false)
    setPendingGamePage('farm-page')
    expect(consumePendingGamePage()).toBe('farm-page')
    setGameAccountState({ account: { userId: 42 } } as never)
    expect(isGameAccountAuthenticated()).toBe(true)
  })
})
