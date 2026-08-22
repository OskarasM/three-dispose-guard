import { BoxGeometry, DataTexture, Mesh, MeshBasicMaterial, RGBAFormat } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createResourceRegistry } from '../src'

function sharedMesh() {
  const texture = new DataTexture(new Uint8Array([216, 255, 83, 255]), 1, 1, RGBAFormat)
  const geometry = new BoxGeometry()
  const material = new MeshBasicMaterial({ map: texture })
  return { texture, geometry, material, mesh: new Mesh(geometry, material) }
}

describe('ResourceRegistry ownership', () => {
  it('does not over-dispose when two owners share the same resource', () => {
    const { mesh, texture, geometry, material } = sharedMesh()
    const textureDispose = vi.spyOn(texture, 'dispose')
    const geometryDispose = vi.spyOn(geometry, 'dispose')
    const materialDispose = vi.spyOn(material, 'dispose')
    const registry = createResourceRegistry({ mode: 'dispose' })
    const first = registry.acquire(mesh, { ownership: 'owned', label: 'first' })
    const second = registry.acquire(mesh, { ownership: 'owned', label: 'second' })

    first.release()

    expect(textureDispose).not.toHaveBeenCalled()
    expect(geometryDispose).not.toHaveBeenCalled()
    expect(materialDispose).not.toHaveBeenCalled()
    expect(registry.snapshot().trackedResources).toBe(3)

    second.release()

    expect(textureDispose).toHaveBeenCalledOnce()
    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(materialDispose).toHaveBeenCalledOnce()
    expect(registry.snapshot().trackedResources).toBe(0)
  })

  it('never disposes a borrowed asset', () => {
    const { mesh, texture } = sharedMesh()
    const dispose = vi.spyOn(texture, 'dispose')
    const registry = createResourceRegistry({ mode: 'dispose' })

    registry.acquire(mesh, { ownership: 'borrowed' }).release()

    expect(dispose).not.toHaveBeenCalled()
    expect(registry.snapshot().trackedResources).toBe(0)
  })

  it('keeps a cached asset alive until its protection is explicitly released', () => {
    const { mesh, texture } = sharedMesh()
    const dispose = vi.spyOn(texture, 'dispose')
    const registry = createResourceRegistry({ mode: 'dispose' })
    const cache = registry.protect(mesh, { label: 'loader cache' })
    const component = registry.acquire(mesh, { ownership: 'owned', label: 'mounted model' })

    component.release()
    expect(dispose).not.toHaveBeenCalled()
    expect(registry.snapshot().protectedResources).toBe(3)

    cache.release()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('supports unmount and remount while a cache protection stays active', () => {
    const { mesh, texture } = sharedMesh()
    const dispose = vi.spyOn(texture, 'dispose')
    const registry = createResourceRegistry({ mode: 'dispose' })
    const cache = registry.protect(mesh)

    registry.acquire(mesh, { ownership: 'owned' }).release()
    const remount = registry.acquire(mesh, { ownership: 'owned' })
    expect(dispose).not.toHaveBeenCalled()

    remount.release()
    expect(dispose).not.toHaveBeenCalled()
    cache.release()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('reports candidates without disposing in the safe audit mode', () => {
    const { mesh, texture } = sharedMesh()
    const dispose = vi.spyOn(texture, 'dispose')
    const registry = createResourceRegistry()

    registry.acquire(mesh, { ownership: 'owned', label: 'preview' }).release()

    expect(dispose).not.toHaveBeenCalled()
    expect(registry.snapshot().events.filter((event) => event.type === 'would-dispose')).toHaveLength(3)
  })

  it('makes releases idempotent', () => {
    const { mesh, texture } = sharedMesh()
    const dispose = vi.spyOn(texture, 'dispose')
    const registry = createResourceRegistry({ mode: 'dispose' })
    const lease = registry.acquire(mesh, { ownership: 'owned' })

    lease.release()
    lease.release()
    lease[Symbol.dispose]()

    expect(dispose).toHaveBeenCalledOnce()
  })

  it('keeps tracked resources flat across a stress run', () => {
    const registry = createResourceRegistry({ mode: 'dispose', historyLimit: 8 })
    let textureDisposals = 0

    for (let cycle = 0; cycle < 1_000; cycle += 1) {
      const { mesh, texture } = sharedMesh()
      texture.addEventListener('dispose', () => { textureDisposals += 1 })
      registry.acquire(mesh, { ownership: 'owned' }).release()
      expect(registry.snapshot().trackedResources).toBe(0)
    }

    expect(textureDisposals).toBe(1_000)
    expect(registry.snapshot().events.length).toBeLessThanOrEqual(8)
  })
  it('reclaims a same-tick microtask release before disposal', async () => {
    const { mesh, texture } = sharedMesh()
    const dispose = vi.spyOn(texture, 'dispose')
    const registry = createResourceRegistry({ mode: 'dispose' })
    const first = registry.acquire(mesh, {
      ownership: 'owned',
      releasePolicy: 'microtask',
      label: 'strict-mode first pass',
    })

    first.release()
    expect(registry.snapshot().pendingDisposals).toBe(3)

    const remount = registry.acquire(mesh, {
      ownership: 'owned',
      releasePolicy: 'microtask',
      label: 'strict-mode remount',
    })
    await Promise.resolve()

    expect(dispose).not.toHaveBeenCalled()
    expect(registry.snapshot().pendingDisposals).toBe(0)
    expect(registry.snapshot().events.some((event) => event.type === 'disposal-cancelled')).toBe(true)

    remount.release()
    await Promise.resolve()

    expect(dispose).toHaveBeenCalledOnce()
    expect(registry.snapshot().trackedResources).toBe(0)
  })

  it('lets a protection reclaim a pending microtask disposal', async () => {
    const { mesh, texture } = sharedMesh()
    const dispose = vi.spyOn(texture, 'dispose')
    const registry = createResourceRegistry({ mode: 'dispose' })
    const lease = registry.acquire(mesh, {
      ownership: 'owned',
      releasePolicy: 'microtask',
      label: 'component cleanup',
    })

    lease.release()
    expect(registry.snapshot().pendingDisposals).toBe(3)

    const protection = registry.protect(mesh, { label: 'cache hand-off' })

    expect(registry.snapshot().pendingDisposals).toBe(0)
    expect(registry.snapshot().events).toContainEqual(expect.objectContaining({
      type: 'disposal-cancelled',
      label: 'cache hand-off',
      resourceCount: 3,
    }))

    await Promise.resolve()
    expect(dispose).not.toHaveBeenCalled()

    protection.release()
    expect(dispose).toHaveBeenCalledOnce()
    expect(registry.snapshot().trackedResources).toBe(0)
  })

  it('deeply freezes diagnostic scope records', () => {
    const { mesh } = sharedMesh()
    const registry = createResourceRegistry()
    const lease = registry.acquire(mesh, { ownership: 'owned', label: 'immutable scope' })
    const snapshot = registry.snapshot()
    const scope = snapshot.scopes[0]

    expect(Object.isFrozen(scope)).toBe(true)
    expect(() => {
      ;(scope as { label: string }).label = 'mutated'
    }).toThrow()
    expect(registry.snapshot().scopes[0].label).toBe('immutable scope')

    lease.release()
  })


  it('extends collection for application-specific resource containers', () => {
    const pass = { dispose: vi.fn() }
    const root = { postProcessingPass: pass }
    const registry = createResourceRegistry({
      mode: 'dispose',
      collectors: [
        (candidate) => candidate === root ? [pass] : [],
      ],
    })

    const lease = registry.acquire(root, { ownership: 'owned', label: 'composer pass' })

    expect(registry.snapshot().kinds).toEqual({ custom: 1 })
    expect(registry.snapshot().scopes).toEqual([{
      id: lease.id,
      type: 'lease',
      label: 'composer pass',
      ownership: 'owned',
      resourceCount: 1,
    }])

    lease.release()
    expect(pass.dispose).toHaveBeenCalledOnce()
  })

  it('reports disposal failures and continues cleanup', () => {
    const onError = vi.fn(() => {
      throw new Error('diagnostic callback failed')
    })
    const failing = {
      dispose: vi.fn(() => {
        throw new Error('driver refused cleanup')
      }),
    }
    const healthy = { dispose: vi.fn() }
    const registry = createResourceRegistry({ mode: 'dispose', onError })
    const lease = registry.acquire([failing, healthy], { ownership: 'owned' })

    expect(() => lease.release()).not.toThrow()

    expect(failing.dispose).toHaveBeenCalledOnce()
    expect(healthy.dispose).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
    expect(registry.snapshot().events).toContainEqual(expect.objectContaining({
      type: 'dispose-error',
      message: 'driver refused cleanup',
      kinds: { custom: 1 },
    }))
  })
})
