import { expect, test } from '@playwright/test'

test('the browser harness shows growth without disposal and a flat guarded run', async ({ page }) => {
  await page.goto('/')
  const report = await page.evaluate(() => window.__disposeGuard.runBenchmark(12))
  const unmanaged = report.unmanaged.final.geometries + report.unmanaged.final.textures
  const guarded = report.guarded.final.geometries + report.guarded.final.textures

  expect(unmanaged).toBeGreaterThan(40)
  expect(guarded).toBeLessThanOrEqual(2)
})

test('one shared WebGL texture survives until the final owner releases it', async ({ page }) => {
  await page.goto('/')
  const proof = await page.evaluate(() => window.__disposeGuard.runSharedProof())

  expect(proof.actualWebGLTextureCreated).toBe(true)
  expect(proof.survivedFirstRelease).toBe(true)
  expect(proof.disposeEventsAfterFirstRelease).toBe(0)
  expect(proof.disposedAfterLastRelease).toBe(true)
  expect(proof.disposeEventsAfterLastRelease).toBe(3)
})

for (const width of [375, 768, 1024, 1440]) {
  test(`the page has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }))

    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
    await expect(page.getByRole('heading', { name: /Dispose what is orphaned/i })).toBeVisible()
  })
}
