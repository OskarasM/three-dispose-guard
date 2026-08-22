import {
  useLoader,
  type ThreeElements,
} from '@react-three/fiber'
import {
  createContext,
  createElement,
  type PropsWithChildren,
  useContext,
} from 'react'
import type { Loader, Object3D } from 'three'
import { ResourceRegistry } from './registry'
import { useResourceLease } from './react'
import type {
  ResourceProtection,
  ResourceRoot,
} from './types'

export type GuardedLoaderInput = string | string[]
export type GuardedLoaderConstructor<T = unknown> = new (...args: any[]) => Loader<T, any>

type LoaderLike = Loader<any, any>
type LoaderRepresentation = LoaderLike | GuardedLoaderConstructor<any>
type GuardedLoaderInstance<L extends LoaderRepresentation> =
  L extends GuardedLoaderConstructor<any> ? InstanceType<L> : L
export type GuardedLoaderExtensions<L extends LoaderRepresentation> =
  (loader: GuardedLoaderInstance<L>) => void
type RawGuardedLoaderResult<L extends LoaderRepresentation> =
  Awaited<ReturnType<GuardedLoaderInstance<L>['loadAsync']>>
export type GuardedLoaderResult<L extends LoaderRepresentation> =
  RawGuardedLoaderResult<L> extends { scene: Object3D }
    ? RawGuardedLoaderResult<L> & import('@react-three/fiber').ObjectMap
    : RawGuardedLoaderResult<L>
export type GuardedLoaderReturn<L extends LoaderRepresentation, I extends GuardedLoaderInput> =
  I extends any[] ? GuardedLoaderResult<L>[] : GuardedLoaderResult<L>
type EntryStatus = 'loading' | 'ready' | 'error' | 'evicted'

interface CacheEntry {
  loader: LoaderRepresentation
  r3fLoader: GuardedLoaderConstructor<any>
  input: GuardedLoaderInput
  key: string
  generation: number
  expectedParts: number
  resolvedParts: number
  resolvedRoots: Set<unknown>
  protections: ResourceProtection[]
  status: EntryStatus
  error?: string
}

export interface R3FCacheEntrySnapshot {
  key: string
  input: string
  status: EntryStatus
  resources: number
  resolvedParts: number
  expectedParts: number
  error?: string
}

export interface R3FCacheSnapshot {
  entries: readonly R3FCacheEntrySnapshot[]
  loading: number
  ready: number
  errors: number
}

export type R3FCacheListener = (snapshot: R3FCacheSnapshot) => void

export interface R3FResourceCache {
  readonly registry: ResourceRegistry
  preload<I extends GuardedLoaderInput, L extends LoaderRepresentation>(
    loader: L,
    input: I,
    extensions?: GuardedLoaderExtensions<L>,
  ): void
  evict<I extends GuardedLoaderInput, L extends LoaderRepresentation>(loader: L, input: I): void
  clear(): void
  snapshot(): R3FCacheSnapshot
  subscribe(listener: R3FCacheListener): () => void
}

interface InstrumentedRequest {
  entry: CacheEntry
  generation: number
  parts: unknown[]
  nextPart: number
  resolve(result: unknown): void
  reject(error: unknown): void
}

interface LoaderInstrumentation {
  requests: InstrumentedRequest[]
}

const instrumentedLoaders = new WeakMap<object, LoaderInstrumentation>()
const instanceRepresentations = new WeakMap<LoaderLike, GuardedLoaderConstructor<any>>()
const cacheClaims = new WeakMap<object, Map<string, R3FResourceCacheImpl>>()
const internalCache = Symbol('three-dispose-guard.r3f-cache')

function r3fLoaderRepresentation(
  loader: LoaderRepresentation,
): GuardedLoaderConstructor<any> {
  if (typeof loader === 'function') return loader

  let representation = instanceRepresentations.get(loader)
  if (!representation) {
    const sharedLoader = loader
    representation = function GuardedLoaderRepresentation() {
      return sharedLoader
    } as unknown as GuardedLoaderConstructor<any>
    instanceRepresentations.set(loader, representation)
  }
  return representation
}

function inputParts(input: GuardedLoaderInput): unknown[] {
  return Array.isArray(input) ? [...input] : [input]
}

function inputKey(input: unknown): string {
  return typeof input === 'string' ? input : JSON.stringify(input)
}

function requestKey(input: GuardedLoaderInput): string {
  return JSON.stringify(input)
}

function inputLabel(input: GuardedLoaderInput): string {
  return inputParts(input).map(inputKey).join(', ')
}

