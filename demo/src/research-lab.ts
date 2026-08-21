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

export interface ScenarioReport {
  scenario: ScenarioId
  title: string
  measuredAt: string
  cycles: number
  renderer: string
  browser: string
  series: Partial<Record<BenchmarkVariant, MemorySample[]>>
  assertions: ProofAssertion[]
  notes: readonly string[]
  benchmark?: BenchmarkReport
}

export interface ResearchSuite {
  schemaVersion: 1
  measuredAt: string
  runs: number
  cyclesPerRun: number
  warmupCycles: number
  renderer: string
  browser: string
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
  const bounded = Math.min(10, Math.max(1, Math.round(remounts)))
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
  const url = `lab://in-flight-${Date.now()}`

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
      notes: [
        'The native line models declarative disposal on unmount and is expected to succeed here.',
        'The unmanaged line intentionally omits disposal to reproduce the failure before comparing fixes.',
      ],
      benchmark,
    }
  }

  if (scenario === 'shared') {
    const proof = runSharedAssetProof()
    return proofReport('shared', 2, 'Live WebGL texture handle', [
      {
        label: 'Texture reached WebGL',
        passed: proof.actualWebGLTextureCreated,
        detail: 'The assertion checks a native WebGLTexture, not only a JavaScript object.',
      },
      {
        label: 'First release preserved sharing',
        passed: proof.survivedFirstRelease && proof.disposeEventsAfterFirstRelease === 0,
        detail: `${proof.disposeEventsAfterFirstRelease} disposal events occurred after user one.`,
      },
      {
        label: 'Final release cleaned the resource',
        passed: proof.disposedAfterLastRelease && proof.disposeEventsAfterLastRelease === 3,
        detail: `${proof.disposeEventsAfterLastRelease} final disposal events occurred.`,
      },
    ], [
      'Blind eager disposal would invalidate the resource still used by the second mesh.',
      'Reference counting matters here because both users are genuine owners.',
    ])
  }

  if (scenario === 'cache') return runCacheReuseProof()
  if (scenario === 'canvas') return runCanvasRemountProof(3)
  if (scenario === 'churn') return runSharedChurnProof(bounded)
  return runInFlightProof()
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

export async function runResearchSuite(
  runs = 5,
  cyclesPerRun = 50,
): Promise<ResearchSuite> {
  const boundedRuns = Math.min(10, Math.max(1, Math.round(runs)))
  const boundedCycles = Math.min(100, Math.max(1, Math.round(cyclesPerRun)))
  const warmupCycles = 4

  await runBenchmark(warmupCycles)
  const benchmarks: BenchmarkReport[] = []
  for (let run = 0; run < boundedRuns; run += 1) {
    benchmarks.push(await runBenchmark(boundedCycles))
  }

  const proofs = [
    await runScenario('shared', 2),
    await runScenario('cache', 3),
    await runScenario('canvas', 3),
    await runScenario('churn', boundedCycles),
    await runScenario('in-flight', 1),
  ]

  return {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    runs: boundedRuns,
    cyclesPerRun: boundedCycles,
    warmupCycles,
    renderer: benchmarks[0]?.renderer ?? 'not measured',
    browser: navigator.userAgent,
    packageVersions: {
      three: '0.185.x',
      react: '19.x',
      r3f: '9.7.x',
      disposeGuard: '0.1.0',
    },
    benchmarks,
    summary: summarise(benchmarks),
    proofs,
  }
}

export function researchSuiteToCsv(suite: ResearchSuite): string {
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
  ]
  const rows = suite.benchmarks.flatMap((report, run) =>
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
      ]),
    ),
  )
  return [header, ...rows]
    .map((row) => row.map((value) => JSON.stringify(String(value))).join(','))
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
  link.download = `three-dispose-guard-${suite.measuredAt.slice(0, 10)}.${format}`
  link.click()
  URL.revokeObjectURL(url)
}
