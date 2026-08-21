import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom', 'three'],
  },
  test: {
    environment: 'jsdom',
    exclude: ['tests/browser/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
    },
  },
})
