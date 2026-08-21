import os from 'node:os'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const root = process.cwd()
const outputDirectory = path.join(root, 'benchmarks', 'results')
const date = new Date().toISOString().slice(0, 10)
const baseName = `${date}-windows-chromium`
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

await server.listen()
const browser = await chromium.launch({ headless: true })

try {
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' })
  const suite = await page.evaluate(() => window.__disposeGuard.runResearchSuite(5, 50))
  const cpu = os.cpus()[0]
  const captured = {
    ...suite,
    environment: {
      os: `${os.type()} ${os.release()} ${os.arch()}`,
      cpu: cpu?.model ?? 'not reported',
      logicalProcessors: os.cpus().length,
      totalMemoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
      browser: 'Chromium',
      browserVersion: browser.version(),
      headless: true,
    },
  }

  const variants = ['unmanaged', 'naive', 'native', 'guarded']
  const header = [
    'run',
    'variant',
    'cycle',
    'geometries',
    'textures',
    'programs',
    'measured_at',
    'renderer',
    'browser',
    'host_os',
    'host_cpu',
    'browser_version',
  ]
  const rows = captured.benchmarks.flatMap((report, run) =>
    variants.flatMap((variant) =>
      report[variant].samples.map((sample) => [
        run + 1,
        variant,
        sample.cycle,
        sample.geometries,
        sample.textures,
        sample.programs,
        report.measuredAt,
        report.renderer,
        report.browser,
        captured.environment.os,
        captured.environment.cpu,
        captured.environment.browserVersion,
      ]),
    ),
  )
  const csv = [header, ...rows]
    .map((row) => row.map((value) => JSON.stringify(String(value))).join(','))
    .join('\n')

  await mkdir(outputDirectory, { recursive: true })
  await writeFile(
    path.join(outputDirectory, `${baseName}.json`),
    `${JSON.stringify(captured, null, 2)}\n`,
    'utf8',
  )
  await writeFile(path.join(outputDirectory, `${baseName}.csv`), `${csv}\n`, 'utf8')

  const summary = Object.fromEntries(
    variants.map((variant) => [variant, captured.summary[variant]]),
  )
  console.log(JSON.stringify({
    json: path.join('benchmarks', 'results', `${baseName}.json`),
    csv: path.join('benchmarks', 'results', `${baseName}.csv`),
    renderer: captured.renderer,
    environment: captured.environment,
    summary,
    proofPasses: captured.proofs.map((proof) => ({
      scenario: proof.scenario,
      passed: proof.assertions.every((assertion) => assertion.passed),
    })),
  }, null, 2))
} finally {
  await browser.close()
  await server.close()
}
