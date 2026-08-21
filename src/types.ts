import type {
  BufferGeometry,
  Material,
  Object3D,
  Skeleton,
  Texture,
  WebGLRenderTarget,
} from 'three'

export interface CustomDisposableResource {
  dispose(): void
}

export type DisposableResource =
  | BufferGeometry
  | Material
  | Texture
  | WebGLRenderTarget
  | Skeleton
  | CustomDisposableResource

export type ResourceRoot =
  | DisposableResource
  | Object3D
  | ResourceRoot[]
  | Record<string, unknown>

export type ResourceKind =
  | 'geometry'
  | 'material'
  | 'texture'
  | 'renderTarget'
  | 'skeleton'
  | 'custom'

export type RegistryMode = 'audit' | 'dispose'

export type Ownership = 'owned' | 'borrowed'

export type ReleasePolicy = 'immediate' | 'microtask'

export interface AcquireOptions {
  /**
   * `owned` makes the resource eligible for disposal after its final user and
   * protection are released. `borrowed` records usage but never claims ownership.
   */
  ownership?: Ownership
  label?: string
  /**
   * Imperative leases release immediately by default. React helpers opt into a
   * microtask so development Strict Mode can reclaim a same-tick remount.
   */
  releasePolicy?: ReleasePolicy
}

export interface ProtectOptions {
  label?: string
}

export type DiagnosticEventType =
  | 'acquired'
  | 'released'
  | 'protected'
  | 'unprotected'
  | 'disposed'
  | 'would-dispose'
  | 'disposal-scheduled'
  | 'disposal-cancelled'
  | 'dispose-error'
export interface DiagnosticEvent {
  id: number
  at: number
  type: DiagnosticEventType
  label: string
  ownership?: Ownership
  resourceCount: number
  kinds: Partial<Record<ResourceKind, number>>
  source?: 'release' | 'protection'
  message?: string
}


export interface RegistryScopeSnapshot {
  id: number
  type: 'lease' | 'protection'
  label: string
  ownership?: Ownership
  resourceCount: number
}

export interface RegistrySnapshot {
  mode: RegistryMode
  activeLeases: number
  activeProtections: number
  pendingDisposals: number
  trackedResources: number
  protectedResources: number
  ownedResources: number
  borrowedResources: number
  kinds: Partial<Record<ResourceKind, number>>
  scopes: readonly RegistryScopeSnapshot[]
  events: readonly DiagnosticEvent[]
}

export interface ResourceLease {
  readonly id: number
  readonly label: string
  readonly resourceCount: number
  readonly released: boolean
  release(): void
  [Symbol.dispose](): void
}

export interface ResourceProtection {
  readonly id: number
  readonly label: string
  readonly resourceCount: number
  readonly released: boolean
  release(): void
  [Symbol.dispose](): void
}

export interface ResourceRegistryOptions {
  /** Safe default: report what would be disposed without mutating GPU resources. */
  mode?: RegistryMode
  /** Number of immutable diagnostic events retained for the development UI. */
  historyLimit?: number
  /** Receives disposal errors without interrupting the remaining cleanup. */
  onError?: (error: unknown, resource: DisposableResource) => void
  /** Adds application-specific resources without replacing the built-in collector. */
  collectors?: readonly ResourceCollector[]
}

export type RegistryListener = (snapshot: RegistrySnapshot) => void

export type ResourceCollector = (
  root: ResourceRoot,
) => Iterable<DisposableResource> | null | undefined
