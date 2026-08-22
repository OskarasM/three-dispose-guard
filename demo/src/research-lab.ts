import {
  AmbientLight,
  BoxGeometry,
  DataTexture,
  Loader,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  WebGLRenderer,
} from 'three'
import { createResourceRegistry } from 'three-dispose-guard'
import {
  runBenchmark,
  runSharedAssetProof,
  type BenchmarkReport,
  type BenchmarkVariant,
  type MemorySample,
} from './webgl-lab'

declare const __THREE_DISPOSE_GUARD_PACKAGE_VERSIONS__: Readonly<{
  three: string
  react: string
  r3f: string
  disposeGuard: string
}>

export type ScenarioId =
  | 'unique'
  | 'shared'
  | 'cache'
  | 'canvas'
  | 'churn'
  | 'in-flight'

export interface ScenarioDefinition {
  id: ScenarioId
  index: string
  title: string
  question: string
  description: string
}

export const scenarios: readonly ScenarioDefinition[] = [
  {
    id: 'unique',
    index: '01',
    title: 'Unique resources',
    question: 'What grows when every mount creates new GPU resources?',
    description: 'Four equal runs compare retained resources with three explicit cleanup strategies.',
  },
  {
    id: 'shared',
    index: '02',
    title: 'Two live users',
    question: 'Does the first unmount break the second user?',
    description: 'An actual WebGL texture is shared by two meshes and inspected after each release.',
  },
  {
    id: 'cache',
    index: '03',
    title: 'Loader cache reuse',
    question: 'Can zero mounted users still be a valid owner state?',
    description: 'A cache protection keeps a reusable result alive until explicit eviction.',
  },
  {
    id: 'canvas',
    index: '04',
    title: 'Canvas remount',
    question: 'Which cleanup belongs to the scene, and which belongs to the renderer?',
    description: 'Scene resources and WebGL contexts are measured as separate lifecycles.',
  },
  {
    id: 'churn',
    index: '05',
    title: 'Shared churn',
    question: 'Does repeated hand-off change the final disposal count?',
    description: 'Two consumers alternate around one protected asset for a fixed number of cycles.',
  },
  {
    id: 'in-flight',
    index: '06',
    title: 'In-flight eviction',
    question: 'What happens when an evicted load resolves late?',
    description: 'A real R3F preload is evicted before its deterministic loader callback resolves.',
  },
]

export interface ProofAssertion {
  label: string
  passed: boolean
  detail: string
}

export type ComparisonOutcome =
  | 'safe'
  | 'unsafe'
  | 'retained'
  | 'not-measured'
  | 'not-applicable'

export interface VariantComparison {
  variant: BenchmarkVariant
  outcome: ComparisonOutcome
  measured: boolean
  detail: string
}

export interface ScenarioReport {
  scenario: ScenarioId
  title: string
  measuredAt: string
  cycles: number
  renderer: string
  browser: string
  series: Partial<Record<BenchmarkVariant, MemorySample[]>>
  assertions: ProofAssertion[]
  comparisons: readonly VariantComparison[]
  notes: readonly string[]
  benchmark?: BenchmarkReport
}

export interface ScenarioExecution {
  run: number
  report: ScenarioReport
}

export interface ScenarioSummary {
  executions: number
  assertions: number
  passedAssertions: number
  failedAssertions: number
  passRate: number
}

export interface ResearchSuite {
  schemaVersion: 2
  artifactKind: 'browser-suite'
  measuredAt: string
  runs: number
  cyclesPerRun: number
  warmupCycles: number
  renderer: string
  browser: string
  protocol: {
    scenarioOrder: readonly ScenarioId[]
    executionOrder: 'fixed'
    nativeUniqueImplementation: 'r3f-create-root'
  }
  packageVersions: {
    three: string
    react: string
    r3f: string
    disposeGuard: string
  }
  benchmarks: BenchmarkReport[]
  summary: Record<BenchmarkVariant, {
    finalTotals: number[]
    minimum: number
    maximum: number
    mean: number
    variance: number
  }>
  scenarioRuns: ScenarioExecution[]
  scenarioSummary: Record<ScenarioId, ScenarioSummary>
  proofs: ScenarioReport[]
}

