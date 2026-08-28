import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'electron/game/**/*.test.ts',
      'electron/farm/**/*.test.ts',
      'electron/photoplus/**/*.test.ts',
      'electron/cutout/**/*.test.ts',
      'src/**/*.test.ts',
    ],
  },
})
