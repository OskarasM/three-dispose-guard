import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { build as buildWithEsbuild } from 'esbuild'

const root = process.cwd()
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const npmCli = process.env.npm_execpath
const nodeCommand = process.execPath

function runNpm(args, options = {}) {
  assert.ok(npmCli, 'npm_execpath is required; run this script through npm.')
  return run(nodeCommand, [npmCli, ...args], options)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  })

  if (result.status !== 0) {
    throw new Error(
      [`Command failed: ${command} ${args.join(' ')}`, result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n'),
    )
  }

  return result.stdout
}

assert.equal(packageJson.version, '0.1.0')
assert.equal(packageJson.sideEffects, false)
assert.equal(
  Object.keys(packageJson.dependencies ?? {}).length,
  0,
  'The package must have zero runtime dependencies.',
)

const exportFiles = Object.values(packageJson.exports)
  .flatMap((entry) => (typeof entry === 'string' ? [entry] : Object.values(entry)))
  .filter((file) => file.startsWith('./dist/'))

for (const file of exportFiles) {
  assert.ok(existsSync(path.join(root, file)), `Missing package export: ${file}`)
}

const coreBundles = [
  await readFile(path.join(root, 'dist/index.js'), 'utf8'),
  await readFile(path.join(root, 'dist/index.cjs'), 'utf8'),
]

for (const bundle of coreBundles) {
  assert.doesNotMatch(bundle, /@react-three\/fiber|from\s*["']react["']|require\(["']react["']\)/)
}

const treeShakeResult = await buildWithEsbuild({
  stdin: {
    contents: "import { createResourceRegistry } from './dist/index.js'; console.log(createResourceRegistry)",
    resolveDir: root,
    sourcefile: 'consumer.mjs',
  },
  bundle: true,
  format: 'esm',
  metafile: true,
  minify: true,
  platform: 'browser',
  treeShaking: true,
  write: false,
})

const treeShakenBundle = treeShakeResult.outputFiles[0]?.text ?? ''
assert.ok(treeShakenBundle.length > 0, 'Tree-shaken core consumer bundle was empty.')
assert.doesNotMatch(treeShakenBundle, /@react-three\/fiber|react-dom|GuardedPrimitive/)
for (const input of Object.keys(treeShakeResult.metafile.inputs)) {
  assert.doesNotMatch(
    input.replaceAll('\\', '/'),
    /node_modules\/(?:react|react-dom|@react-three\/fiber|three)\//,
  )
}

const esmCore = await import(pathToFileURL(path.join(root, 'dist/index.js')).href)
const esmReact = await import(pathToFileURL(path.join(root, 'dist/react.js')).href)
const esmR3f = await import(pathToFileURL(path.join(root, 'dist/r3f.js')).href)
const require = createRequire(import.meta.url)
const cjsCore = require(path.join(root, 'dist/index.cjs'))
const cjsReact = require(path.join(root, 'dist/react.cjs'))
const cjsR3f = require(path.join(root, 'dist/r3f.cjs'))

assert.equal(typeof esmCore.createResourceRegistry, 'function')
assert.equal(typeof cjsCore.createResourceRegistry, 'function')
assert.equal(typeof esmReact.useResourceLease, 'function')
assert.equal(typeof cjsReact.useResourceLease, 'function')
assert.equal(typeof esmR3f.createR3FResourceCache, 'function')
assert.equal(typeof cjsR3f.createR3FResourceCache, 'function')

const dryRun = JSON.parse(runNpm(['pack', '--dry-run', '--json']))
const packedPaths = new Set(dryRun[0].files.map((file) => file.path))

for (const required of ['LICENSE', 'README.md', 'package.json']) {
  assert.ok(packedPaths.has(required), `Packed package is missing ${required}`)
}

for (const file of exportFiles) {
  assert.ok(packedPaths.has(file.replace(/^\.\//, '')), `Packed package is missing ${file}`)
}

for (const forbidden of ['src/', 'demo/', 'tests/', 'benchmarks/']) {
  assert.equal(
    [...packedPaths].some((file) => file.startsWith(forbidden)),
    false,
    `Packed package unexpectedly includes ${forbidden}`,
  )
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'three-dispose-guard-consumer-'))

try {
  const packOutput = JSON.parse(
    runNpm(['pack', '--json', '--pack-destination', temporaryRoot]),
  )
  const tarball = path.join(temporaryRoot, packOutput[0].filename)

  await writeFile(
    path.join(temporaryRoot, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  )
  runNpm(
    ['install', tarball, '--omit=peer', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: temporaryRoot },
  )

  for (const absentPeer of ['react', '@react-three/fiber', 'three']) {
    assert.equal(
      existsSync(path.join(temporaryRoot, 'node_modules', ...absentPeer.split('/'))),
      false,
      `Core-only install unexpectedly included peer ${absentPeer}`,
    )
  }


  const consumerRequire = createRequire(path.join(temporaryRoot, 'package.json'))
  for (const specifier of [
    'three-dispose-guard',
    'three-dispose-guard/react',
    'three-dispose-guard/r3f',
    'three-dispose-guard/package.json',
  ]) {
    assert.doesNotThrow(() => consumerRequire.resolve(specifier), `Unresolvable export: ${specifier}`)
  }

  run(nodeCommand, ['--input-type=module', '-e', "import('three-dispose-guard').then(m => { if (typeof m.createResourceRegistry !== 'function') process.exit(1) })"], { cwd: temporaryRoot })
  run(nodeCommand, ['-e', "const m = require('three-dispose-guard'); if (typeof m.createResourceRegistry !== 'function') process.exit(1)"], { cwd: temporaryRoot })

  const consumer = path.join(temporaryRoot, 'consumer.ts')
  await writeFile(
    consumer,
    "import { createResourceRegistry } from 'three-dispose-guard'\ncreateResourceRegistry({ mode: 'audit' })\n",
  )
  const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')
  run(nodeCommand, [tsc, consumer, '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022'], { cwd: temporaryRoot })
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

console.log(`Package smoke passed with ${packedPaths.size} files and a React-free consumer install.`)