interface SharedFixture {
  scene: Scene
  camera: PerspectiveCamera
  texture: DataTexture
  geometry: BoxGeometry
  material: MeshBasicMaterial
  left: Mesh
  right: Mesh
}

function createRenderer(size = 96): WebGLRenderer {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' })
  renderer.setSize(size, size, false)
  return renderer
}

function rendererName(renderer: WebGLRenderer): string {
  const gl = renderer.getContext()
  const extension = gl.getExtension('WEBGL_debug_renderer_info')
  return extension
    ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL))
    : 'WebGL renderer hidden by browser'
}

function createSharedFixture(seed = 91): SharedFixture {
  const texture = new DataTexture(
    new Uint8Array([seed, 255 - seed, 83, 255]),
    1,
    1,
    RGBAFormat,
  )
  texture.needsUpdate = true
  const geometry = new BoxGeometry(0.8, 0.8, 0.8)
  const material = new MeshBasicMaterial({ map: texture })
  const left = new Mesh(geometry, material)
  const right = new Mesh(geometry, material)
  left.position.x = -0.6
  right.position.x = 0.6
  const scene = new Scene()
  scene.add(new AmbientLight(0xffffff, 2), left, right)
  const camera = new PerspectiveCamera(45, 1, 0.1, 10)
  camera.position.z = 4
  return { scene, camera, texture, geometry, material, left, right }
}

function webGLTexture(renderer: WebGLRenderer, texture: DataTexture): WebGLTexture | undefined {
  return (renderer.properties.get(texture) as { __webglTexture?: WebGLTexture }).__webglTexture
}

function closeRenderer(renderer: WebGLRenderer): void {
  renderer.dispose()
  renderer.forceContextLoss()
}

function proofReport(
  scenario: ScenarioId,
  cycles: number,
  renderer: string,
  assertions: ProofAssertion[],
  notes: readonly string[],
  comparisons: readonly VariantComparison[] = [],
): ScenarioReport {
  return {
    scenario,
    title: scenarios.find((item) => item.id === scenario)?.title ?? scenario,
    measuredAt: new Date().toISOString(),
    cycles,
    renderer,
    browser: navigator.userAgent,
    series: {},
    assertions,
    notes,
    comparisons,
  }
}

export function runCacheReuseProof(): ScenarioReport {
  const renderer = createRenderer()
  const hardware = rendererName(renderer)
  const fixture = createSharedFixture(113)
  const registry = createResourceRegistry({ mode: 'dispose' })
  const cache = registry.protect([fixture.left, fixture.right], { label: 'loader cache' })
  const first = registry.acquire(fixture.left, { ownership: 'borrowed', label: 'cache user A' })
  const second = registry.acquire(fixture.right, { ownership: 'borrowed', label: 'cache user B' })

  renderer.render(fixture.scene, fixture.camera)
  const original = webGLTexture(renderer, fixture.texture)

  fixture.scene.remove(fixture.left)
  first.release()
  renderer.render(fixture.scene, fixture.camera)
  const afterFirst = webGLTexture(renderer, fixture.texture)

  fixture.scene.remove(fixture.right)
  second.release()
  renderer.render(fixture.scene, fixture.camera)
  const afterZeroUsers = webGLTexture(renderer, fixture.texture)

  const remount = registry.acquire(fixture.right, {
    ownership: 'borrowed',
    label: 'cache remount',
  })
  fixture.scene.add(fixture.right)
  renderer.render(fixture.scene, fixture.camera)
  const afterRemount = webGLTexture(renderer, fixture.texture)
  fixture.scene.remove(fixture.right)
  remount.release()

  cache.release()
  renderer.render(fixture.scene, fixture.camera)
  const afterEviction = webGLTexture(renderer, fixture.texture)
  const disposed = registry.snapshot().events.filter((event) => event.type === 'disposed').length

  const report = proofReport('cache', 3, hardware, [
    {
      label: 'First user released safely',
      passed: Boolean(original && afterFirst === original),
      detail: 'The second user retained the original WebGL texture.',
    },
    {
      label: 'Cache outlived all users',
      passed: Boolean(original && afterZeroUsers === original),
      detail: 'Zero mounted users did not imply cache eviction.',
    },
    {
      label: 'Remount reused the allocation',
      passed: Boolean(original && afterRemount === original),
      detail: 'The cached result returned with the same WebGL handle.',
    },
    {
      label: 'Final eviction disposed once',
      passed: afterEviction === undefined && disposed === 3,
      detail: `${disposed} geometry, material and texture disposal events were recorded.`,
    },
  ], [
    'The cache is an explicit owner, not an invisible exception.',
    'Direct useLoader.clear calls are intentionally excluded from the guarded contract.',
  ])

  closeRenderer(renderer)
  return report
}

