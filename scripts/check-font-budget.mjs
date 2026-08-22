#!/usr/bin/env node
// Self-hosting type means the page owns its own weight. Without a gate, adding
// one more face or forgetting to subset one is invisible until someone loads
// the site on a phone. 150 kB is the ceiling for every font the page fetches.

import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const FONT_DIR = path.join(process.cwd(), 'demo', 'public', 'fonts')
const CEILING_BYTES = 150 * 1024

const files = (await readdir(FONT_DIR)).filter((f) => f.endsWith('.woff2')).sort()

if (files.length === 0) {
  console.error(`No .woff2 files found in ${FONT_DIR}. Fonts are self-hosted, not fetched from a CDN.`)
  process.exit(1)
}

let total = 0
const rows = []
for (const file of files) {
  const { size } = await stat(path.join(FONT_DIR, file))
  total += size
  rows.push([file, size])
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`
for (const [file, size] of rows) console.log(`  ${file.padEnd(30)} ${kb(size).padStart(9)}`)
console.log(`  ${'total'.padEnd(30)} ${kb(total).padStart(9)}  ceiling ${kb(CEILING_BYTES)}`)

if (total > CEILING_BYTES) {
  console.error(
    `\nFont payload is ${kb(total)}, over the ${kb(CEILING_BYTES)} ceiling.\n` +
    'Subset harder or drop a weight before raising this number.',
  )
  process.exit(1)
}

// A face nobody references is weight for nothing, and the licence obligation
// stays whether it is used or not.
const { readFile } = await import('node:fs/promises')
const css = await readFile(path.join(process.cwd(), 'demo', 'src', 'fonts.css'), 'utf8')
const unreferenced = files.filter((f) => !css.includes(f))
if (unreferenced.length > 0) {
  console.error(`\nShipped but never referenced by fonts.css: ${unreferenced.join(', ')}`)
  process.exit(1)
}

// Every face here is under a licence that requires the text to travel with it.
const licences = (await readdir(FONT_DIR)).filter((f) => f.endsWith('.txt'))
if (licences.length === 0) {
  console.error('\nNo licence text beside the fonts. Every face shipped here is OFL 1.1.')
  process.exit(1)
}

console.log(`\nWithin budget. ${licences.length} licence files present.`)
