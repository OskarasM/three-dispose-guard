import { expect, test } from '@playwright/test'

test('@smoke the research lab loads without page or console errors', async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value(contextId: string, ...args: unknown[]) {
        if (contextId === 'webgl2') return null
        return Reflect.apply(originalGetContext, this, [contextId, ...args])
      },
    })
  })

  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  const response = await page.goto('/')

  expect(response?.ok()).toBe(true)
  await expect(page.getByRole('heading', { name: /Dispose the orphan/i })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Static fallback', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Run selected proof/i })).toBeEnabled({ timeout: 20_000 })
  expect(errors).toEqual([])
})

test('the browser harness shows growth without disposal and a flat guarded run', async ({ page }) => {
  await page.goto('/')
  const report = await page.evaluate(() => window.__disposeGuard.runBenchmark(12))
  const unmanaged = report.unmanaged.final.geometries + report.unmanaged.final.textures
  const guarded = report.guarded.final.geometries + report.guarded.final.textures
  const naive = report.naive.final.geometries + report.naive.final.textures
  const native = report.native.final.geometries + report.native.final.textures

  expect(unmanaged).toBeGreaterThan(40)
  expect(guarded).toBeLessThanOrEqual(2)
  expect(naive).toBeLessThanOrEqual(2)
  expect(native).toBeLessThanOrEqual(2)
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

test('all specialised lifecycle proofs pass in a real browser', async ({ page }) => {
  await page.goto('/')
  const reports = await page.evaluate(async () => {
    const ids = ['shared', 'cache', 'canvas', 'churn', 'in-flight'] as const
    const results = []
    for (const id of ids) results.push(await window.__disposeGuard.runScenario(id, 8))
    return results
  })

  for (const report of reports) {
    expect(report.assertions, report.scenario).not.toHaveLength(0)
    expect(report.assertions.every((assertion) => assertion.passed), report.scenario).toBe(true)
  }
})

test('the compact research suite exposes raw runs, variance and proofs', async ({ page }) => {
  await page.goto('/')
  const suite = await page.evaluate(() => window.__disposeGuard.runResearchSuite(2, 6))

  expect(suite.runs).toBe(2)
  expect(suite.cyclesPerRun).toBe(6)
  expect(suite.summary.guarded.finalTotals).toHaveLength(2)
  expect(suite.proofs).toHaveLength(5)
  expect(suite.proofs.every((proof) => proof.assertions.every((item) => item.passed))).toBe(true)
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
    await expect(page.getByRole('heading', { name: /Dispose the orphan/i })).toBeVisible()
  })
}
