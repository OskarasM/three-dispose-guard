import {
  AmbientLight,
  BoxGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  Group,
  MeshBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  SphereGeometry,
  TorusGeometry,
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
  eagerInvalidatedSharedHandle: boolean
  unmanagedRetainedAfterFinalUnmount: boolean
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
  variant: Exclude<BenchmarkVariant, 'native'>,
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
    } else if (variant === 'naive') {
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

function createNativeCycleElement(
  createElement: typeof import('react').createElement,
  cycle: number,
): import('react').ReactElement {
  const positions = [-1.8, -0.6, 0.6, 1.8]

  return createElement(
    'group',
    { key: `cycle-${cycle}` },
    createElement('ambientLight', { intensity: 1.2 }),
    createElement('directionalLight', { intensity: 2.4, position: [2, 4, 5] }),
    ...positions.map((position, index) => {
      const size = 16
      const data = new Uint8Array(size * size * 4)
      for (let pixel = 0; pixel < size * size; pixel += 1) {
        data[pixel * 4] = seededByte(cycle * 10 + index, pixel)
        data[pixel * 4 + 1] = seededByte(cycle * 10 + index + 11, pixel)
        data[pixel * 4 + 2] = seededByte(cycle * 10 + index + 29, pixel)
        data[pixel * 4 + 3] = 255
      }

      return createElement(
        'mesh',
        {
          key: `mesh-${cycle}-${index}`,
          position: [position, index % 2 === 0 ? 0.24 : -0.24, 0],
          rotation: [cycle * 0.04, index * 0.45, 0],
        },
        createElement(index % 2 === 0 ? 'boxGeometry' : 'sphereGeometry', {
          args: index % 2 === 0
            ? [0.62, 0.62, 0.62, 6, 6, 6]
            : [0.42, 18, 12],
        }),
        createElement(
          'meshStandardMaterial',
          {
            roughness: 0.34,
            metalness: 0.18,
            color: new Color().setHSL(((cycle + index) % 20) / 20, 0.72, 0.58).getHex(),
          },
          createElement('dataTexture', {
            attach: 'map',
            args: [data, size, size, RGBAFormat],
            needsUpdate: true,
          }),
        ),
      )
    }),
  )
}

async function runNativeR3FVariant(
  cycles: number,
  onSample?: (sample: MemorySample) => void,
): Promise<{ report: VariantReport; renderer: string }> {
  const [{ createElement }, { createRoot, flushSync }] = await Promise.all([
    import('react'),
    import('@react-three/fiber'),
  ])
  const canvas = document.createElement('canvas')
  canvas.width = 192
  canvas.height = 128
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' })
  renderer.setSize(192, 128, false)
  const hardware = rendererName(renderer)
  const samples: MemorySample[] = []
  const root = createRoot(canvas)
  let store: ReturnType<typeof root.render> | undefined
  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean
  }
  const previousActEnvironment = Object.getOwnPropertyDescriptor(
    actEnvironment,
    'IS_REACT_ACT_ENVIRONMENT',
  )

  await root.configure({
    gl: renderer,
    frameloop: 'never',
    dpr: 1,
    size: { width: 192, height: 128, top: 0, left: 0 },
    camera: { fov: 45, position: [0, 0, 6] },
  })

  Object.defineProperty(actEnvironment, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  })

  try {
    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      flushSync(() => {
        store = root.render(createNativeCycleElement(createElement, cycle))
      })
      if (!store) throw new Error('R3F did not return a renderer store')
      const state = store.getState()
      state.gl.render(state.scene, state.camera)

      flushSync(() => root.render(null))
      state.gl.render(state.scene, state.camera)

      const sample = readSample(renderer, cycle)
      samples.push(sample)
      onSample?.(sample)
      if (cycle % 4 === 0) await nextFrame()
    }
  } finally {
    root.unmount()
    await new Promise((resolve) => setTimeout(resolve, 520))
    if (previousActEnvironment) {
      Object.defineProperty(
        actEnvironment,
        'IS_REACT_ACT_ENVIRONMENT',
        previousActEnvironment,
      )
    } else {
      delete actEnvironment.IS_REACT_ACT_ENVIRONMENT
    }
  }

  const final = samples.at(-1) ?? readSample(renderer, 0)
  return {
    report: { samples, final, peak: peakSample(samples) },
    renderer: hardware,
  }
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
  const native = await runNativeR3FVariant(boundedCycles, callbacks?.onNativeSample)
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

interface SharedCounterfactualWorld {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  texture: DataTexture
  left: Mesh
  right: Mesh
}

