import { collectDisposableResources, countResourceKinds, resourceKind } from './resources'
import type {
  AcquireOptions,
  DiagnosticEvent,
  DisposableResource,
  ProtectOptions,
  RegistryListener,
  RegistrySnapshot,
  ResourceKind,
  ResourceLease,
  ResourceProtection,
  ResourceRegistryOptions,
  ResourceRoot,
} from './types'

interface ResourceRecord {
  resource: DisposableResource
  owners: number
  borrowers: number
  protections: number
  everOwned: boolean
}

interface HandleState {
  id: number
  label: string
  resources: Set<DisposableResource>
  released: boolean
}

const defaultLabel = 'unnamed scope'

export class ResourceRegistry {
  readonly mode: 'audit' | 'dispose'

  private readonly historyLimit: number
  private readonly onError?: ResourceRegistryOptions['onError']
  private readonly recordsByResource = new WeakMap<object, ResourceRecord>()
  private readonly records = new Set<ResourceRecord>()
  private readonly leases = new Map<number, HandleState & { ownership: 'owned' | 'borrowed' }>()
  private readonly protections = new Map<number, HandleState>()
  private readonly listeners = new Set<RegistryListener>()
  private readonly eventHistory: DiagnosticEvent[] = []
  private cachedSnapshot: RegistrySnapshot | undefined
  private nextId = 1
  private nextEventId = 1

  constructor(options: ResourceRegistryOptions = {}) {
    this.mode = options.mode ?? 'audit'
    this.historyLimit = Math.max(1, options.historyLimit ?? 100)
    this.onError = options.onError
  }

  acquire(root: ResourceRoot, options: AcquireOptions = {}): ResourceLease {
    const ownership = options.ownership ?? 'borrowed'
    const label = options.label ?? defaultLabel
    const resources = collectDisposableResources(root)
    const state: HandleState & { ownership: 'owned' | 'borrowed' } = {
      id: this.nextId++,
      label,
      ownership,
      resources,
      released: false,
    }

    for (const resource of resources) {
      const record = this.getOrCreateRecord(resource)
      if (ownership === 'owned') {
        record.owners += 1
        record.everOwned = true
      } else {
        record.borrowers += 1
      }
    }

    this.leases.set(state.id, state)
    this.recordEvent('acquired', state, { ownership })
    this.emit()
    return this.createHandle(state, () => this.releaseLease(state.id))
  }

  /**
   * Holds a cache or other external ownership anchor. Resources survive all
   * component releases until this protection is released as part of eviction.
   */
  protect(root: ResourceRoot, options: ProtectOptions = {}): ResourceProtection {
    const label = options.label ?? 'protected cache'
    const resources = collectDisposableResources(root)
    const state: HandleState = {
      id: this.nextId++,
      label,
      resources,
      released: false,
    }

    for (const resource of resources) {
      const record = this.getOrCreateRecord(resource)
      record.protections += 1
      record.everOwned = true
    }

    this.protections.set(state.id, state)
    this.recordEvent('protected', state)
    this.emit()
    return this.createHandle(state, () => this.releaseProtection(state.id))
  }

  snapshot(): RegistrySnapshot {
    if (this.cachedSnapshot) return this.cachedSnapshot

    const kinds: Partial<Record<ResourceKind, number>> = {}
    let protectedResources = 0
    let ownedResources = 0
    let borrowedResources = 0

    for (const record of this.records) {
      const kind = resourceKind(record.resource)
      if (kind) kinds[kind] = (kinds[kind] ?? 0) + 1
      if (record.protections > 0) protectedResources += 1
      if (record.owners > 0) ownedResources += 1
      if (record.borrowers > 0) borrowedResources += 1
    }

    this.cachedSnapshot = Object.freeze({
      mode: this.mode,
      activeLeases: this.leases.size,
      activeProtections: this.protections.size,
      trackedResources: this.records.size,
      protectedResources,
      ownedResources,
      borrowedResources,
      kinds: Object.freeze({ ...kinds }),
      events: Object.freeze([...this.eventHistory]),
    })
    return this.cachedSnapshot
  }

  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private getOrCreateRecord(resource: DisposableResource): ResourceRecord {
    const existing = this.recordsByResource.get(resource)
    if (existing) return existing

    const record: ResourceRecord = {
      resource,
      owners: 0,
      borrowers: 0,
      protections: 0,
      everOwned: false,
    }
    this.recordsByResource.set(resource, record)
    this.records.add(record)
    return record
  }

  private createHandle<T extends HandleState>(state: T, release: () => void): ResourceLease & ResourceProtection {
    return {
      id: state.id,
      label: state.label,
      resourceCount: state.resources.size,
      get released() {
        return state.released
      },
      release,
      [Symbol.dispose]: release,
    }
  }

  private releaseLease(id: number): void {
    const state = this.leases.get(id)
    if (!state || state.released) return
    state.released = true
    this.leases.delete(id)

    for (const resource of state.resources) {
      const record = this.recordsByResource.get(resource)
      if (!record) continue
      if (state.ownership === 'owned') record.owners = Math.max(0, record.owners - 1)
      else record.borrowers = Math.max(0, record.borrowers - 1)
      this.finaliseIfOrphaned(record, state, 'release')
    }

    this.recordEvent('released', state, { ownership: state.ownership })
    this.emit()
  }

  private releaseProtection(id: number): void {
    const state = this.protections.get(id)
    if (!state || state.released) return
    state.released = true
    this.protections.delete(id)

    for (const resource of state.resources) {
      const record = this.recordsByResource.get(resource)
      if (!record) continue
      record.protections = Math.max(0, record.protections - 1)
      this.finaliseIfOrphaned(record, state, 'protection')
    }

    this.recordEvent('unprotected', state)
    this.emit()
  }

  private finaliseIfOrphaned(
    record: ResourceRecord,
    source: HandleState,
    eventSource: 'release' | 'protection',
  ): void {
    if (record.owners > 0 || record.borrowers > 0 || record.protections > 0) return

    if (record.everOwned) {
      const type = this.mode === 'dispose' ? 'disposed' : 'would-dispose'
      this.recordEvent(type, {
        ...source,
        resources: new Set([record.resource]),
      }, { source: eventSource })

      if (this.mode === 'dispose') {
        try {
          record.resource.dispose()
        } catch (error) {
          this.onError?.(error, record.resource)
        }
      }
    }

    this.records.delete(record)
    this.recordsByResource.delete(record.resource)
  }

  private recordEvent(
    type: DiagnosticEvent['type'],
    state: HandleState,
    extra: Pick<DiagnosticEvent, 'ownership' | 'source'> = {},
  ): void {
    this.cachedSnapshot = undefined
    this.eventHistory.push(Object.freeze({
      id: this.nextEventId++,
      at: Date.now(),
      type,
      label: state.label,
      resourceCount: state.resources.size,
      kinds: Object.freeze(countResourceKinds(state.resources)),
      ...extra,
    }))

    if (this.eventHistory.length > this.historyLimit) {
      this.eventHistory.splice(0, this.eventHistory.length - this.historyLimit)
    }
  }

  private emit(): void {
    if (this.listeners.size === 0) return
    const snapshot = this.snapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}

export function createResourceRegistry(options?: ResourceRegistryOptions): ResourceRegistry {
  return new ResourceRegistry(options)
}
