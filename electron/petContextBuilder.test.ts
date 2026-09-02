import { describe, expect, it } from 'vitest'
import { buildSituationalLineUserPrompt } from './petContextBuilder'

describe('buildSituationalLineUserPrompt', () => {
  it('asks the model to tell a short dream after waking', () => {
    const prompt = buildSituationalLineUserPrompt('dream')
    expect(prompt).toMatch(/梦/)
  })

  it('asks the model to remind about farm harvest, bugs, and watering', () => {
    expect(buildSituationalLineUserPrompt('harvest')).toMatch(/收获|收/)
    expect(buildSituationalLineUserPrompt('bug')).toMatch(/虫/)
    expect(buildSituationalLineUserPrompt('water')).toMatch(/浇水/)
  })
})
