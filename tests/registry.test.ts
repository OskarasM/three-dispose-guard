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
})
