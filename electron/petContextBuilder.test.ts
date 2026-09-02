import { describe, expect, it } from 'vitest'
import { buildSituationalLineUserPrompt } from './petContextBuilder'

describe('buildSituationalLineUserPrompt', () => {
  it('asks the model to tell a short dream after waking', () => {
    const prompt = buildSituationalLineUserPrompt('dream')
    expect(prompt).toMatch(/梦/)
  })
})
