import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'demo',
  plugins: [react()],
  resolve: {
    alias: {
      'three-dispose-guard': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
  build: {
    outDir: '../site-dist',
    emptyOutDir: true,
  },
})
