import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'demo',
  plugins: [react()],
  resolve: {
    alias: [
      { find: 'three-dispose-guard/r3f', replacement: fileURLToPath(new URL('./src/r3f.tsx', import.meta.url)) },
      { find: 'three-dispose-guard/react', replacement: fileURLToPath(new URL('./src/react.tsx', import.meta.url)) },
      { find: 'three-dispose-guard', replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
    ],
  },
  build: {
    outDir: '../site-dist',
    emptyOutDir: true,
  },
})
