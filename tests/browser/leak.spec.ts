import AxeBuilder from '@axe-core/playwright'
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
test('the research lab has no serious WCAG 2 A or AA violations', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The full accessibility scan runs in Chromium.')

  await page.goto('/')
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )

  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([])
})


test('the scenario selector is a labelled keyboard-operable single-choice group', async ({ page }) => {
  await page.goto('/')

  const picker = page.getByRole('group', { name: 'Choose a research scenario' })
  const choices = picker.getByRole('button')
  await expect(choices).toHaveCount(6)
  await expect(choices.nth(0)).toHaveAttribute('aria-pressed', 'true')

  await choices.nth(1).focus()
  await page.keyboard.press('Enter')
  await expect(choices.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { name: 'Two live users' })).toBeVisible()

  await page.keyboard.press('Tab')
  await expect(choices.nth(2)).toBeFocused()
  const focusStyle = await choices.nth(2).evaluate((element) => {
    const style = getComputedStyle(element)
    return { style: style.outlineStyle, width: style.outlineWidth }
  })
  expect(focusStyle).toEqual({ style: 'solid', width: '2px' })
})

test('mobile controls keep visible labels and 44-pixel targets', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')

  const source = page.getByRole('link', { name: /Source/i })
  await expect(source).toBeVisible()

  const controls = [
    source,
    page.getByRole('button', { name: /Copy/i }),
    page.getByRole('button', { name: /Unique resources/i }),
    page.getByRole('button', { name: /Run selected proof/i }),
  ]
  for (const control of controls) {
    const box = await control.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }
})

test('reduced-motion preferences disable smooth scrolling and transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  const motion = await page.getByRole('button', { name: /Unique resources/i }).evaluate((element) => ({
    transitionDuration: Number.parseFloat(getComputedStyle(element).transitionDuration),
    scrollBehaviour: getComputedStyle(document.documentElement).scrollBehavior,
  }))

  expect(motion.transitionDuration).toBeLessThanOrEqual(0.001)
  expect(motion.scrollBehaviour).toBe('auto')
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
test('the visible lab exposes semantic benchmark results and direct documentation', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('button', { name: /Copy/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /R3F migration guide/i })).toHaveAttribute(
    'href',
    /docs\/r3f-guide\.md$/,
  )
  await expect(page.getByRole('link', { name: /API reference/i })).toHaveAttribute(
    'href',
    /docs\/api\.md$/,
  )

  await page.getByRole('button', { name: /Run selected proof/i }).click()
  const table = page.getByRole('table', {
    name: 'Final Three.js resource count after the selected run',
  })
  await expect(table).toBeVisible({ timeout: 30_000 })
  await expect(table.getByRole('row')).toHaveCount(5)
  await expect(table.getByRole('rowheader', { name: 'Dispose Guard' })).toBeVisible()
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
