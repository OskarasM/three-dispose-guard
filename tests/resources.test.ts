import {
  BoxGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  RGBAFormat,
  ShaderMaterial,
  WebGLRenderTarget,
} from 'three'
import { describe, expect, it } from 'vitest'
import { collectDisposableResources, countResourceKinds } from '../src'

function texture(): DataTexture {
  const map = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat)
  map.needsUpdate = true
  return map
}

describe('collectDisposableResources', () => {
  it('deduplicates resources shared across an Object3D tree', () => {
    const geometry = new BoxGeometry()
    const map = texture()
    const material = new MeshBasicMaterial({ map })
    const group = new Group()
    group.add(new Mesh(geometry, material), new Mesh(geometry, material))

    const resources = collectDisposableResources(group)

    expect(resources.size).toBe(3)
    expect(countResourceKinds(resources)).toEqual({ geometry: 1, material: 1, texture: 1 })
  })

  it('finds textures nested inside shader uniforms and arrays', () => {
    const primary = texture()
    const secondary = texture()
    const material = new ShaderMaterial({
      uniforms: {
        primary: { value: primary },
        layers: { value: [secondary, { duplicate: primary }] },
      },
    })

    const resources = collectDisposableResources(material)

    expect(resources).toEqual(new Set([material, primary, secondary]))
  })

  it('collects common loader-result shapes without traversing arbitrary metadata', () => {
    const geometry = new BoxGeometry()
    const material = new MeshBasicMaterial()
    const scene = new Group()
    scene.add(new Mesh(geometry, material))
    const result = { scene, animations: [{ metadata: 'ignored' }] }

    expect(collectDisposableResources(result)).toEqual(new Set([geometry, material]))
  })

  it('treats a render target as the owner of its attachments', () => {
    const target = new WebGLRenderTarget(16, 16)
    const resources = collectDisposableResources(target)

    expect(resources).toEqual(new Set([target]))
  })
})
