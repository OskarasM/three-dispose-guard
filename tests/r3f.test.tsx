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

beforeEach(() => {
  ImmediateLoader.loaded = []
  DeferredLoader.pending = []
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