function instrumentLoader(
  loader: LoaderLike,
  request: InstrumentedRequest,
): void {
  let instrumentation = instrumentedLoaders.get(loader)
  if (!instrumentation) {
    const originalLoad = loader.load.bind(loader) as (...args: any[]) => unknown
    instrumentation = { requests: [] }
    const sharedInstrumentation = instrumentation

    loader.load = ((input: unknown, onLoad: (result: unknown) => void, onProgress?: unknown, onError?: (error: unknown) => void) => {
      const partKey = inputKey(input)
      const requestIndex = sharedInstrumentation.requests.findIndex(
        (candidate) => inputKey(candidate.parts[candidate.nextPart]) === partKey,
      )
      const matched = requestIndex === -1
        ? undefined
        : sharedInstrumentation.requests[requestIndex]

      if (matched) {
        matched.nextPart += 1
        if (matched.nextPart >= matched.parts.length) {
          sharedInstrumentation.requests.splice(requestIndex, 1)
        }
      }

      return originalLoad(
        input,
        (result: unknown) => {
          matched?.resolve(result)
          onLoad(result)
        },
        onProgress,
        (error: unknown) => {
          matched?.reject(error)
          onError?.(error)
        },
      )
    }) as typeof loader.load

    instrumentedLoaders.set(loader, instrumentation)
  }

  if (request.parts.length > 0) instrumentation.requests.push(request)
}

class R3FResourceCacheImpl implements R3FResourceCache {
  readonly [internalCache] = true
  readonly registry: ResourceRegistry

  private readonly entries = new Map<LoaderRepresentation, Map<string, CacheEntry>>()
  private readonly listeners = new Set<R3FCacheListener>()
  private generation = 1
  private cachedSnapshot: R3FCacheSnapshot | undefined

  constructor(registry: ResourceRegistry) {
    this.registry = registry
  }

  preload<I extends GuardedLoaderInput, L extends LoaderRepresentation>(
    loader: L,
    input: I,
    extensions?: GuardedLoaderExtensions<L>,
  ): void {
    const entry = this.prepare(loader, input)
    useLoader.preload(
      entry.r3fLoader,
      input,
      this.composeExtensions<L>(entry, extensions),
    )
  }

  evict<I extends GuardedLoaderInput, L extends LoaderRepresentation>(loader: L, input: I): void {
    const key = requestKey(input)
    const entries = this.entries.get(loader)
    const entry = entries?.get(key)
    useLoader.clear(entry?.r3fLoader ?? r3fLoaderRepresentation(loader), input)
    if (!entry) return

    entry.status = 'evicted'
    entries?.delete(key)
    if (entries?.size === 0) this.entries.delete(loader)
    this.releaseClaim(loader, key)
    for (const protection of entry.protections) protection.release()
    this.emit()
  }

  clear(): void {
    const entries = [...this.entries.values()].flatMap((group) => [...group.values()])
    for (const entry of entries) this.evict(entry.loader, entry.input)
  }

  snapshot(): R3FCacheSnapshot {
    if (this.cachedSnapshot) return this.cachedSnapshot
    const entries = [...this.entries.values()]
      .flatMap((group) => [...group.values()])
      .map((entry): R3FCacheEntrySnapshot => Object.freeze({
        key: entry.key,
        input: inputLabel(entry.input),
        status: entry.status,
        resources: entry.protections.reduce((total, protection) => total + protection.resourceCount, 0),
        resolvedParts: entry.resolvedParts,
        expectedParts: entry.expectedParts,
        error: entry.error,
      }))
      .sort((first, second) => first.input.localeCompare(second.input))

    this.cachedSnapshot = Object.freeze({
      entries: Object.freeze(entries),
      loading: entries.filter((entry) => entry.status === 'loading').length,
      ready: entries.filter((entry) => entry.status === 'ready').length,
      errors: entries.filter((entry) => entry.status === 'error').length,
    })
    return this.cachedSnapshot
  }

