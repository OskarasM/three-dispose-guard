import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

export const CAPTURE_SCHEMA_VERSION = 2
export const RESEARCH_VARIANTS = ['unmanaged', 'naive', 'native', 'guarded']
export const RESEARCH_SCENARIOS = ['unique', 'shared', 'cache', 'canvas', 'churn', 'in-flight']

function packageVersion(lock, name) {
  const key = `node_modules/${name}`
  const version = lock.packages?.[key]?.version
  if (!version) throw new Error(`package-lock.json does not contain an exact version for ${name}`)
  return version
}

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim()
}

export async function readProjectProvenance(root, capturedAt = new Date()) {
  const [packageSource, lockSource] = await Promise.all([
    readFile(path.join(root, 'package.json'), 'utf8'),
    readFile(path.join(root, 'package-lock.json')),
  ])
  const packageJson = JSON.parse(packageSource)
  const lock = JSON.parse(lockSource.toString('utf8'))
  const commit = git(root, ['rev-parse', 'HEAD'])
  const status = git(root, ['status', '--porcelain', '--untracked-files=normal'])

  return {
    git: {
      commit,
      workingTreeDirty: status.length > 0,
    },
    packageLock: {
      sha256: createHash('sha256').update(lockSource).digest('hex'),
      lockfileVersion: lock.lockfileVersion,
    },
    packageVersions: {
      three: packageVersion(lock, 'three'),
      react: packageVersion(lock, 'react'),
      r3f: packageVersion(lock, '@react-three/fiber'),
      disposeGuard: packageJson.version,
    },
    timezone: {
      name: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
      offsetMinutes: -capturedAt.getTimezoneOffset(),
    },
    runtime: {
      node: process.version,
      captureScript: 'scripts/capture-benchmark.mjs',
    },
  }
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function createCaptureBaseName({
  capturedAt,
  platform,
  browser,
  commit,
  dirty = false,
}) {
  const timestamp = new Date(capturedAt).toISOString().replace(/[:.]/g, '-')
  const suffix = dirty ? '-dirty' : ''
  return `${timestamp}-${slug(platform)}-${slug(browser)}-${commit.slice(0, 7)}${suffix}`
}

export async function ensureUniqueOutputBaseName(directory, candidate) {
  let attempt = candidate
  let suffix = 1
  while (true) {
    const collisions = await Promise.all(['json', 'csv'].map(async (extension) => {
      try {
        await access(path.join(directory, `${attempt}.${extension}`))
        return true
      } catch (error) {
        if (error?.code === 'ENOENT') return false
        throw error
      }
    }))
    if (collisions.some(Boolean)) {
      attempt = `${candidate}-${suffix++}`
      continue
    }
    return attempt
  }
}

export function buildCaptureDocument({
  suite,
  environment,
  provenance,
  capturedAt,
  captureId,
}) {
  return {
    ...suite,
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    artifactKind: 'provenance-complete-capture',
    captureId,
    capturedAt,
    packageVersions: provenance.packageVersions,
    provenance,
    environment,
  }
}

export function validateCaptureDocument(capture, { requirePassing = false } = {}) {
  const errors = []
  if (capture.schemaVersion !== CAPTURE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${CAPTURE_SCHEMA_VERSION}`)
  }
  if (capture.artifactKind !== 'provenance-complete-capture') {
    errors.push('artifactKind must be provenance-complete-capture')
  }
  if (!capture.captureId) errors.push('captureId is required')
  if (!capture.capturedAt) errors.push('capturedAt is required')
  if (!capture.provenance?.git?.commit) errors.push('git commit is required')
  if (!capture.provenance?.packageLock?.sha256) errors.push('package-lock SHA-256 is required')
  if (!capture.provenance?.timezone?.name) errors.push('timezone name is required')

  for (const [name, version] of Object.entries(capture.packageVersions ?? {})) {
    if (!version || /\bx\b|resolved exactly/i.test(String(version))) {
      errors.push(`package version for ${name} is not exact`)
    }
  }

  if (capture.benchmarks?.length !== capture.runs) {
    errors.push(`expected ${capture.runs} unique-resource benchmarks`)
  }
  for (const [runIndex, benchmark] of (capture.benchmarks ?? []).entries()) {
    for (const variant of RESEARCH_VARIANTS) {
      const samples = benchmark[variant]?.samples ?? []
      if (samples.length !== capture.cyclesPerRun) {
        errors.push(
          `run ${runIndex + 1} ${variant} has ${samples.length} samples; expected ${capture.cyclesPerRun}`,
        )
      }
    }
  }

  const expectedScenarioRuns = capture.runs * RESEARCH_SCENARIOS.length
  if (capture.scenarioRuns?.length !== expectedScenarioRuns) {
    errors.push(
      `expected ${expectedScenarioRuns} scenario executions; found ${capture.scenarioRuns?.length ?? 0}`,
    )
  }

  for (let run = 1; run <= capture.runs; run += 1) {
    for (const scenario of RESEARCH_SCENARIOS) {
      const matches = (capture.scenarioRuns ?? []).filter(
        (execution) => execution.run === run && execution.report?.scenario === scenario,
      )
      if (matches.length !== 1) {
        errors.push(`run ${run} must contain exactly one ${scenario} scenario report`)
      }
    }
  }

  for (const execution of capture.scenarioRuns ?? []) {
    const comparisons = execution.report?.comparisons ?? []
    for (const variant of RESEARCH_VARIANTS) {
      const count = comparisons.filter((comparison) => comparison.variant === variant).length
      if (count !== 1) {
        errors.push(
          `run ${execution.run} ${execution.report?.scenario ?? 'unknown'} must contain exactly one ${variant} comparison; found ${count}`,
        )
      }
    }
    const unexpected = comparisons.filter(
      (comparison) => !RESEARCH_VARIANTS.includes(comparison.variant),
    )
    if (comparisons.length !== RESEARCH_VARIANTS.length || unexpected.length > 0) {
      errors.push(
        `run ${execution.run} ${execution.report?.scenario ?? 'unknown'} must contain exactly ${RESEARCH_VARIANTS.length} recognised comparison rows`,
      )
    }
  }

  if (requirePassing) {
    for (const execution of capture.scenarioRuns ?? []) {
      for (const assertion of execution.report?.assertions ?? []) {
        if (!assertion.passed) {
          errors.push(
            `run ${execution.run} ${execution.report.scenario}: assertion failed: ${assertion.label}`,
          )
        }
      }
    }
  }

  return errors
}

const csvColumns = [
  'schema_version',
  'capture_id',
  'artifact_kind',
  'captured_at',
  'runs',
  'cycles_per_run',
  'warmup_cycles',
  'protocol_scenario_order',
  'protocol_execution_order',
  'protocol_native_implementation',
  'record_type',
  'run',
  'scenario',
  'variant',
  'cycle',
  'assertion',
  'comparison_outcome',
  'measured',
  'passed',
  'geometries',
  'textures',
  'programs',
  'final_total',
  'minimum',
  'maximum',
  'mean',
  'variance',
  'executions',
  'assertion_count',
  'passed_assertions',
  'failed_assertions',
  'pass_rate',
  'detail',
  'measured_at',
  'renderer',
  'browser',
  'host_os',
  'host_cpu',
  'logical_processors',
  'total_memory_gib',
  'browser_version',
  'headless',
  'package_three',
  'package_react',
  'package_r3f',
  'package_dispose_guard',
  'git_commit',
  'git_worktree_dirty',
  'package_lock_sha256',
  'timezone',
  'timezone_offset_minutes',
]

function csvValue(value) {
  return JSON.stringify(value == null ? '' : String(value))
}

function sharedColumns(capture) {
  return {
    schema_version: capture.schemaVersion,
    capture_id: capture.captureId,
    artifact_kind: capture.artifactKind,
    captured_at: capture.capturedAt,
    runs: capture.runs,
    cycles_per_run: capture.cyclesPerRun,
    warmup_cycles: capture.warmupCycles,
    protocol_scenario_order: capture.protocol?.scenarioOrder?.join('|'),
    protocol_execution_order: capture.protocol?.executionOrder,
    protocol_native_implementation: capture.protocol?.nativeUniqueImplementation,
    measured_at: capture.capturedAt,
    renderer: capture.renderer,
    browser: capture.browser,
    host_os: capture.environment?.os,
    host_cpu: capture.environment?.cpu,
    logical_processors: capture.environment?.logicalProcessors,
    total_memory_gib: capture.environment?.totalMemoryGiB,
    browser_version: capture.environment?.browserVersion,
    headless: capture.environment?.headless,
    package_three: capture.packageVersions?.three,
    package_react: capture.packageVersions?.react,
    package_r3f: capture.packageVersions?.r3f,
    package_dispose_guard: capture.packageVersions?.disposeGuard,
    git_commit: capture.provenance?.git?.commit,
    git_worktree_dirty: capture.provenance?.git?.workingTreeDirty,
    package_lock_sha256: capture.provenance?.packageLock?.sha256,
    timezone: capture.provenance?.timezone?.name,
    timezone_offset_minutes: capture.provenance?.timezone?.offsetMinutes,
  }
}

export function captureToCsv(capture) {
  const shared = sharedColumns(capture)
  const rows = [{ ...shared, record_type: 'metadata' }]

  for (const [runIndex, benchmark] of (capture.benchmarks ?? []).entries()) {
    for (const variant of RESEARCH_VARIANTS) {
      for (const sample of benchmark[variant].samples) {
        rows.push({
          ...shared,
          record_type: 'sample',
          run: runIndex + 1,
          scenario: 'unique',
          variant,
          cycle: sample.cycle,
          geometries: sample.geometries,
          textures: sample.textures,
          programs: sample.programs,
          measured_at: benchmark.measuredAt,
          renderer: benchmark.renderer,
          browser: benchmark.browser,
        })
      }
    }
  }

  for (const variant of RESEARCH_VARIANTS) {
    const summary = capture.summary?.[variant]
    rows.push({
      ...shared,
      record_type: 'variant_summary',
      scenario: 'unique',
      variant,
      final_total: summary?.finalTotals?.join('|'),
      minimum: summary?.minimum,
      maximum: summary?.maximum,
      mean: summary?.mean,
      variance: summary?.variance,
    })
  }

  for (const execution of capture.scenarioRuns ?? []) {
    const report = execution.report
    for (const assertion of report.assertions ?? []) {
      rows.push({
        ...shared,
        record_type: 'assertion',
        run: execution.run,
        scenario: report.scenario,
        assertion: assertion.label,
        passed: assertion.passed,
        detail: assertion.detail,
        measured_at: report.measuredAt,
        renderer: report.renderer,
        browser: report.browser,
      })
    }
    for (const comparison of report.comparisons ?? []) {
      rows.push({
        ...shared,
        record_type: 'comparison',
        run: execution.run,
        scenario: report.scenario,
        variant: comparison.variant,
        comparison_outcome: comparison.outcome,
        measured: comparison.measured,
        detail: comparison.detail,
        measured_at: report.measuredAt,
        renderer: report.renderer,
        browser: report.browser,
      })
    }
  }

  for (const scenario of RESEARCH_SCENARIOS) {
    const summary = capture.scenarioSummary?.[scenario]
    rows.push({
      ...shared,
      record_type: 'scenario_summary',
      scenario,
      executions: summary?.executions,
      assertion_count: summary?.assertions,
      passed_assertions: summary?.passedAssertions,
      failed_assertions: summary?.failedAssertions,
      pass_rate: summary?.passRate,
    })
  }

  return [
    csvColumns.map(csvValue).join(','),
    ...rows.map((row) => csvColumns.map((column) => csvValue(row[column])).join(',')),
  ].join('\n')
}