export function runCanvasRemountProof(remounts = 3): ScenarioReport {
  const bounded = Math.min(100, Math.max(1, Math.round(remounts)))
  let disposedResources = 0
  let lostContexts = 0
  let hardware = 'not measured'

  for (let cycle = 0; cycle < bounded; cycle += 1) {
    const renderer = createRenderer(72)
    hardware = rendererName(renderer)
    const fixture = createSharedFixture(130 + cycle)
    const registry = createResourceRegistry({ mode: 'dispose' })
    const lease = registry.acquire([fixture.left, fixture.right], {
      ownership: 'owned',
      label: `Canvas ${cycle + 1}`,
    })
    renderer.render(fixture.scene, fixture.camera)
    fixture.scene.remove(fixture.left, fixture.right)
    lease.release()
    disposedResources += registry.snapshot().events.filter(
      (event) => event.type === 'disposed',
    ).length

    const gl = renderer.getContext()
    closeRenderer(renderer)
    if (gl.isContextLost()) lostContexts += 1
  }

  return proofReport('canvas', bounded, hardware, [
    {
      label: 'Scene resources released',
      passed: disposedResources === bounded * 3,
      detail: `${disposedResources} owned resources were disposed across ${bounded} remounts.`,
    },
    {
      label: 'Renderer contexts closed',
      passed: lostContexts === bounded,
      detail: `${lostContexts} of ${bounded} WebGL contexts reported a forced loss.`,
    },
  ], [
    'Dispose Guard owns scene resources only.',
    'The Canvas host must still dispose its renderer and release the WebGL context.',
  ])
}

export function runSharedChurnProof(cycles = 50): ScenarioReport {
  const bounded = Math.min(100, Math.max(2, Math.round(cycles)))
  const renderer = createRenderer()
  const hardware = rendererName(renderer)
  const fixture = createSharedFixture(177)
  const registry = createResourceRegistry({ mode: 'dispose' })
  const protection = registry.protect([fixture.left, fixture.right], { label: 'shared pool' })
  let current = registry.acquire(fixture.left, { ownership: 'borrowed', label: 'consumer 0' })

  renderer.render(fixture.scene, fixture.camera)
  const original = webGLTexture(renderer, fixture.texture)

  for (let cycle = 1; cycle <= bounded; cycle += 1) {
    const nextRoot = cycle % 2 === 0 ? fixture.left : fixture.right
    const next = registry.acquire(nextRoot, {
      ownership: 'borrowed',
      label: `consumer ${cycle}`,
    })
    current.release()
    current = next
    renderer.render(fixture.scene, fixture.camera)
  }

  current.release()
  const beforeEviction = webGLTexture(renderer, fixture.texture)
  protection.release()
  fixture.scene.remove(fixture.left, fixture.right)
  renderer.render(fixture.scene, fixture.camera)
  const afterEviction = webGLTexture(renderer, fixture.texture)
  const disposed = registry.snapshot().events.filter((event) => event.type === 'disposed').length

  const report = proofReport('churn', bounded, hardware, [
    {
      label: 'Handle survived every hand-off',
      passed: Boolean(original && beforeEviction === original),
      detail: `One texture survived ${bounded} overlapping consumer transitions.`,
    },
    {
      label: 'Final disposal stayed singular',
      passed: afterEviction === undefined && disposed === 3,
      detail: `${disposed} final disposal events were recorded.`,
    },
  ], [
    'The test acquires the next consumer before releasing the previous one.',
    'A fixed cache protection makes the intended lifetime explicit.',
  ])

  closeRenderer(renderer)
  return report
}

