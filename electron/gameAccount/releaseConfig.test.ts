import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { getGameApiBaseUrl } from './config'

const require = createRequire(import.meta.url)
const { load } = require('js-yaml')

it('provides the configured repository API address to every installer matrix build', () => {
  const workflow = load(readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8'))
  const build = workflow.jobs.build
  const step = build.steps.find((step: { name: string }) => step.name === 'Build installers')
  expect(step.env.GAME_API_BASE_URL).toBe('${{ vars.GAME_API_BASE_URL }}')
  expect(build.strategy.matrix.include.map((entry: { command: string }) => entry.command)).toEqual(['package:mac', 'package:win', 'package:linux'])
  expect(getGameApiBaseUrl(true, { GAME_API_BASE_URL: 'https://game.example.invalid' })).toBe('https://game.example.invalid')
  for (const value of ['', 'http://localhost:8088', 'https://user:password@example.com']) {
    expect(() => getGameApiBaseUrl(true, { GAME_API_BASE_URL: value })).toThrow()
  }
})
