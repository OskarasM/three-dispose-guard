import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

interface Lockfile {
  packages?: Record<string, { version?: string }>
}

const packageLock = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package-lock.json', import.meta.url)), 'utf8'),
) as Lockfile

function lockedVersion(key: string): string {
  const version = packageLock.packages?.[key]?.version
  if (!version) {
    throw new Error(`package-lock.json does not contain an exact version for ${key || 'the package'}`)
  }
  return version
}

const researchPackageVersions = {
  three: lockedVersion('node_modules/three'),
  react: lockedVersion('node_modules/react'),
  r3f: lockedVersion('node_modules/@react-three/fiber'),
  disposeGuard: lockedVersion(''),
}

export default defineConfig({
  root: 'demo',
  plugins: [react()],
  define: {
    __THREE_DISPOSE_GUARD_PACKAGE_VERSIONS__: JSON.stringify(researchPackageVersions),
  },
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
