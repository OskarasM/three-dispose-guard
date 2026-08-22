import { StrictMode, Suspense, useEffect, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { Canvas, type RootState } from '@react-three/fiber'
import {
  BoxGeometry,
  DataTexture,
  Loader,
  MeshBasicMaterial,
  RGBAFormat,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { createResourceRegistry } from 'three-dispose-guard'
import {
  createR3FResourceCache,
  R3FResourceCacheProvider,
  useGuardedLoader,
} from 'three-dispose-guard/r3f'

/**
 * Mounted React Three Fiber stories. Every assertion here runs against a real
 * `<Canvas>`, a real WebGLRenderer and the WebGL texture handle the driver
 * allocated, rather than against an imperative reconstruction of the same
 * lifecycle. The imperative proofs in `research-lab.ts` measure the registry;
 * these measure the R3F adapter as an application actually mounts it.
 */

export interface StoryAssertion {
  label: string
  passed: boolean
  detail: string
}

export interface R3FStoryReport {
  measuredAt: string
  renderer: string
  browser: string
  assertions: StoryAssertion[]
  notes: readonly string[]
}

interface StoryAsset {
  geometry: BoxGeometry
  material: MeshBasicMaterial
  texture: DataTexture
}

interface TrackedAsset {
  serial: number
  asset: StoryAsset
  disposals: { geometry: number; material: number; texture: number }
}

const loaded: TrackedAsset[] = []
let serial = 0

function countDisposals(tracked: TrackedAsset): number {
  return tracked.disposals.geometry + tracked.disposals.material + tracked.disposals.texture
}

function createTrackedAsset(): TrackedAsset {
  serial += 1
  const seed = (serial * 37) % 256
  const texture = new DataTexture(new Uint8Array([seed, 255 - seed, 83, 255]), 1, 1, RGBAFormat)
  texture.needsUpdate = true
  const geometry = new BoxGeometry(0.8, 0.8, 0.8)
  const material = new MeshBasicMaterial({ map: texture })

  const tracked: TrackedAsset = {
    serial,
    asset: { geometry, material, texture },
    disposals: { geometry: 0, material: 0, texture: 0 },
  }

  // Count every disposal so "exactly once" is measured on the resource itself,
  // not inferred from the registry's own event log.
  for (const kind of ['geometry', 'material', 'texture'] as const) {
    const resource = tracked.asset[kind]
    const original = resource.dispose.bind(resource)
    resource.dispose = () => {
      tracked.disposals[kind] += 1
      original()
    }
  }

  return tracked
}

/**
 * Stands in for a network loader. The stories are about ownership and cache
 * lifetime, so the asset is synthesised locally, but it resolves on a later
 * task so the first mount genuinely suspends.
 */
class StoryLoader extends Loader<StoryAsset, string> {
  load(url: string, onLoad: (asset: StoryAsset) => void): void {
    const tracked = createTrackedAsset()
    loaded.push(tracked)
    setTimeout(() => onLoad(tracked.asset), 0)
  }
}

const assetUrl = '/story-asset'
const registry = createResourceRegistry({ mode: 'dispose' })
const cache = createR3FResourceCache({ registry })

type ConsumerId = 'a' | 'b'

const seen = new Map<ConsumerId, StoryAsset>()

function Consumer({ id }: { id: ConsumerId }) {
  const asset = useGuardedLoader(StoryLoader, assetUrl)

  useEffect(() => {
    seen.set(id, asset)
  }, [id, asset])

  return (
    <mesh
      position={[id === 'a' ? -0.7 : 0.7, 0, 0]}
      geometry={asset.geometry}
      material={asset.material}
      dispose={null}
    />
  )
}

function tree(mounted: readonly ConsumerId[], onCreated: (state: RootState) => void): ReactNode {
  return (
    <StrictMode>
      <R3FResourceCacheProvider cache={cache}>
        <Canvas
          frameloop="always"
          camera={{ position: [0, 0, 4] }}
          gl={{ antialias: false, powerPreference: 'low-power' }}
          onCreated={onCreated}
        >
          <ambientLight intensity={2} />
          <Suspense fallback={null}>
            {mounted.includes('a') && <Consumer id="a" />}
            {mounted.includes('b') && <Consumer id="b" />}
          </Suspense>
        </Canvas>
      </R3FResourceCacheProvider>
    </StrictMode>
  )
}

function frame(): Promise<void> {
  return new Promise((resolve) => { requestAnimationFrame(() => resolve()) })
}

async function settle(frames = 4): Promise<void> {
  for (let index = 0; index < frames; index += 1) await frame()
}

async function waitFor(condition: () => boolean, label: string, timeout = 15_000): Promise<void> {
  const started = performance.now()
  while (!condition()) {
    if (performance.now() - started > timeout) {
      throw new Error(`Timed out waiting for ${label}`)
    }
    await frame()
  }
}

function textureHandle(renderer: WebGLRenderer, texture: Texture): WebGLTexture | undefined {
  return (renderer.properties.get(texture) as { __webglTexture?: WebGLTexture }).__webglTexture
}

function rendererName(renderer: WebGLRenderer): string {
  const gl = renderer.getContext()
  const extension = gl.getExtension('WEBGL_debug_renderer_info')
  return extension
    ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL))
    : 'WebGL renderer hidden by browser'
}

