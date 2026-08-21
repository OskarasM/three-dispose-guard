import type {
  BufferGeometry,
  Material,
  Object3D,
  Skeleton,
  Texture,
  WebGLRenderTarget,
} from 'three'

export type DisposableResource = BufferGeometry | Material | Texture | WebGLRenderTarget | Skeleton

export type ResourceRoot =
  | DisposableResource
  | Object3D
  | ResourceRoot[]
  | Record<string, unknown>

export type ResourceKind = 'geometry' | 'material' | 'texture' | 'renderTarget' | 'skeleton'

export type RegistryMode = 'audit' | 'dispose'

export type Ownership = 'owned' | 'borrowed'

export interface AcquireOptions {
  /**
   * `owned` makes the resource eligible for disposal after its final user and
   * protection are released. `borrowed` records usage but never claims ownership.
   */
  ownership?: Ownership
  label?: string
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

export interface DiagnosticEvent {
  id: number
  at: number
  type: DiagnosticEventType
  label: string
  ownership?: Ownership
  resourceCount: number
  kinds: Partial<Record<ResourceKind, number>>
  source?: 'release' | 'protection'
}

export interface RegistrySnapshot {
  mode: RegistryMode
  activeLeases: number
  activeProtections: number
  trackedResources: number
  protectedResources: number
  ownedResources: number
  borrowedResources: number
  kinds: Partial<Record<ResourceKind, number>>
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
}

export type RegistryListener = (snapshot: RegistrySnapshot) => void
