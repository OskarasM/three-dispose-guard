import {
  AmbientLight,
  BoxGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  SphereGeometry,
  TorusKnotGeometry,
  WebGLRenderer,
} from 'three'
import {
  collectDisposableResources,
  createResourceRegistry,
} from 'three-dispose-guard'

export interface MemorySample {
  cycle: number
  geometries: number
  textures: number
  programs: number
}

export interface VariantReport {
  samples: MemorySample[]
  final: MemorySample
  peak: MemorySample
}

export interface BenchmarkReport {
  cycles: number
  unmanaged: VariantReport
  naive: VariantReport
  native: VariantReport
  guarded: VariantReport
  renderer: string
  browser: string
  measuredAt: string
}

export interface SharedAssetProof {
  actualWebGLTextureCreated: boolean
  survivedFirstRelease: boolean
  disposedAfterLastRelease: boolean
  disposeEventsAfterFirstRelease: number
  disposeEventsAfterLastRelease: number
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

function seededByte(seed: number, offset: number): number {
  const x = Math.sin(seed * 12.9898 + offset * 78.233) * 43_758.5453
  return Math.floor((x - Math.floor(x)) * 255)
}

function createTexture(seed: number): DataTexture {
  const size = 16
  const data = new Uint8Array(size * size * 4)
  for (let index = 0; index < size * size; index += 1) {
    data[index * 4] = seededByte(seed, index)
    data[index * 4 + 1] = seededByte(seed + 11, index)
    data[index * 4 + 2] = seededByte(seed + 29, index)
    data[index * 4 + 3] = 255
  }
  const texture = new DataTexture(data, size, size, RGBAFormat)
  texture.needsUpdate = true
  return texture
}

function createCycleGroup(cycle: number): Group {
  const group = new Group()
  const positions = [-1.8, -0.6, 0.6, 1.8]

  for (let index = 0; index < positions.length; index += 1) {
    const geometry = index % 2 === 0
      ? new BoxGeometry(0.62, 0.62, 0.62, 6, 6, 6)
      : new SphereGeometry(0.42, 18, 12)
    const map = createTexture(cycle * 10 + index)
    const material = new MeshStandardMaterial({
      map,
      roughness: 0.34,
      metalness: 0.18,
      color: new Color().setHSL(((cycle + index) % 20) / 20, 0.72, 0.58),
    })
    const mesh = new Mesh(geometry, material)
    mesh.position.set(positions[index], index % 2 === 0 ? 0.24 : -0.24, 0)
    mesh.rotation.set(cycle * 0.04, index * 0.45, 0)
    group.add(mesh)
  }

  return group
}

function readSample(renderer: WebGLRenderer, cycle: number): MemorySample {
  return {
    cycle,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0,
  }
}

function peakSample(samples: MemorySample[]): MemorySample {
  return samples.reduce(
    (peak, sample) => ({
      cycle: sample.cycle,
      geometries: Math.max(peak.geometries, sample.geometries),
      textures: Math.max(peak.textures, sample.textures),
      programs: Math.max(peak.programs, sample.programs),
    }),
    { cycle: 0, geometries: 0, textures: 0, programs: 0 },
  )
}

function rendererName(renderer: WebGLRenderer): string {
  const gl = renderer.getContext()
  const extension = gl.getExtension('WEBGL_debug_renderer_info')
  if (!extension) return 'WebGL 2 renderer hidden by browser'
  return gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) as string
}

export type BenchmarkVariant = 'unmanaged' | 'naive' | 'native' | 'guarded'

async function runVariant(
  cycles: number,
  variant: BenchmarkVariant,
  onSample?: (sample: MemorySample) => void,
): Promise<{ report: VariantReport; renderer: string }> {
  const canvas = document.createElement('canvas')
  canvas.width = 192
  canvas.height = 128
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' })
  renderer.setSize(192, 128, false)

  const scene = new Scene()
  scene.add(new AmbientLight(0xffffff, 1.2))
  const light = new DirectionalLight(0xffffff, 2.4)
  light.position.set(2, 4, 5)
  scene.add(light)
  const camera = new PerspectiveCamera(45, 1.5, 0.1, 30)
  camera.position.set(0, 0, 6)
  const registry = createResourceRegistry({ mode: 'dispose' })
  const samples: MemorySample[] = []
  const hardware = rendererName(renderer)

  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    const group = createCycleGroup(cycle)
    const lease = variant === 'guarded'
      ? registry.acquire(group, { ownership: 'owned', label: `cycle ${cycle}` })
      : null

    scene.add(group)
    renderer.render(scene, camera)
    scene.remove(group)
    if (lease) {
      lease.release()
    } else if (variant === 'naive' || variant === 'native') {
      for (const resource of collectDisposableResources(group)) resource.dispose()
    }
    renderer.render(scene, camera)

    const sample = readSample(renderer, cycle)
    samples.push(sample)
    onSample?.(sample)
    if (cycle % 4 === 0) await nextFrame()
  }

  const final = samples.at(-1) ?? readSample(renderer, 0)
  const report = { samples, final, peak: peakSample(samples) }
  renderer.dispose()
  renderer.forceContextLoss()
  return { report, renderer: hardware }
}