export async function runR3FStories(): Promise<R3FStoryReport> {
  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  container.style.cssText = 'position:fixed;left:-10000px;top:0;width:180px;height:180px'
  document.body.appendChild(container)

  const assertions: StoryAssertion[] = []
  let renderer: WebGLRenderer | undefined
  let root: Root | undefined
  const capture = (state: RootState) => { renderer = state.gl }
  const show = (mounted: readonly ConsumerId[]) => {
    flushSync(() => root?.render(tree(mounted, capture)))
  }

  const assert = (label: string, passed: boolean, detail: string) => {
    assertions.push({ label, passed, detail })
  }

  try {
    root = createRoot(container)
    show(['a', 'b'])
    await waitFor(() => renderer !== undefined, 'the Canvas to create a renderer')
    await waitFor(() => seen.size === 2, 'both consumers to resolve the loader')
    await settle()

    const gl = renderer!
    const first = loaded[0]
    if (!first) throw new Error('The story loader was never invoked')
    const original = textureHandle(gl, first.asset.texture)

    assert(
      'One mounted asset serves two consumers',
      loaded.length === 1
        && seen.get('a') === first.asset
        && seen.get('b') === first.asset,
      `${loaded.length} load(s) occurred and both consumers received the same object.`,
    )
    assert(
      'The driver allocated a real WebGL texture',
      original !== undefined,
      original === undefined
        ? 'No __webglTexture was present after rendering.'
        : 'renderer.properties reported a native texture handle.',
    )

    // The dangerous case: one of two live users leaves.
    show(['b'])
    await settle()
    assert(
      'The surviving consumer keeps the same WebGL handle',
      original !== undefined && textureHandle(gl, first.asset.texture) === original,
      `${countDisposals(first)} disposals occurred after the first consumer unmounted.`,
    )

    // Zero mounted users, but the cache is still an owner.
    show([])
    await settle()
    assert(
      'Zero consumers does not imply eviction',
      original !== undefined
        && textureHandle(gl, first.asset.texture) === original
        && countDisposals(first) === 0,
      `The cached asset survived with ${countDisposals(first)} disposals recorded.`,
    )

    // Mounting again must reuse the cached result, not reload it.
    show(['a'])
    await settle()
    assert(
      'A later mount reuses the cached allocation',
      loaded.length === 1
        && seen.get('a') === first.asset
        && textureHandle(gl, first.asset.texture) === original,
      `${loaded.length} load(s) total; the remount reused the same WebGL handle.`,
    )

    // The Strict Mode shape: unmount and remount inside one synchronous block,
    // so the microtask release policy must reclaim the lease before it fires.
    show([])
    show(['a'])
    await settle()
    assert(
      'A same-tick unmount and remount disposes nothing',
      countDisposals(first) === 0
        && textureHandle(gl, first.asset.texture) === original,
      `${countDisposals(first)} disposals occurred across the same-tick replay.`,
    )

    // Eviction with a consumer still mounted must not destroy live GPU state.
    cache.evict(StoryLoader, assetUrl)
    registry.flush()
    await settle()
    assert(
      'Eviction under a live consumer is deferred',
      countDisposals(first) === 0
        && textureHandle(gl, first.asset.texture) === original,
      `${countDisposals(first)} disposals occurred while one consumer was still mounted.`,
    )

    // Now the final owner leaves.
    show([])
    registry.flush()
    await settle()
    assert(
      'The final release disposes each resource exactly once',
      first.disposals.geometry === 1
        && first.disposals.material === 1
        && first.disposals.texture === 1,
      `geometry ${first.disposals.geometry}, material ${first.disposals.material}, texture ${first.disposals.texture}.`,
    )
    assert(
      'The native WebGL texture is released',
      textureHandle(gl, first.asset.texture) === undefined,
      'renderer.properties no longer holds a handle for the disposed texture.',
    )

    // A fresh mount after eviction must load again rather than revive the
    // disposed result.
    show(['a'])
    await waitFor(
      () => loaded.length === 2 && seen.get('a') === loaded[1]?.asset,
      'a fresh load after eviction to reach the consumer',
    )
    await settle()
    const second = loaded[1]!
    const consumerHasNewAsset = seen.get('a') === second.asset
    const newHandle = textureHandle(gl, second.asset.texture)
    assert(
      'A mount after eviction loads a new asset',
      consumerHasNewAsset && second.asset !== first.asset && newHandle !== original,
      `${loaded.length} loads; consumer holds the new asset: ${consumerHasNewAsset}; new handle present: ${newHandle !== undefined}; handle differs from the disposed one: ${newHandle !== original}.`,
    )

    // Full Canvas teardown, then a completely fresh renderer.
    const firstRendererId = rendererName(gl)
    root.unmount()
    root = undefined
    await settle()
    const contextLostAfterUnmount = gl.getContext().isContextLost()

    renderer = undefined
    seen.clear()
    root = createRoot(container)
    show(['a', 'b'])
    await waitFor(() => renderer !== undefined, 'the second Canvas to create a renderer')
    await waitFor(() => seen.size === 2, 'both consumers on the second Canvas')
    await settle()

    const remounted = renderer!
    const remountedHandle = textureHandle(remounted, loaded[loaded.length - 1]!.asset.texture)
    assert(
      'A Canvas remount rebuilds a working renderer',
      remounted !== gl && remountedHandle !== undefined,
      contextLostAfterUnmount
        ? 'The first WebGL context was lost on unmount and a new one uploaded the asset.'
        : 'A new renderer uploaded the asset; the first context was not reported lost.',
    )

    return {
      measuredAt: new Date().toISOString(),
      renderer: firstRendererId,
      browser: navigator.userAgent,
      assertions,
      notes: [
        'Every assertion reads renderer.properties, so it observes the driver handle rather than a reference count.',
        'The loader synthesises its asset locally. The stories measure cache and ownership lifetime, not file parsing.',
        'Disposal counts are recorded on each resource, so "exactly once" is measured rather than inferred.',
        'The same-tick story reproduces the Strict Mode effect replay shape. React only replays effects in development, so the stories force the shape directly and it holds in a production build too.',
      ],
    }
  } finally {
    root?.unmount()
    container.remove()
    loaded.length = 0
    serial = 0
    seen.clear()
    cache.clear()
  }
}
