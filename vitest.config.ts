import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['electron/farm/**/*.test.ts'],
  },
})
