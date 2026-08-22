import React, { Suspense } from 'react'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import {
  BoxGeometry,
  DataTexture,
  Group,
  Loader,
  Mesh,
  MeshBasicMaterial,
  RGBAFormat,
} from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createResourceRegistry } from '../src'
import {
  createR3FResourceCache,
  GuardedPrimitive,
  R3FResourceCacheProvider,
  useGuardedLoader,
} from '../src/r3f'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

interface TestAsset {
  scene: Group
  texture: DataTexture
}

interface LoadedAsset {
  asset: TestAsset
  textureDispose: ReturnType<typeof vi.spyOn>
}

function createAsset(): LoadedAsset {
  const texture = new DataTexture(new Uint8Array([216, 255, 83, 255]), 1, 1, RGBAFormat)
  const material = new MeshBasicMaterial({ map: texture })
  const scene = new Group()
  scene.add(new Mesh(new BoxGeometry(), material))
  return {
    asset: { scene, texture },
    textureDispose: vi.spyOn(texture, 'dispose'),
  }
}

class ImmediateLoader extends Loader<TestAsset, string> {
  static loaded: LoadedAsset[] = []

  load(url: string, onLoad: (asset: TestAsset) => void): void {
    const loaded = createAsset()
    ImmediateLoader.loaded.push(loaded)
    queueMicrotask(() => onLoad(loaded.asset))
  }
}

class DeferredLoader extends Loader<TestAsset, string> {
  static pending: Array<LoadedAsset & { resolve: () => void }> = []

  load(url: string, onLoad: (asset: TestAsset) => void): void {
    const loaded = createAsset()
    DeferredLoader.pending.push({
      ...loaded,
      resolve: () => onLoad(loaded.asset),
    })
  }
}

class KeyedDeferredLoader extends Loader<TestAsset, string> {
  static pending: Array<LoadedAsset & {
    url: string
    resolve: () => void
    reject: (error: unknown) => void
  }> = []

  load(
    url: string,
    onLoad: (asset: TestAsset) => void,
    _onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): void {
    const loaded = createAsset()
    KeyedDeferredLoader.pending.push({
      ...loaded,
      url,
      resolve: () => onLoad(loaded.asset),
      reject: (error) => onError?.(error),
    })
  }
}

class RejectOnceLoader extends Loader<TestAsset, string> {
  static attempts = 0
  static readonly originalError = new Error('loader rejected once')

  load(
    _url: string,
    onLoad: (asset: TestAsset) => void,
    _onProgress: (event: ProgressEvent) => void,
    onError: (error: unknown) => void,
  ): void {
    RejectOnceLoader.attempts += 1
    if (RejectOnceLoader.attempts === 1) {
      queueMicrotask(() => onError(RejectOnceLoader.originalError))
      return
    }

    const loaded = createAsset()
    ImmediateLoader.loaded.push(loaded)
    queueMicrotask(() => onLoad(loaded.asset))
  }
}

beforeEach(() => {
  ImmediateLoader.loaded = []
  DeferredLoader.pending = []
  KeyedDeferredLoader.pending = []
  RejectOnceLoader.attempts = 0
})