export async function runBenchmark(
  cycles = 50,
  callbacks?: {
    onUnmanagedSample?: (sample: MemorySample) => void
    onNaiveSample?: (sample: MemorySample) => void
    onNativeSample?: (sample: MemorySample) => void
    onGuardedSample?: (sample: MemorySample) => void
  },
): Promise<BenchmarkReport> {
  const boundedCycles = Math.min(100, Math.max(1, Math.round(cycles)))
  const unmanaged = await runVariant(boundedCycles, 'unmanaged', callbacks?.onUnmanagedSample)
  const naive = await runVariant(boundedCycles, 'naive', callbacks?.onNaiveSample)
  const native = await runVariant(boundedCycles, 'native', callbacks?.onNativeSample)
  const guarded = await runVariant(boundedCycles, 'guarded', callbacks?.onGuardedSample)

  return {
    cycles: boundedCycles,
    unmanaged: unmanaged.report,
    naive: naive.report,
    native: native.report,
    guarded: guarded.report,
    renderer: guarded.renderer,
    browser: navigator.userAgent,
    measuredAt: new Date().toISOString(),
  }
}

export function runSharedAssetProof(): SharedAssetProof {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const renderer = new WebGLRenderer({ canvas, antialias: false })
  const scene = new Scene()
  const camera = new PerspectiveCamera(45, 1, 0.1, 10)
  camera.position.z = 4

  const texture = createTexture(404)
  const geometry = new BoxGeometry(0.8, 0.8, 0.8)
  const material = new MeshStandardMaterial({ map: texture })
  const left = new Mesh(geometry, material)
  const right = new Mesh(geometry, material)
  left.position.x = -0.6
  right.position.x = 0.6
  scene.add(new AmbientLight(0xffffff, 2), left, right)

  const registry = createResourceRegistry({ mode: 'dispose' })
  const leftLease = registry.acquire(left, { ownership: 'owned', label: 'left mesh' })
  const rightLease = registry.acquire(right, { ownership: 'owned', label: 'right mesh' })
  renderer.render(scene, camera)

  const webGLTexture = (renderer.properties.get(texture) as { __webglTexture?: WebGLTexture }).__webglTexture
  scene.remove(left)
  leftLease.release()
  renderer.render(scene, camera)
  const handleAfterFirstRelease = (
    renderer.properties.get(texture) as { __webglTexture?: WebGLTexture }
  ).__webglTexture
  const eventsAfterFirst = registry.snapshot().events.filter((event) => event.type === 'disposed').length

  scene.remove(right)
  rightLease.release()
  renderer.render(scene, camera)
  const handleAfterLastRelease = (
    renderer.properties.get(texture) as { __webglTexture?: WebGLTexture }
  ).__webglTexture
  const eventsAfterLast = registry.snapshot().events.filter((event) => event.type === 'disposed').length

  const proof = {
    actualWebGLTextureCreated: Boolean(webGLTexture),
    survivedFirstRelease: Boolean(webGLTexture && handleAfterFirstRelease === webGLTexture),
    disposedAfterLastRelease: handleAfterLastRelease === undefined,
    disposeEventsAfterFirstRelease: eventsAfterFirst,
    disposeEventsAfterLastRelease: eventsAfterLast,
  }

  renderer.dispose()
  renderer.forceContextLoss()
  return proof
}

export function mountHeroScene(canvas: HTMLCanvasElement): () => void {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  const scene = new Scene()
  const camera = new PerspectiveCamera(36, 1, 0.1, 40)
  camera.position.set(0, 0.3, 7.5)

  const group = new Group()
  const shell = new Mesh(
    new TorusKnotGeometry(1.18, 0.33, 164, 24, 2, 3),
    new MeshStandardMaterial({
      color: '#d8ff53',
      roughness: 0.28,
      metalness: 0.22,
    }),
  )
  const core = new Mesh(
    new SphereGeometry(0.68, 32, 20),
    new MeshStandardMaterial({ color: '#ff5c39', roughness: 0.46 }),
  )
  group.add(shell, core)
  scene.add(group)

  const key = new DirectionalLight(0xffffff, 4)
  key.position.set(3, 4, 6)
  const fill = new DirectionalLight(0x91b9ff, 2.5)
  fill.position.set(-5, -2, 2)
  scene.add(new AmbientLight(0xffffff, 0.65), key, fill)

  const registry = createResourceRegistry({ mode: 'dispose' })
  const lease = registry.acquire(group, { ownership: 'owned', label: 'hero scene' })
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  let frame = 0

  const resize = () => {
    const width = Math.max(1, canvas.clientWidth)
    const height = Math.max(1, canvas.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()

  const render = (time: number) => {
    group.rotation.y = reducedMotion ? 0.3 : time * 0.00018
    group.rotation.x = reducedMotion ? -0.12 : Math.sin(time * 0.00035) * 0.12
    renderer.render(scene, camera)
    frame = requestAnimationFrame(render)
  }
  frame = requestAnimationFrame(render)

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    lease.release()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