let inFlightSequence = 0

class DeferredProofLoader extends Loader<Scene, string> {
  static active: DeferredProofLoader | undefined
  resolve: (() => void) | undefined

  load(_url: string, onLoad: (root: Scene) => void): void {
    DeferredProofLoader.active = this
    const root = createSharedFixture(204).left.parent as Scene
    this.resolve = () => onLoad(root)
  }
}

export async function runInFlightProof(): Promise<ScenarioReport> {
  const { createR3FResourceCache } = await import('three-dispose-guard/r3f')
  const registry = createResourceRegistry({ mode: 'dispose' })
  const cache = createR3FResourceCache({ registry })
  const url = `lab://in-flight-${++inFlightSequence}`

  cache.preload(DeferredProofLoader, url)
  const loader = DeferredProofLoader.active
  const wasLoading = cache.snapshot().loading === 1 && Boolean(loader?.resolve)
  cache.evict(DeferredProofLoader, url)
  loader?.resolve?.()
  await Promise.resolve()
  await Promise.resolve()
  registry.flush()

  const disposed = registry.snapshot().events.filter((event) => event.type === 'disposed').length
  return proofReport('in-flight', 1, 'R3F loader cache, no renderer required', [
    {
      label: 'Pending request observed',
      passed: wasLoading,
      detail: 'The guard registered the request before the loader callback resolved.',
    },
    {
      label: 'Late result did not re-enter cache',
      passed: cache.snapshot().entries.length === 0,
      detail: 'Eviction marked the pending generation as stale.',
    },
    {
      label: 'Late resources were cleaned',
      passed: disposed === 3 && registry.snapshot().trackedResources === 0,
      detail: `${disposed} stale resource disposals were recorded.`,
    },
  ], [
    'The underlying request is not cancelled because Three.js loaders do not share one cancellation API.',
    'The stale result is adopted long enough to run deterministic cleanup.',
  ])
}

const variants: readonly BenchmarkVariant[] = ['unmanaged', 'naive', 'native', 'guarded']

