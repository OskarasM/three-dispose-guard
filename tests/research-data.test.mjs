import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildCaptureDocument,
  captureToCsv,
  createCaptureBaseName,
  ensureUniqueOutputBaseName,
  RESEARCH_SCENARIOS,
  RESEARCH_VARIANTS,
  validateCaptureDocument,
} from '../scripts/research-data.mjs'

function sample(cycle) {
  return { cycle, geometries: cycle, textures: cycle + 1, programs: 1 }
}

function benchmark() {
  const variantReport = {
    samples: [sample(1), sample(2)],
    final: sample(2),
    peak: sample(2),
  }
  return {
    cycles: 2,
    unmanaged: variantReport,
    naive: variantReport,
    native: variantReport,
    guarded: variantReport,
    renderer: 'test renderer',
    browser: 'test browser',
    measuredAt: '2026-08-22T00:00:00.000Z',
  }
}

function report(scenario) {
  return {
    scenario,
    title: scenario,
    measuredAt: '2026-08-22T00:00:00.000Z',
    cycles: 2,
    renderer: 'test renderer',
    browser: 'test browser',
    series: {},
    assertions: [{ label: 'expected lifecycle', passed: true, detail: 'passed' }],
    comparisons: RESEARCH_VARIANTS.map((variant) => ({
      variant,
      outcome: variant === 'guarded' ? 'safe' : 'not-measured',
      measured: variant === 'guarded',
      detail: variant === 'guarded' ? 'measured' : 'not measured',
    })),
    notes: [],
  }
}

function suite() {
  const reports = RESEARCH_SCENARIOS.map((scenario) => report(scenario))
  const variantSummary = {
    finalTotals: [3],
    minimum: 3,
    maximum: 3,
    mean: 3,
    variance: 0,
  }
  return {
    schemaVersion: 2,
    measuredAt: '2026-08-22T00:00:00.000Z',
    runs: 1,
    cyclesPerRun: 2,
    warmupCycles: 1,
    renderer: 'test renderer',
    browser: 'test browser',
    protocol: {
      scenarioOrder: RESEARCH_SCENARIOS,
      executionOrder: 'fixed',
      nativeUniqueImplementation: 'r3f-create-root',
    },
    packageVersions: {},
    benchmarks: [benchmark()],
    summary: Object.fromEntries(RESEARCH_VARIANTS.map((variant) => [variant, variantSummary])),
    scenarioRuns: reports.map((scenarioReport) => ({ run: 1, report: scenarioReport })),
    scenarioSummary: Object.fromEntries(RESEARCH_SCENARIOS.map((scenario) => [
      scenario,
      {
        executions: 1,
        assertions: 1,
        passedAssertions: 1,
        failedAssertions: 0,
        passRate: 1,
      },
    ])),
    proofs: reports.slice(1),
  }
}

function capture() {
  return buildCaptureDocument({
    suite: suite(),
    capturedAt: '2026-08-22T00:00:00.000Z',
    captureId: 'capture-test',
    environment: {
      os: 'test os',
      platform: 'test',
      cpu: 'test cpu',
      logicalProcessors: 1,
      totalMemoryGiB: 1,
      browser: 'Chromium',
      browserVersion: '1.2.3',
      headless: true,
      gpuRenderer: 'test renderer',
    },
    provenance: {
      git: {
        commit: 'a'.repeat(40),
        workingTreeDirty: false,
      },
      packageLock: {
        sha256: 'b'.repeat(64),
        lockfileVersion: 3,
      },
      packageVersions: {
        three: '0.185.0',
        react: '19.2.0',
        r3f: '9.7.0',
        disposeGuard: '0.1.0',
      },
      timezone: {
        name: 'Europe/London',
        offsetMinutes: 60,
      },
      runtime: {
        node: 'v24.0.0',
        captureScript: 'scripts/capture-benchmark.mjs',
      },
    },
  })
}

describe('research capture data', () => {
  it('validates a complete six-scenario capture', () => {
    expect(validateCaptureDocument(capture(), { requirePassing: true })).toEqual([])
  })

  it('rejects a missing scenario execution and approximate versions', () => {
    const incomplete = capture()
    incomplete.scenarioRuns = incomplete.scenarioRuns.slice(1)
    incomplete.packageVersions.three = '0.185.x'

    const errors = validateCaptureDocument(incomplete)
    expect(errors.some((error) => error.includes('scenario executions'))).toBe(true)
    expect(errors.some((error) => error.includes('package version for three'))).toBe(true)
  })

  it('requires exactly one comparison row for every variant in every scenario report', () => {
    const invalid = capture()
    invalid.scenarioRuns[0].report.comparisons = [
      ...invalid.scenarioRuns[0].report.comparisons.filter(({ variant }) => variant !== 'native'),
      invalid.scenarioRuns[0].report.comparisons.find(({ variant }) => variant === 'guarded'),
    ]

    const errors = validateCaptureDocument(invalid)
    expect(errors.some((error) => error.includes('exactly one native comparison; found 0'))).toBe(true)
    expect(errors.some((error) => error.includes('exactly one guarded comparison; found 2'))).toBe(true)
  })

  it('serialises samples, variance, assertions, comparisons and provenance to CSV', () => {
    const csv = captureToCsv(capture())

    expect(csv).toContain('"record_type"')
    expect(csv).toContain('"sample"')
    expect(csv).toContain('"variant_summary"')
    expect(csv).toContain('"assertion"')
    expect(csv).toContain('"comparison"')
    expect(csv).toContain('"scenario_summary"')
    expect(csv).toContain('"variance"')
    expect(csv).toContain('"package_lock_sha256"')
    expect(csv).toContain('"Europe/London"')
    expect(csv).toContain('"captured_at"')
    expect(csv).toContain('"cycles_per_run"')
    expect(csv).toContain('"warmup_cycles"')
    expect(csv).toContain('"protocol_native_implementation"')
    expect(csv).toContain('"r3f-create-root"')
  })

  it('uses collision-safe output names', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dispose-guard-capture-'))
    try {
      const candidate = createCaptureBaseName({
        capturedAt: '2026-08-22T00:00:00.123Z',
        platform: 'Windows_NT',
        browser: 'Chromium',
        commit: 'abcdef1234567890',
      })
      await writeFile(path.join(directory, `${candidate}.json`), '{}')
      await writeFile(path.join(directory, `${candidate}-1.json`), '{}')

      expect(await ensureUniqueOutputBaseName(directory, candidate)).toBe(`${candidate}-2`)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('treats a CSV-only capture as an output-name collision', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dispose-guard-capture-'))
    try {
      const candidate = 'csv-only-capture'
      await writeFile(path.join(directory, `${candidate}.csv`), 'record_type')

      expect(await ensureUniqueOutputBaseName(directory, candidate)).toBe(`${candidate}-1`)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps the committed JSON Schema parseable and on version two', async () => {
    const schema = JSON.parse(
      await readFile(path.join(process.cwd(), 'benchmarks', 'research-capture.schema.json'), 'utf8'),
    )
    expect(schema.properties.schemaVersion.const).toBe(2)
    expect(schema.properties.artifactKind.const).toBe('provenance-complete-capture')
    expect(schema.required).toContain('provenance')
    expect(schema.required).toContain('scenarioRuns')
    expect(schema.$defs.scenarioReport.properties.comparisons.minItems).toBe(4)
    expect(schema.$defs.scenarioReport.properties.comparisons.maxItems).toBe(4)
  })
})
