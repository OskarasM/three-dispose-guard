// Rasterise the icon set from the one SVG, so every size is the same mark.
//
// A site needs more than favicon.svg: Safari wants an apple-touch-icon, Android
// installs read the manifest icons, and a few contexts still ask for a PNG.
// Drawing those by hand means five files that drift apart, so they are all
// generated from demo/public/favicon.svg and committed.
//
// Chromium comes with Playwright, which is already here for the browser tests,
// so this needs no image library.
//
// Run: node scripts/render-icons.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const SOURCE = 'demo/public/favicon.svg'
// 32 for the tab and older bookmark contexts, 180 for Safari on iOS, 192 and
// 512 for the manifest an Android install reads.
const SIZES = [32, 180, 192, 512]

const svg = readFileSync(SOURCE, 'utf8')
const browser = await chromium.launch()

for (const size of SIZES) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  })
  await page.setContent(
    `<style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  )
  const png = await page.screenshot({ omitBackground: false })
  const out = `demo/public/icon-${size}.png`
  writeFileSync(out, png)
  console.log(`${out} ${png.length} bytes`)
  await page.close()
}

await browser.close()