function aggregateScenarioReports(
  scenario: ScenarioId,
  cycles: number,
  reports: ScenarioReport[],
): ScenarioReport {
  const definition = scenarios.find((item) => item.id === scenario)
  const labels = [...new Set(reports.flatMap((report) =>
    report.assertions.map((assertion) => assertion.label),
  ))]
  const assertions = labels.map((label): ProofAssertion => {
    const observations = reports.flatMap((report) =>
      report.assertions.filter((assertion) => assertion.label === label),
    )
    const passed = observations.filter((assertion) => assertion.passed).length
    return {
      label,
      passed: passed === observations.length,
      detail: `${passed}/${observations.length} repetitions passed. ${observations.at(-1)?.detail ?? ''}`.trim(),
    }
  })
  const comparisons = variants.flatMap((variant): VariantComparison[] => {
    const observations = reports.flatMap((report) =>
      report.comparisons.filter((comparison) => comparison.variant === variant),
    )
    if (observations.length === 0) return []
    const outcomes = [...new Set(observations.map((comparison) => comparison.outcome))]
    return [{
      variant,
      outcome: outcomes.length === 1 ? outcomes[0] : 'not-measured',
      measured: observations.every((comparison) => comparison.measured),
      detail: `${observations.length} repetitions: ${outcomes.join(', ')}. ${observations.at(-1)?.detail ?? ''}`.trim(),
    }]
  })

  return {
    scenario,
    title: definition?.title ?? scenario,
    measuredAt: new Date().toISOString(),
    cycles,
    renderer: reports[0]?.renderer ?? 'not measured',
    browser: navigator.userAgent,
    series: {},
    assertions,
    comparisons,
    notes: [...new Set(reports.flatMap((report) => report.notes))],
  }
}
export async function runScenario(
  scenario: ScenarioId,
  cycles = 50,
  onSample?: (variant: BenchmarkVariant, sample: MemorySample) => void,
): Promise<ScenarioReport> {
  const bounded = Math.min(100, Math.max(1, Math.round(cycles)))

  if (scenario === 'unique') {
    const benchmark = await runBenchmark(bounded, {
      onUnmanagedSample: (sample) => onSample?.('unmanaged', sample),
      onNaiveSample: (sample) => onSample?.('naive', sample),
      onNativeSample: (sample) => onSample?.('native', sample),
      onGuardedSample: (sample) => onSample?.('guarded', sample),
    })
    const total = (variant: BenchmarkVariant) => {
      const final = benchmark[variant].final
      return final.geometries + final.textures
    }

    return {
      scenario,
      title: 'Unique resources',
      measuredAt: benchmark.measuredAt,
      cycles: bounded,
      renderer: benchmark.renderer,
      browser: benchmark.browser,
      series: Object.fromEntries(
        variants.map((variant) => [variant, benchmark[variant].samples]),
      ),
      assertions: [
        {
          label: 'Unmanaged resources grew',
          passed: total('unmanaged') > total('guarded'),
          detail: `${total('unmanaged')} retained resources versus ${total('guarded')} guarded.`,
        },
        {
          label: 'Explicit strategies stayed flat',
          passed: ['naive', 'native', 'guarded'].every(
            (variant) => total(variant as BenchmarkVariant) <= 2,
          ),
          detail: 'Unique assets do not require reference counting when ownership is already clear.',
        },
      ],
      comparisons: [
        {
          variant: 'unmanaged',
          outcome: 'retained',
          measured: true,
          detail: 'Resources remained registered after each unmount because no disposal ran.',
        },
        {
          variant: 'naive',
          outcome: 'safe',
          measured: true,
          detail: 'Eager cleanup is valid while every resource has exactly one owner.',
        },
        {
          variant: 'native',
          outcome: 'safe',
          measured: true,
          detail: 'Actual R3F createRoot reconciliation disposed declarative geometry, material and texture elements.',
        },
        {
          variant: 'guarded',
          outcome: 'safe',
          measured: true,
          detail: 'The final owned lease release disposed the unique resource graph.',
        },
      ],
      notes: [
        'The native line uses actual R3F createRoot reconciliation; the test flag changes cleanup scheduling only.',
        'The unmanaged line intentionally omits disposal to reproduce the failure before comparing fixes.',
      ],
      benchmark,
    }
  }

  if (scenario === 'shared') {
    const reports: ScenarioReport[] = []
    for (let cycle = 0; cycle < bounded; cycle += 1) {
      const proof = runSharedAssetProof()
      reports.push(proofReport('shared', 1, 'Live WebGL texture handles', [
        {
          label: 'Texture reached WebGL',
          passed: proof.actualWebGLTextureCreated,
          detail: 'The assertion checks a native WebGLTexture, not only a JavaScript object.',
        },
        {
          label: 'Unmanaged final unmount retained the handle',
          passed: proof.unmanagedRetainedAfterFinalUnmount,
          detail: 'The unmanaged counterfactual left the WebGL allocation registered.',
        },
        {
          label: 'Eager first release invalidated sharing',
          passed: proof.eagerInvalidatedSharedHandle,
          detail: 'The eager counterfactual removed the shared handle while another user remained.',
        },
        {
          label: 'Guarded first release preserved sharing',
          passed: proof.survivedFirstRelease && proof.disposeEventsAfterFirstRelease === 0,
          detail: `${proof.disposeEventsAfterFirstRelease} disposal events occurred after user one.`,
        },
        {
          label: 'Guarded final release cleaned the resource',
          passed: proof.disposedAfterLastRelease && proof.disposeEventsAfterLastRelease === 3,
          detail: `${proof.disposeEventsAfterLastRelease} final disposal events occurred.`,
        },
      ], [
        'The unmanaged, eager and guarded paths use real WebGL texture handles.',
        'A native R3F row is not applicable to arbitrary shared primitives because R3F cannot infer their external owner.',
      ], [
        {
          variant: 'unmanaged',
          outcome: 'retained',
          measured: true,
          detail: 'The texture handle survived after both scene users were removed.',
        },
        {
          variant: 'naive',
          outcome: 'unsafe',
          measured: true,
          detail: 'The first user disposed the allocation still referenced by the second user.',
        },
        {
          variant: 'native',
          outcome: 'not-applicable',
          measured: false,
          detail: 'External shared primitives do not have one unambiguous declarative R3F owner.',
        },
        {
          variant: 'guarded',
          outcome: 'safe',
          measured: true,
          detail: 'The first release preserved the handle and the final release disposed it once.',
        },
      ]))
    }
    return aggregateScenarioReports('shared', bounded, reports)
  }

  if (scenario === 'cache') {
    const reports = Array.from({ length: bounded }, () => {
      const report = runCacheReuseProof()
      return {
        ...report,
        comparisons: [
          {
            variant: 'unmanaged',
            outcome: 'retained',
            measured: false,
            detail: 'Not remeasured here; an unmanaged cache has no deterministic eviction cleanup.',
          },
          {
            variant: 'naive',
            outcome: 'unsafe',
            measured: false,
            detail: 'Not remeasured here; releasing at zero consumers conflicts with the retained cache owner.',
          },
          {
            variant: 'native',
            outcome: 'not-measured',
            measured: false,
            detail: 'Native useLoader cache persistence is documented separately; this proof isolates guard ownership.',
          },
          {
            variant: 'guarded',
            outcome: 'safe',
            measured: true,
            detail: 'The cache survived zero users, reused its handle and disposed on final eviction.',
          },
        ] satisfies VariantComparison[],
      }
    })
    return aggregateScenarioReports('cache', bounded, reports)
  }

  if (scenario === 'canvas') {
    const report = runCanvasRemountProof(bounded)
    return {
      ...report,
      comparisons: [
        {
          variant: 'unmanaged',
          outcome: 'not-measured',
          measured: false,
          detail: 'No unmanaged counterfactual was run; this proof isolates owned scene cleanup from renderer teardown.',
        },
        {
          variant: 'naive',
          outcome: 'not-measured',
          measured: false,
          detail: 'No eager-disposal counterfactual was run because this scenario does not share resources between owners.',
        },
        {
          variant: 'native',
          outcome: 'not-measured',
          measured: false,
          detail: 'This proof separates scene ownership from renderer teardown rather than ranking Canvas implementations.',
        },
        {
          variant: 'guarded',
          outcome: 'safe',
          measured: true,
          detail: 'Owned scene resources and renderer contexts completed their separate lifecycles.',
        },
      ],
    }
  }

  if (scenario === 'churn') {
    const report = runSharedChurnProof(bounded)
    return {
      ...report,
      comparisons: [
        {
          variant: 'unmanaged',
          outcome: 'not-measured',
          measured: false,
          detail: 'Unmanaged retention was demonstrated in the shared-resource scenario and was not remeasured during churn.',
        },
        {
          variant: 'naive',
          outcome: 'unsafe',
          measured: false,
          detail: 'A release without the overlapping next owner would invalidate the shared allocation.',
        },
        {
          variant: 'native',
          outcome: 'not-applicable',
          measured: false,
          detail: 'R3F cannot infer the external lifetime of one primitive shared across an application-managed pool.',
        },
        {
          variant: 'guarded',
          outcome: 'safe',
          measured: true,
          detail: 'The handle survived every hand-off and final disposal remained singular.',
        },
      ],
    }
  }

  const reports: ScenarioReport[] = []
  for (let cycle = 0; cycle < bounded; cycle += 1) {
    const report = await runInFlightProof()
    reports.push({
      ...report,
      comparisons: [
        {
          variant: 'unmanaged',
          outcome: 'not-measured',
          measured: false,
          detail: 'An unmanaged late-result counterfactual was not run, so retention is not claimed by this report.',
        },
        {
          variant: 'naive',
          outcome: 'not-measured',
          measured: false,
          detail: 'An eager callback-cleanup counterfactual was not run because loaders do not expose one portable cancellation lifecycle.',
        },
        {
          variant: 'native',
          outcome: 'not-measured',
          measured: false,
          detail: 'The native cache does not expose a portable owned-resource cleanup contract for late results.',
        },
        {
          variant: 'guarded',
          outcome: 'safe',
          measured: true,
          detail: 'The stale generation stayed evicted and its disposable resource graph was cleaned.',
        },
      ],
    })
  }
  return aggregateScenarioReports('in-flight', bounded, reports)
}