describe('R3FResourceCache', () => {
  it('protects an R3F preload until explicit eviction', async () => {
    const registry = createResourceRegistry({ mode: 'dispose' })
    const cache = createR3FResourceCache({ registry })

    cache.preload(ImmediateLoader, '/preloaded.glb')
    await vi.waitFor(() => expect(cache.snapshot().ready).toBe(1))

    expect(registry.snapshot().activeProtections).toBe(1)
    expect(ImmediateLoader.loaded).toHaveLength(1)
    expect(ImmediateLoader.loaded[0].textureDispose).not.toHaveBeenCalled()

    cache.evict(ImmediateLoader, '/preloaded.glb')
    cache.evict(ImmediateLoader, '/preloaded.glb')

    expect(ImmediateLoader.loaded[0].textureDispose).toHaveBeenCalledOnce()
    expect(registry.snapshot().trackedResources).toBe(0)
    expect(cache.snapshot().entries).toHaveLength(0)
  })

  it('accepts a loader instance for preload and eviction', async () => {
    const registry = createResourceRegistry({ mode: 'dispose' })
    const cache = createR3FResourceCache({ registry })
    const loader = new ImmediateLoader()

    cache.preload(loader, '/instance.glb')
    await vi.waitFor(() => expect(cache.snapshot().ready).toBe(1))

    expect(registry.snapshot().activeProtections).toBe(1)
    expect(ImmediateLoader.loaded[0].textureDispose).not.toHaveBeenCalled()

    cache.evict(loader, '/instance.glb')
    expect(ImmediateLoader.loaded[0].textureDispose).toHaveBeenCalledOnce()
  })

  it('cleans a stale result that resolves after in-flight eviction', async () => {
    const registry = createResourceRegistry({ mode: 'dispose' })
    const cache = createR3FResourceCache({ registry })

    cache.preload(DeferredLoader, '/slow.glb')
    expect(cache.snapshot().loading).toBe(1)
    expect(DeferredLoader.pending).toHaveLength(1)

    cache.evict(DeferredLoader, '/slow.glb')
    DeferredLoader.pending[0].resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(DeferredLoader.pending[0].textureDispose).toHaveBeenCalledOnce()
    expect(cache.snapshot().entries).toHaveLength(0)
    expect(registry.snapshot().trackedResources).toBe(0)
  })

  it('keeps a replacement generation isolated from a late stale result', async () => {
    const registry = createResourceRegistry({ mode: 'dispose' })
    const cache = createR3FResourceCache({ registry })

    cache.preload(DeferredLoader, '/generation.glb')
    cache.evict(DeferredLoader, '/generation.glb')
    cache.preload(DeferredLoader, '/generation.glb')

    expect(DeferredLoader.pending).toHaveLength(2)

    DeferredLoader.pending[0].resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(DeferredLoader.pending[0].textureDispose).toHaveBeenCalledOnce()
    expect(DeferredLoader.pending[1].textureDispose).not.toHaveBeenCalled()
    expect(cache.snapshot().entries[0]).toEqual(expect.objectContaining({
      status: 'loading',
      resolvedParts: 0,
    }))

    DeferredLoader.pending[1].resolve()
    await vi.waitFor(() => expect(cache.snapshot().ready).toBe(1))

    expect(registry.snapshot().activeProtections).toBe(1)
    expect(DeferredLoader.pending[1].textureDispose).not.toHaveBeenCalled()

    cache.evict(DeferredLoader, '/generation.glb')
    expect(DeferredLoader.pending[1].textureDispose).toHaveBeenCalledOnce()
  })

  it('associates overlapping array loads with their exact cache entry', async () => {
    const registry = createResourceRegistry({ mode: 'dispose' })
    const cache = createR3FResourceCache({ registry })
    const firstInput = ['/shared.glb', '/first.glb']
    const secondInput = ['/shared.glb', '/second.glb']
    const firstKey = JSON.stringify(firstInput)
    const secondKey = JSON.stringify(secondInput)
    const entry = (key: string) =>
      cache.snapshot().entries.find((candidate) => candidate.key === key)

    cache.preload(KeyedDeferredLoader, firstInput)
    cache.preload(KeyedDeferredLoader, secondInput)

    expect(KeyedDeferredLoader.pending.map((pending) => pending.url)).toEqual([
      '/shared.glb',
      '/first.glb',
      '/shared.glb',
      '/second.glb',
    ])

    KeyedDeferredLoader.pending[0].resolve()
    await Promise.resolve()

    expect(entry(firstKey)).toEqual(expect.objectContaining({
      status: 'loading',
      resolvedParts: 1,
    }))
    expect(entry(secondKey)).toEqual(expect.objectContaining({
      status: 'loading',
      resolvedParts: 0,
    }))
    expect(registry.snapshot().activeProtections).toBe(1)

    KeyedDeferredLoader.pending[1].resolve()
    await Promise.resolve()

    expect(entry(firstKey)?.status).toBe('ready')
    expect(entry(secondKey)?.resolvedParts).toBe(0)
    expect(registry.snapshot().activeProtections).toBe(2)

    KeyedDeferredLoader.pending[2].resolve()
    KeyedDeferredLoader.pending[3].resolve()
    await vi.waitFor(() => expect(cache.snapshot().ready).toBe(2))

    expect(registry.snapshot().activeProtections).toBe(4)

    cache.evict(KeyedDeferredLoader, firstInput)
    expect(KeyedDeferredLoader.pending[0].textureDispose).toHaveBeenCalledOnce()
    expect(KeyedDeferredLoader.pending[1].textureDispose).toHaveBeenCalledOnce()
    expect(KeyedDeferredLoader.pending[2].textureDispose).not.toHaveBeenCalled()
    expect(KeyedDeferredLoader.pending[3].textureDispose).not.toHaveBeenCalled()

    cache.evict(KeyedDeferredLoader, secondInput)
    expect(KeyedDeferredLoader.pending[2].textureDispose).toHaveBeenCalledOnce()
    expect(KeyedDeferredLoader.pending[3].textureDispose).toHaveBeenCalledOnce()
  })

  it('cleans a late array part after a sibling rejects', async () => {
    const registry = createResourceRegistry({ mode: 'dispose' })
    const cache = createR3FResourceCache({ registry })
    const input = ['/reject.glb', '/late.glb']

    cache.preload(KeyedDeferredLoader, input)
    expect(KeyedDeferredLoader.pending).toHaveLength(2)

    KeyedDeferredLoader.pending[0].reject(new Error('first part rejected'))
    await vi.waitFor(() => expect(cache.snapshot().errors).toBe(1))

    expect(registry.snapshot().activeProtections).toBe(0)
    expect(cache.snapshot().entries[0]?.resources).toBe(0)

    KeyedDeferredLoader.pending[1].resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(KeyedDeferredLoader.pending[1].textureDispose).toHaveBeenCalledOnce()
    expect(registry.snapshot().activeProtections).toBe(0)
    expect(registry.snapshot().trackedResources).toBe(0)
    expect(cache.snapshot().entries[0]).toEqual(expect.objectContaining({
      status: 'error',
      resources: 0,
      resolvedParts: 0,
    }))
  })

  it('leaves rejected entries unprotected and retryable', async () => {
    const registry = createResourceRegistry({ mode: 'dispose' })
    const cache = createR3FResourceCache({ registry })

    cache.preload(RejectOnceLoader, '/retry.glb')
    await vi.waitFor(() => expect(cache.snapshot().errors).toBe(1))

    expect(registry.snapshot().activeProtections).toBe(0)
    expect(RejectOnceLoader.attempts).toBe(1)

    cache.preload(RejectOnceLoader, '/retry.glb')
    await vi.waitFor(() => expect(cache.snapshot().ready).toBe(1))

    expect(RejectOnceLoader.attempts).toBe(2)
    expect(registry.snapshot().activeProtections).toBe(1)

    cache.evict(RejectOnceLoader, '/retry.glb')
    expect(ImmediateLoader.loaded[0].textureDispose).toHaveBeenCalledOnce()
  })

  it('refuses two registries claiming the same global R3F cache entry', async () => {
    const first = createR3FResourceCache({
      registry: createResourceRegistry({ mode: 'dispose' }),
    })
    const second = createR3FResourceCache({
      registry: createResourceRegistry({ mode: 'dispose' }),
    })

    first.preload(ImmediateLoader, '/claimed.glb')
    await vi.waitFor(() => expect(first.snapshot().ready).toBe(1))

    expect(() => second.preload(ImmediateLoader, '/claimed.glb')).toThrow(
      'already guarded by another registry',
    )

    first.clear()
  })

  it('ignores eviction from a guard that does not own the key', async () => {
    const ownerRegistry = createResourceRegistry({ mode: 'dispose' })
    const owner = createR3FResourceCache({ registry: ownerRegistry })
    const outsider = createR3FResourceCache({
      registry: createResourceRegistry({ mode: 'dispose' }),
    })

    owner.preload(ImmediateLoader, '/unowned-eviction.glb')
    await vi.waitFor(() => expect(owner.snapshot().ready).toBe(1))

    outsider.evict(ImmediateLoader, '/unowned-eviction.glb')

    function Subject() {
      const asset = useGuardedLoader(ImmediateLoader, '/unowned-eviction.glb')
      return <GuardedPrimitive object={asset.scene} />
    }

    const renderer = await ReactThreeTestRenderer.create(
      <R3FResourceCacheProvider cache={owner}>
        <Suspense fallback={null}>
          <Subject />
        </Suspense>
      </R3FResourceCacheProvider>,
    )

    await vi.waitFor(() => expect(ownerRegistry.snapshot().activeLeases).toBe(1))
    expect(ImmediateLoader.loaded).toHaveLength(1)

    await renderer.unmount()
    await Promise.resolve()
    owner.evict(ImmediateLoader, '/unowned-eviction.glb')
    expect(ImmediateLoader.loaded[0].textureDispose).toHaveBeenCalledOnce()
  })

  it('keeps a replacement owner intact after a stale repeated eviction', async () => {
    const first = createR3FResourceCache({
      registry: createResourceRegistry({ mode: 'dispose' }),
    })
    const secondRegistry = createResourceRegistry({ mode: 'dispose' })
    const second = createR3FResourceCache({ registry: secondRegistry })

    first.preload(ImmediateLoader, '/transferred-eviction.glb')
    await vi.waitFor(() => expect(first.snapshot().ready).toBe(1))
    first.evict(ImmediateLoader, '/transferred-eviction.glb')

    second.preload(ImmediateLoader, '/transferred-eviction.glb')
    await vi.waitFor(() => expect(second.snapshot().ready).toBe(1))
    expect(ImmediateLoader.loaded).toHaveLength(2)

    first.evict(ImmediateLoader, '/transferred-eviction.glb')

    function Subject() {
      const asset = useGuardedLoader(ImmediateLoader, '/transferred-eviction.glb')
      return <GuardedPrimitive object={asset.scene} />
    }

    const renderer = await ReactThreeTestRenderer.create(
      <R3FResourceCacheProvider cache={second}>
        <Suspense fallback={null}>
          <Subject />
        </Suspense>
      </R3FResourceCacheProvider>,
    )

    await vi.waitFor(() => expect(secondRegistry.snapshot().activeLeases).toBe(1))
    expect(ImmediateLoader.loaded).toHaveLength(2)

    await renderer.unmount()
    await Promise.resolve()
    second.evict(ImmediateLoader, '/transferred-eviction.glb')
    expect(ImmediateLoader.loaded[1].textureDispose).toHaveBeenCalledOnce()
  })

  it('borrows a guarded loader result for the mounted R3F consumer', async () => {
    const registry = createResourceRegistry({ mode: 'dispose' })
    const cache = createR3FResourceCache({ registry })

    function Subject() {
      const asset = useGuardedLoader(ImmediateLoader, '/mounted.glb')
      return <GuardedPrimitive object={asset.scene} />
    }

    const renderer = await ReactThreeTestRenderer.create(
      <R3FResourceCacheProvider cache={cache}>
        <Suspense fallback={null}>
          <Subject />
        </Suspense>
      </R3FResourceCacheProvider>,
    )

    await vi.waitFor(() => {
      expect(cache.snapshot().ready).toBe(1)
      expect(registry.snapshot().activeLeases).toBe(1)
    })
    expect(registry.snapshot().activeProtections).toBe(1)

    await renderer.unmount()
    await Promise.resolve()

    expect(registry.snapshot().activeLeases).toBe(0)
    expect(ImmediateLoader.loaded[0].textureDispose).not.toHaveBeenCalled()

    cache.evict(ImmediateLoader, '/mounted.glb')
    expect(ImmediateLoader.loaded[0].textureDispose).toHaveBeenCalledOnce()
  })
})

