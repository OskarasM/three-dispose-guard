import type { DisposableResource, ResourceKind, ResourceRoot } from './types'

type ThreeLike = Record<string, unknown> & {
  dispose?: () => void
  traverse?: (callback: (object: ThreeLike) => void) => void
}

const loaderResultKeys = [
  'scene',
  'scenes',
  'materials',
  'textures',
  'geometry',
  'geometries',
  'material',
  'skeleton',
] as const

function isObject(value: unknown): value is ThreeLike {
  return typeof value === 'object' && value !== null
}

export function resourceKind(value: unknown): ResourceKind | null {
  if (!isObject(value)) return null
  if (value.isWebGLRenderTarget === true) return 'renderTarget'
  if (value.isBufferGeometry === true) return 'geometry'
  if (value.isMaterial === true) return 'material'
  if (value.isTexture === true) return 'texture'
  if (value.isSkeleton === true) return 'skeleton'
  if (typeof value.dispose === 'function') return 'custom'
  return null
}

function isDisposableResource(value: unknown): value is DisposableResource {
  return resourceKind(value) !== null && typeof (value as ThreeLike).dispose === 'function'
}

function isObject3D(value: unknown): value is ThreeLike {
  return isObject(value) && value.isObject3D === true && typeof value.traverse === 'function'
}

function collectNestedMaterialValue(
  value: unknown,
  resources: Set<DisposableResource>,
  visited: WeakSet<object>,
): void {
  if (!isObject(value)) return

  if (isDisposableResource(value)) {
    collectResource(value, resources, visited)
    return
  }

  if (visited.has(value)) return
  visited.add(value)

  if (Array.isArray(value)) {
    value.forEach((entry) => collectNestedMaterialValue(entry, resources, visited))
    return
  }

  for (const nested of Object.values(value)) {
    collectNestedMaterialValue(nested, resources, visited)
  }
}

function collectMaterial(
  material: ThreeLike,
  resources: Set<DisposableResource>,
  visited: WeakSet<object>,
): void {
  if (visited.has(material)) return
  visited.add(material)
  resources.add(material as unknown as DisposableResource)

  for (const [key, value] of Object.entries(material)) {
    if (!isObject(value)) continue
    if (key === 'uniforms' || isDisposableResource(value) || Array.isArray(value) || 'value' in value) {
      collectNestedMaterialValue(value, resources, visited)
    }
  }
}

function collectObject3D(
  root: ThreeLike,
  resources: Set<DisposableResource>,
  visited: WeakSet<object>,
): void {
  root.traverse?.((object) => {
    if (visited.has(object)) return
    visited.add(object)

    collectResource(object.geometry, resources, visited)
    collectResource(object.material, resources, visited)
    collectResource(object.skeleton, resources, visited)

    if (object.isScene === true) {
      collectResource(object.background, resources, visited)
      collectResource(object.environment, resources, visited)
      collectResource(object.overrideMaterial, resources, visited)
    }
  })
}

function collectResource(
  value: unknown,
  resources: Set<DisposableResource>,
  visited: WeakSet<object>,
): void {
  if (!isObject(value)) return

  if (Array.isArray(value)) {
    if (visited.has(value)) return
    visited.add(value)
    value.forEach((entry) => collectResource(entry, resources, visited))
    return
  }

  if (isObject3D(value)) {
    collectObject3D(value, resources, visited)
    return
  }

  const kind = resourceKind(value)
  if (kind === 'material') {
    collectMaterial(value, resources, visited)
    return
  }

  if (kind) {
    if (!visited.has(value)) {
      visited.add(value)
      resources.add(value as unknown as DisposableResource)
    }
    // A render target owns its attachments, so its textures are not disposed twice.
    return
  }

  if (visited.has(value)) return
  visited.add(value)

  for (const key of loaderResultKeys) {
    if (key in value) collectResource(value[key], resources, visited)
  }
}

/**
 * Collects disposable Three.js resources from an Object3D, a material, a render
 * target, or the common shape returned by loaders such as GLTFLoader.
 */
export function collectDisposableResources(root: ResourceRoot): Set<DisposableResource> {
  const resources = new Set<DisposableResource>()
  collectResource(root, resources, new WeakSet<object>())
  return resources
}

export function countResourceKinds(
  resources: Iterable<DisposableResource>,
): Partial<Record<ResourceKind, number>> {
  const counts: Partial<Record<ResourceKind, number>> = {}
  for (const resource of resources) {
    const kind = resourceKind(resource)
    if (kind) counts[kind] = (counts[kind] ?? 0) + 1
  }
  return counts
}