function finalTotal(report: BenchmarkReport, variant: BenchmarkVariant): number {
  const final = report[variant].final
  return final.geometries + final.textures
}

function summarise(benchmarks: BenchmarkReport[]): ResearchSuite['summary'] {
  return Object.fromEntries(variants.map((variant) => {
    const finalTotals = benchmarks.map((report) => finalTotal(report, variant))
    const mean = finalTotals.reduce((sum, value) => sum + value, 0) / finalTotals.length
    const variance = finalTotals.reduce(
      (sum, value) => sum + (value - mean) ** 2,
      0,
    ) / finalTotals.length
    return [variant, {
      finalTotals,
      minimum: Math.min(...finalTotals),
      maximum: Math.max(...finalTotals),
      mean,
      variance,
    }]
  })) as ResearchSuite['summary']
}

function summariseScenarioExecutions(
  executions: ScenarioExecution[],
): Record<ScenarioId, ScenarioSummary> {
  return Object.fromEntries(scenarios.map(({ id }) => {
    const reports = executions
      .filter((execution) => execution.report.scenario === id)
      .map((execution) => execution.report)
    const assertions = reports.flatMap((report) => report.assertions)
    const passedAssertions = assertions.filter((assertion) => assertion.passed).length
    return [id, {
      executions: reports.length,
      assertions: assertions.length,
      passedAssertions,
      failedAssertions: assertions.length - passedAssertions,
      passRate: assertions.length === 0 ? 0 : passedAssertions / assertions.length,
    }]
  })) as Record<ScenarioId, ScenarioSummary>
}
export async function runResearchSuite(
  runs = 5,
  cyclesPerRun = 50,
): Promise<ResearchSuite> {
  const boundedRuns = Math.min(10, Math.max(1, Math.round(runs)))
  const boundedCycles = Math.min(100, Math.max(1, Math.round(cyclesPerRun)))
  const warmupCycles = 4

  const scenarioOrder = scenarios.map(({ id }) => id)
  for (const scenario of scenarioOrder) {
    await runScenario(scenario, warmupCycles)
  }

  const benchmarks: BenchmarkReport[] = []
  const scenarioRuns: ScenarioExecution[] = []
  for (let run = 1; run <= boundedRuns; run += 1) {
    for (const scenario of scenarioOrder) {
      const report = await runScenario(scenario, boundedCycles)
      scenarioRuns.push({ run, report })
      if (scenario === 'unique' && report.benchmark) benchmarks.push(report.benchmark)
    }
  }

  const finalRun = scenarioRuns
    .filter((execution) => execution.run === boundedRuns)
    .map((execution) => execution.report)
  const proofs = finalRun.filter((report) => report.scenario !== 'unique')

  return {
    schemaVersion: 2,
    artifactKind: 'browser-suite',
    measuredAt: new Date().toISOString(),
    runs: boundedRuns,
    cyclesPerRun: boundedCycles,
    warmupCycles,
    renderer: benchmarks[0]?.renderer ?? 'not measured',
    browser: navigator.userAgent,
    protocol: {
      scenarioOrder,
      executionOrder: 'fixed',
      nativeUniqueImplementation: 'r3f-create-root',
    },
    packageVersions: {
      ...__THREE_DISPOSE_GUARD_PACKAGE_VERSIONS__,
    },
    benchmarks,
    summary: summarise(benchmarks),
    scenarioRuns,
    scenarioSummary: summariseScenarioExecutions(scenarioRuns),
    proofs,
  }
}

