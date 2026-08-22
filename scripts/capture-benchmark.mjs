import os from 'node:os'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import {
  buildCaptureDocument,
  captureToCsv,
  createCaptureBaseName,
  ensureUniqueOutputBaseName,
  readProjectProvenance,
  validateCaptureDocument,
} from './research-data.mjs'

const root = process.cwd()
const outputDirectory = path.join(root, 'benchmarks', 'results')
const port = 4180

const server = await createServer({
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'warn',
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
  },
})

let browser

try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' })
  const suite = await page.evaluate(() => window.__disposeGuard.runResearchSuite(5, 50))
  const capturedAt = new Date()
  const provenance = await readProjectProvenance(root, capturedAt)
  const cpu = os.cpus()[0]
  const environment = {
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    platform: os.platform(),
    cpu: cpu?.model.trim() || 'not reported',
    logicalProcessors: os.cpus().length,
    totalMemoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
    browser: 'Chromium',
    browserVersion: browser.version(),
    headless: true,
    gpuRenderer: suite.renderer,
  }

  await mkdir(outputDirectory, { recursive: true })
  const candidate = createCaptureBaseName({
    capturedAt,
    platform: os.platform(),
    browser: environment.browser,
    commit: provenance.git.commit,
    dirty: provenance.git.workingTreeDirty,
  })
  const baseName = await ensureUniqueOutputBaseName(outputDirectory, candidate)
  const captured = buildCaptureDocument({
    suite,
    environment,
    provenance,
    capturedAt: capturedAt.toISOString(),
    captureId: baseName,
  })
  const validationErrors = validateCaptureDocument(captured, { requirePassing: true })
  if (validationErrors.length > 0) {
    throw new Error(`Capture validation failed:\n- ${validationErrors.join('\n- ')}`)
  }

  const jsonPath = path.join(outputDirectory, `${baseName}.json`)
  const csvPath = path.join(outputDirectory, `${baseName}.csv`)
  await writeFile(jsonPath, `${JSON.stringify(captured, null, 2)}\n`, 'utf8')
  await writeFile(csvPath, `${captureToCsv(captured)}\n`, 'utf8')

  console.log(JSON.stringify({
    json: path.relative(root, jsonPath),
    csv: path.relative(root, csvPath),
    captureId: captured.captureId,
    renderer: captured.renderer,
    environment: captured.environment,
    provenance: captured.provenance,
    summary: captured.summary,
    scenarioPasses: Object.fromEntries(
      Object.entries(captured.scenarioSummary).map(([scenario, summary]) => [
        scenario,
        summary.failedAssertions === 0,
      ]),
    ),
  }, null, 2))
} finally {
  await browser?.close()
  await server.close()
}