function createSharedCounterfactualWorld(seed: number): SharedCounterfactualWorld {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const renderer = new WebGLRenderer({ canvas, antialias: false })
  renderer.setSize(96, 96, false)
  const scene = new Scene()
  const camera = new PerspectiveCamera(45, 1, 0.1, 10)
  camera.position.z = 4
  const texture = createTexture(seed)
  const geometry = new BoxGeometry(0.8, 0.8, 0.8)
  const material = new MeshStandardMaterial({ map: texture })
  const left = new Mesh(geometry, material)
  const right = new Mesh(geometry, material)
  left.position.x = -0.6
  right.position.x = 0.6
  scene.add(new AmbientLight(0xffffff, 2), left, right)
  return { renderer, scene, camera, texture, left, right }
}

function closeCounterfactualWorld(world: SharedCounterfactualWorld): void {
  world.renderer.dispose()
  world.renderer.forceContextLoss()
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
  const eager = createSharedCounterfactualWorld(405)
  eager.renderer.render(eager.scene, eager.camera)
  const eagerOriginal = (
    eager.renderer.properties.get(eager.texture) as { __webglTexture?: WebGLTexture }
  ).__webglTexture
  eager.scene.remove(eager.left)
  for (const resource of collectDisposableResources(eager.left)) resource.dispose()
  const eagerAfterFirst = (
    eager.renderer.properties.get(eager.texture) as { __webglTexture?: WebGLTexture }
  ).__webglTexture
  const eagerInvalidatedSharedHandle = Boolean(eagerOriginal && eagerAfterFirst === undefined)
  closeCounterfactualWorld(eager)

  const unmanaged = createSharedCounterfactualWorld(406)
  unmanaged.renderer.render(unmanaged.scene, unmanaged.camera)
  const unmanagedOriginal = (
    unmanaged.renderer.properties.get(unmanaged.texture) as { __webglTexture?: WebGLTexture }
  ).__webglTexture
  unmanaged.scene.remove(unmanaged.left, unmanaged.right)
  unmanaged.renderer.render(unmanaged.scene, unmanaged.camera)
  const unmanagedAfterFinalUnmount = (
    unmanaged.renderer.properties.get(unmanaged.texture) as { __webglTexture?: WebGLTexture }
  ).__webglTexture
  const unmanagedRetainedAfterFinalUnmount = Boolean(
    unmanagedOriginal && unmanagedAfterFinalUnmount === unmanagedOriginal
  )
  closeCounterfactualWorld(unmanaged)

  const proof = {
    actualWebGLTextureCreated: Boolean(webGLTexture),
    survivedFirstRelease: Boolean(webGLTexture && handleAfterFirstRelease === webGLTexture),
    disposedAfterLastRelease: handleAfterLastRelease === undefined,
    eagerInvalidatedSharedHandle,
    unmanagedRetainedAfterFinalUnmount,
    disposeEventsAfterFirstRelease: eventsAfterFirst,
    disposeEventsAfterLastRelease: eventsAfterLast,
  }

  renderer.dispose()
  renderer.forceContextLoss()
  return proof
}

/* The hero's shared texture is deliberately a flat, high-contrast pattern
   rather than the noise the benchmark uses. The point the scene has to make is
   that all three consumers are drawing the SAME asset, and identical noise is
   hard to read as identical. A crisp grid with one offset marker cell is
   obvious at a glance and at hero size. */