export function researchSuiteToCsv(suite: ResearchSuite): string {
  const header = [
    'record_type',
    'run',
    'scenario',
    'variant',
    'cycle',
    'geometries',
    'textures',
    'programs',
    'assertion',
    'passed',
    'outcome',
    'measured',
    'detail',
    'minimum',
    'maximum',
    'mean',
    'variance',
    'executions',
    'failed_assertions',
    'pass_rate',
    'measured_at',
    'renderer',
    'browser',
  ]
  const rows: Array<Array<string | number | boolean | undefined>> = []
  const captureWideHeader = [
    'artifact_kind',
    'captured_at',
    'runs',
    'cycles_per_run',
    'warmup_cycles',
    'protocol_scenario_order',
    'protocol_execution_order',
    'protocol_native_implementation',
    'package_three',
    'package_react',
    'package_r3f',
    'package_dispose_guard',
  ]
  const captureWideValues = [
    suite.artifactKind,
    suite.measuredAt,
    suite.runs,
    suite.cyclesPerRun,
    suite.warmupCycles,
    suite.protocol.scenarioOrder.join('|'),
    suite.protocol.executionOrder,
    suite.protocol.nativeUniqueImplementation,
    suite.packageVersions.three,
    suite.packageVersions.react,
    suite.packageVersions.r3f,
    suite.packageVersions.disposeGuard,
  ]

  suite.benchmarks.forEach((report, run) => {
    for (const variant of variants) {
      for (const sample of report[variant].samples) {
        rows.push([
          'sample',
          run + 1,
          'unique',
          variant,
          sample.cycle,
          sample.geometries,
          sample.textures,
          sample.programs,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          report.measuredAt,
          report.renderer,
          report.browser,
        ])
      }
    }
  })

  for (const variant of variants) {
    const summary = suite.summary[variant]
    rows.push([
      'variant_summary',
      undefined,
      'unique',
      variant,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      `final totals: ${summary.finalTotals.join('|')}`,
      summary.minimum,
      summary.maximum,
      summary.mean,
      summary.variance,
    ])
  }

  for (const execution of suite.scenarioRuns) {
    for (const assertion of execution.report.assertions) {
      rows.push([
        'assertion',
        execution.run,
        execution.report.scenario,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        assertion.label,
        assertion.passed,
        undefined,
        true,
        assertion.detail,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        execution.report.measuredAt,
        execution.report.renderer,
        execution.report.browser,
      ])
    }
    for (const comparison of execution.report.comparisons) {
      rows.push([
        'comparison',
        execution.run,
        execution.report.scenario,
        comparison.variant,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        comparison.outcome,
        comparison.measured,
        comparison.detail,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        execution.report.measuredAt,
        execution.report.renderer,
        execution.report.browser,
      ])
    }
  }

  for (const scenario of scenarios.map(({ id }) => id)) {
    const summary = suite.scenarioSummary[scenario]
    rows.push([
      'scenario_summary',
      undefined,
      scenario,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      summary.executions,
      summary.failedAssertions,
      summary.passRate,
    ])
  }

  return [
    [...header, ...captureWideHeader],
    ...rows.map((row) => [
      ...row,
      ...Array(Math.max(0, header.length - row.length)).fill(undefined),
      ...captureWideValues,
    ]),
  ]
    .map((row) => row.map((value) => JSON.stringify(String(value ?? ''))).join(','))
    .join('\n')
}

export function downloadResearchSuite(
  suite: ResearchSuite,
  format: 'json' | 'csv',
): void {
  const content = format === 'json'
    ? JSON.stringify(suite, null, 2)
    : researchSuiteToCsv(suite)
  const blob = new Blob([content], {
    type: format === 'json' ? 'application/json' : 'text/csv',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const timestamp = suite.measuredAt.replace(/[:.]/g, '-')
  link.download = `three-dispose-guard-browser-suite-${timestamp}.${format}`
  link.click()
  URL.revokeObjectURL(url)
}
