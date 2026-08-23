// Plain ASCII and British English, checked rather than remembered.
//
// Two rules, both easy to break by accident and both visible to anyone who reads the repo:
//
// 1. No em-dashes, en-dashes or smart quotes. They arrive invisibly through copy and paste
//    and then turn up mangled in a terminal or a diff.
// 2. British spellings in prose. CSS property names, Three.js API names and package names
//    are American by definition and are skipped by extension rather than by exception list,
//    so the check does not need updating every time a new colour property appears.
//
// Run: node scripts/check-prose.mjs

import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'

const SKIP_DIRS = new Set(['node_modules', 'dist', 'site-dist', '.git', 'results', '.vite', '.vercel', 'test-results', 'playwright-report'])
// Prose lives in these. CSS, JSON lockfiles and HTML are excluded because their American
// spellings are language keywords, not prose.
const PROSE_EXTENSIONS = new Set(['.md', '.ts', '.tsx', '.mjs', '.js'])

const NON_ASCII_PUNCTUATION = /[–—‘’“”]/
const AMERICAN =
  /\b(behavior|behaviors|optimize|optimized|optimization|organize|organized|analyze|analyzed|customize|customized|recognize|recognized)\b/i

// Some American spellings are excluded from the list entirely, because in a JavaScript
// codebase they are overwhelmingly API names rather than prose: `color` and `center` (CSS
// and Three.js), and `normalize`, `serialize` and `initialize` (path.normalize and
// friends). A check that fires on `path.normalize` gets switched off inside a week, and a
// check nobody runs is worse than a narrower one that everybody does.

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      yield* walk(join(dir, entry.name))
    } else if (PROSE_EXTENSIONS.has(extname(entry.name))) {
      yield join(dir, entry.name)
    }
  }
}

const problems = []
const self = import.meta.url

for await (const file of walk('.')) {
  // This file contains the patterns it looks for.
  if (self.endsWith(file.replace(/\\/g, '/').replace(/^\.\//, ''))) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (NON_ASCII_PUNCTUATION.test(line)) {
      problems.push(`${file}:${i + 1}: non-ASCII dash or quote: ${line.trim().slice(0, 80)}`)
    }
    // A method call is an API name, not prose. `.analyze()` from axe-core and
    // `.normalize()` from path are spelled the way their authors spelled them,
    // and a check that fires on those gets switched off inside a week.
    const american = line.replace(/\.\w+/g, '').match(AMERICAN)
    if (american) {
      problems.push(`${file}:${i + 1}: American spelling "${american[0]}": ${line.trim().slice(0, 80)}`)
    }
  })
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(`\n${problems.length} problem(s).`)
  process.exit(1)
}

console.log('Prose check passed: plain ASCII, British spellings.')