  subscribe(listener: R3FCacheListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  prepare<I extends GuardedLoaderInput, L extends LoaderRepresentation>(
    loader: L,
    input: I,
  ): CacheEntry {
    const key = requestKey(input)
    let entries = this.entries.get(loader)
    if (!entries) {
      entries = new Map()
      this.entries.set(loader, entries)
    }
    const existing = entries.get(key)
    if (existing) {
      if (existing.status !== 'error') return existing
      entries.delete(key)
      this.releaseClaim(loader, key)
    }

    this.claim(loader, key)
    const parts = inputParts(input)
    const entry: CacheEntry = {
      loader,
      r3fLoader: r3fLoaderRepresentation(loader),
      input,
      key,
      generation: this.generation++,
      expectedParts: parts.length,
      resolvedParts: 0,
      resolvedRoots: new Set(),
      protections: [],
      status: parts.length === 0 ? 'ready' : 'loading',
    }
    entries.set(key, entry)
    this.emit()
    return entry
  }

  composeExtensions<L extends LoaderRepresentation>(
    entry: CacheEntry,
    extensions?: GuardedLoaderExtensions<L>,
  ): (loader: LoaderLike) => void {
    return (loader) => {
      extensions?.(loader as GuardedLoaderInstance<L>)
      const generation = entry.generation
      instrumentLoader(loader, {
        entry,
        generation,
        parts: inputParts(entry.input),
        nextPart: 0,
        resolve: (result) => this.resolve(entry, generation, result),
        reject: (error) => this.reject(entry, generation, error),
      })
    }
  }

  private resolve(entry: CacheEntry, generation: number, result: unknown): void {
    const current = this.entries.get(entry.loader)?.get(entry.key)
    if (
      generation !== entry.generation
      || current !== entry
      || entry.status !== 'loading'
    ) {
      const stale = this.registry.acquire(result as ResourceRoot, {
        ownership: 'owned',
        releasePolicy: 'microtask',
        label: `stale loader result: ${inputLabel(entry.input)}`,
      })
      stale.release()
      return
    }

    entry.resolvedParts = Math.min(entry.expectedParts, entry.resolvedParts + 1)
    if (!entry.resolvedRoots.has(result)) {
      entry.resolvedRoots.add(result)
      entry.protections.push(this.registry.protect(result as ResourceRoot, {
        label: `R3F cache: ${inputLabel(entry.input)}`,
      }))
    }
    if (entry.resolvedParts >= entry.expectedParts) entry.status = 'ready'
    this.emit()
  }

  private reject(entry: CacheEntry, generation: number, error: unknown): void {
    const current = this.entries.get(entry.loader)?.get(entry.key)
    if (
      generation !== entry.generation
      || current !== entry
      || entry.status === 'evicted'
    ) return
    useLoader.clear(entry.r3fLoader, entry.input)
    for (const protection of entry.protections.splice(0)) protection.release()

    entry.status = 'error'
    entry.error = error instanceof Error ? error.message : String(error)
    this.emit()
  }

  private claim(loader: LoaderRepresentation, key: string): void {
    const claimKey = loader as object
    let claims = cacheClaims.get(claimKey)
    if (!claims) {
      claims = new Map()
      cacheClaims.set(claimKey, claims)
    }
    const owner = claims.get(key)
    if (owner && owner !== this) {
      throw new Error(
        'This R3F loader cache entry is already guarded by another registry. Share one R3FResourceCache.',
      )
    }
    claims.set(key, this)
  }

  private releaseClaim(loader: LoaderRepresentation, key: string): void {
    const claimKey = loader as object
    const claims = cacheClaims.get(claimKey)
    claims?.delete(key)
    if (claims?.size === 0) cacheClaims.delete(claimKey)
  }

  private emit(): void {
    this.cachedSnapshot = undefined
    if (this.listeners.size === 0) return
    const snapshot = this.snapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}

export interface CreateR3FResourceCacheOptions {
  registry: ResourceRegistry
}

export function createR3FResourceCache({
  registry,
}: CreateR3FResourceCacheOptions): R3FResourceCache {
  return new R3FResourceCacheImpl(registry)
}

const R3FResourceCacheContext = createContext<R3FResourceCache | null>(null)

export interface R3FResourceCacheProviderProps extends PropsWithChildren {
  cache: R3FResourceCache
}

export function R3FResourceCacheProvider({
  cache,
  children,
}: R3FResourceCacheProviderProps) {
  return (
    <R3FResourceCacheContext.Provider value={cache}>
      {children}
    </R3FResourceCacheContext.Provider>
  )
}

export function useR3FResourceCache(): R3FResourceCache {
  const cache = useContext(R3FResourceCacheContext)
  if (!cache) {
    throw new Error('useR3FResourceCache must be used inside R3FResourceCacheProvider')
  }
  return cache
}

function asInternalCache(cache: R3FResourceCache): R3FResourceCacheImpl {
  if (!(internalCache in cache)) {
    throw new Error('Use createR3FResourceCache to create the cache supplied to the provider')
  }
  return cache as R3FResourceCacheImpl
}

export function useGuardedLoader<
  I extends GuardedLoaderInput,
  L extends LoaderRepresentation,
>(
  loader: L,
  input: I,
  extensions?: GuardedLoaderExtensions<L>,
  onProgress?: (event: ProgressEvent<EventTarget>) => void,
): GuardedLoaderReturn<L, I> {
  const cache = asInternalCache(useR3FResourceCache())
  const entry = cache.prepare(loader, input)
  const result = useLoader(
    entry.r3fLoader,
    input,
    cache.composeExtensions<L>(entry, extensions),
    onProgress,
  )

  useResourceLease(result as ResourceRoot, {
    registry: cache.registry,
    ownership: 'borrowed',
    releasePolicy: 'microtask',
    label: `R3F consumer: ${inputLabel(input)}`,
  })
  return result as GuardedLoaderReturn<L, I>
}

export type GuardedPrimitiveProps = Omit<ThreeElements['primitive'], 'dispose'>

export function GuardedPrimitive({ object, ...props }: GuardedPrimitiveProps) {
  return createElement('primitive' as any, { ...props, object, dispose: null })
}