function createSharedHeroTexture(): DataTexture {
  const size = 8
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4
      const edge = x === 0 || y === 0
      const marker = x === 2 && y === 2
      const [r, g, b] = marker
        ? [255, 101, 69]
        : edge
          ? [16, 21, 10]
          : [216, 255, 83]
      data[index] = r
      data[index + 1] = g
      data[index + 2] = b
      data[index + 3] = 255
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

export interface HeroOwnershipState {
  /** How many consumers currently hold the shared asset. */
  owners: number
  /** True while the shared asset is still allocated on the GPU. */
  alive: boolean
  /** What just happened, in the words the package uses. */
  event: 'holding' | 'released' | 'disposed' | 'reacquired'
}

/* The hero used to be a rotating torus knot, which is the only thing on this
 * page that said nothing. It now runs the argument the package exists to make.
 *
 * One geometry and one texture are created once and shared by three consumers.
 * The consumers release one at a time. The shared asset stays on the GPU while
 * any owner remains, and is disposed on the frame the last one lets go, which
 * is the whole thesis: the safe moment is when the count reaches zero, not when
 * the first component unmounts.
 *
 * The count is read from a real registry rather than tracked alongside one, so
 * the number on screen is the package's own answer and cannot drift from it.
 */
export function mountHeroScene(
  canvas: HTMLCanvasElement,
  onState?: (state: HeroOwnershipState) => void,
): () => void {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  const scene = new Scene()
  const camera = new PerspectiveCamera(36, 1, 0.1, 40)
  camera.position.set(0, 1.15, 9.4)
  camera.lookAt(0, 0, 0)

  // The shared asset. One geometry, one texture, one material, referenced by
  // every consumer below. Nothing here is cloned.
  const sharedGeometry = new BoxGeometry(1, 1, 1)
  const sharedTexture = createSharedHeroTexture()
  const sharedMaterial = new MeshStandardMaterial({
    color: '#d8ff53',
    map: sharedTexture,
    roughness: 0.34,
    metalness: 0.18,
  })

  const registry = createResourceRegistry({ mode: 'dispose' })

  const stage = new Group()
  scene.add(stage)

  // Three consumers on a ring, each mounting the same asset.
  const CONSUMERS = 3
  const radius = 2.5
  const consumers = Array.from({ length: CONSUMERS }, (_, index) => {
    const angle = (index / CONSUMERS) * Math.PI * 2
    const mesh = new Mesh(sharedGeometry, sharedMaterial)
    mesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.34, Math.sin(angle) * radius * 0.5)
    stage.add(mesh)
    return { mesh, angle, holding: true, lease: null as null | ReturnType<typeof registry.acquire> }
  })

  // The core stands for the asset itself: lit while owned, dark once disposed.
  const core = new Mesh(
    new SphereGeometry(0.52, 32, 20),
    new MeshStandardMaterial({ color: '#d8ff53', roughness: 0.4, emissive: new Color('#20300a') }),
  )
  stage.add(core)

  // A hairline ring joining the consumers to the thing they share.
  const ring = new Mesh(
    new TorusGeometry(radius * 0.78, 0.012, 8, 96),
    new MeshBasicMaterial({ color: '#3a413a' }),
  )
  ring.scale.set(1, 0.42, 1)
  stage.add(ring)

  const key = new DirectionalLight(0xffffff, 3.4)
  key.position.set(3, 4, 6)
  const fill = new DirectionalLight(0x91b9ff, 2)
  fill.position.set(-5, -2, 2)
  scene.add(new AmbientLight(0xffffff, 0.7), key, fill)

  const acquireAll = () => {
    for (const consumer of consumers) {
      consumer.lease = registry.acquire(consumer.mesh, {
        ownership: 'owned',
        label: 'shared product asset',
      })
      consumer.holding = true
      consumer.mesh.visible = true
    }
  }
  acquireAll()

  const ownerCount = () => registry.snapshot().activeLeases

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  let frame = 0
  let step = 0
  let lastStepAt = 0
  // Slow enough to read the number change, quick enough to see the whole
  // argument without waiting: four steps, release release release, then reset.
  const STEP_MS = 1600

  const advance = () => {
    step = (step + 1) % (CONSUMERS + 1)
    if (step === 0) {
      // ponytail: reacquiring after the registry disposed the asset makes
      // Three.js re-upload it from the JS-side attributes, so this loop churns
      // one small geometry and one 8x8 texture every cycle. That is the honest
      // consequence of the thing being demonstrated, and at this size it is
      // nothing. Hold the asset under a protection and reuse it if the hero
      // ever grows to a real model.
      acquireAll()
      onState?.({ owners: ownerCount(), alive: true, event: 'reacquired' })
      return
    }
    const consumer = consumers[step - 1]
    if (consumer?.lease) {
      consumer.lease.release()
      consumer.lease = null
      consumer.holding = false
    }
    const owners = ownerCount()
    onState?.({
      owners,
      alive: owners > 0,
      event: owners === 0 ? 'disposed' : 'released',
    })
  }

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
    if (!reducedMotion) {
      if (lastStepAt === 0) lastStepAt = time
      if (time - lastStepAt >= STEP_MS) {
        lastStepAt = time
        advance()
      }
      stage.rotation.y = time * 0.00016
      for (const consumer of consumers) {
        // A released consumer shrinks away rather than vanishing, so the eye
        // can follow which one let go.
        const target = consumer.holding ? 1 : 0.001
        consumer.mesh.scale.setScalar(
          consumer.mesh.scale.x + (target - consumer.mesh.scale.x) * 0.08,
        )
        consumer.mesh.rotation.x = time * 0.0004 + consumer.angle
        consumer.mesh.rotation.y = time * 0.0003
      }
      const owners = ownerCount()
      const material = core.material as MeshStandardMaterial
      // The core is only dark once every owner has gone.
      material.emissive.setHex(owners > 0 ? 0x20300a : 0x000000)
      material.color.set(owners > 0 ? '#d8ff53' : '#2a2f2b')
      core.scale.setScalar(owners > 0 ? 1 : 0.72)
    } else {
      stage.rotation.y = 0.4
    }
    renderer.render(scene, camera)
    frame = requestAnimationFrame(render)
  }
  frame = requestAnimationFrame(render)
  onState?.({ owners: ownerCount(), alive: true, event: 'holding' })

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    for (const consumer of consumers) consumer.lease?.release()
    // The registry disposed the shared asset when the last lease went. These
    // are the objects it does not own: the core, the ring and the renderer.
    core.geometry.dispose()
    ;(core.material as MeshStandardMaterial).dispose()
    ring.geometry.dispose()
    ;(ring.material as MeshBasicMaterial).dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
