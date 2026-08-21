import {
  useLoader,
  type ConstructorRepresentation,
  type Extensions,
  type LoaderResult,
  type ThreeElements,
} from '@react-three/fiber'
import {
  createContext,
  type PropsWithChildren,
  useContext,
} from 'react'
import type { Loader } from 'three'
import { ResourceRegistry } from './registry'
import { useResourceLease } from './react'
import type {
  ResourceProtection,
  ResourceRoot,
} from './types'

export type GuardedLoaderInput =
  | string
  | string[]
  | string[][]
  | Readonly<string | string[] | string[][]>

type LoaderLike = Loader<any, GuardedLoaderInput>
type LoaderRepresentation = LoaderLike | ConstructorRepresentation<LoaderLike>
type EntryStatus = 'loading' | 'ready' | 'error' | 'evicted'

interface CacheEntry {
  loader: LoaderRepresentation
  input: GuardedLoaderInput
  key: string
  generation: number
  partKeys: Set<string>
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
    extensions?: Extensions<L>,
  ): void
  evict<I extends GuardedLoaderInput, L extends LoaderRepresentation>(loader: L, input: I): void
  clear(): void
  snapshot(): R3FCacheSnapshot
  subscribe(listener: R3FCacheListener): () => void
}

interface LoaderObserver {
  capture(input: unknown): CacheEntry[]
  resolve(entry: CacheEntry, result: unknown): void
  reject(entry: CacheEntry, error: unknown): void
}

interface LoaderInstrumentation {
  observers: Map<R3FResourceCacheImpl, Map<LoaderRepresentation, LoaderObserver>>
}

const instrumentedLoaders = new WeakMap<object, LoaderInstrumentation>()
const cacheClaims = new WeakMap<object, Map<string, R3FResourceCacheImpl>>()
const internalCache = Symbol('three-dispose-guard.r3f-cache')

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
  representation: LoaderRepresentation,
  cache: R3FResourceCacheImpl,
  observer: LoaderObserver,
): void {
  let instrumentation = instrumentedLoaders.get(loader)
  if (!instrumentation) {
    const originalLoad = loader.load.bind(loader) as (...args: any[]) => unknown
    instrumentation = { observers: new Map() }
    const sharedInstrumentation = instrumentation

    loader.load = ((input: unknown, onLoad: (result: unknown) => void, onProgress?: unknown, onError?: (error: unknown) => void) => {
      const targets = [...sharedInstrumentation.observers.values()].flatMap((representations) =>
        [...representations.values()].flatMap((candidate) =>
          candidate.capture(input).map((entry) => ({ observer: candidate, entry })),
        ),
      )

      return originalLoad(
        input,
        (result: unknown) => {
          for (const target of targets) target.observer.resolve(target.entry, result)
          onLoad(result)
        },
        onProgress,
        (error: unknown) => {
          for (const target of targets) target.observer.reject(target.entry, error)
          onError?.(error)
        },
      )
    }) as typeof loader.load

    instrumentedLoaders.set(loader, instrumentation)
  }

  let representations = instrumentation.observers.get(cache)
  if (!representations) {
    representations = new Map()
    instrumentation.observers.set(cache, representations)
  }
  representations.set(representation, observer)
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
    extensions?: Extensions<L>,
  ): void {
    this.prepare(loader, input)
    useLoader.preload(loader, input, this.composeExtensions(loader, extensions))
  }

  evict<I extends GuardedLoaderInput, L extends LoaderRepresentation>(loader: L, input: I): void {
    useLoader.clear(loader, input)
    const key = requestKey(input)
    const entries = this.entries.get(loader)
    const entry = entries?.get(key)
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

  prepare<I extends GuardedLoaderInput, L extends LoaderRepresentation>(loader: L, input: I): void {
    const key = requestKey(input)
    let entries = this.entries.get(loader)
    if (!entries) {
      entries = new Map()
      this.entries.set(loader, entries)
    }
    if (entries.has(key)) return

    this.claim(loader, key)
    const parts = inputParts(input)
    entries.set(key, {
      loader,
      input,
      key,
      generation: this.generation++,
      partKeys: new Set(parts.map(inputKey)),
      expectedParts: parts.length,
      resolvedParts: 0,
      resolvedRoots: new Set(),
      protections: [],
      status: parts.length === 0 ? 'ready' : 'loading',
    })
    this.emit()
  }

  composeExtensions<L extends LoaderRepresentation>(
    representation: L,
    extensions?: Extensions<L>,
  ): Extensions<L> {
    return (loader) => {
      extensions?.(loader)
      instrumentLoader(loader, representation, this, {
        capture: (input) => this.capture(representation, input),
        resolve: (entry, result) => this.resolve(entry, result),
        reject: (entry, error) => this.reject(entry, error),
      })
    }
  }

  private capture(loader: LoaderRepresentation, input: unknown): CacheEntry[] {
    const key = inputKey(input)
    return [...(this.entries.get(loader)?.values() ?? [])].filter(
      (entry) => entry.status === 'loading' && entry.partKeys.has(key),
    )
  }

  private resolve(entry: CacheEntry, result: unknown): void {
    const current = this.entries.get(entry.loader)?.get(entry.key)
    if (current !== entry || entry.status === 'evicted') {
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

  private reject(entry: CacheEntry, error: unknown): void {
    const current = this.entries.get(entry.loader)?.get(entry.key)
    if (current !== entry || entry.status === 'evicted') return
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
  extensions?: Extensions<L>,
  onProgress?: (event: ProgressEvent<EventTarget>) => void,
): I extends any[] ? LoaderResult<L>[] : LoaderResult<L> {
  const cache = asInternalCache(useR3FResourceCache())
  cache.prepare(loader, input)
  const result = useLoader(
    loader,
    input,
    cache.composeExtensions(loader, extensions),
    onProgress,
  )

  useResourceLease(result as ResourceRoot, {
    registry: cache.registry,
    ownership: 'borrowed',
    releasePolicy: 'microtask',
    label: `R3F consumer: ${inputLabel(input)}`,
  })
  return result
}

export type GuardedPrimitiveProps = Omit<ThreeElements['primitive'], 'dispose'>

export function GuardedPrimitive({ object, ...props }: GuardedPrimitiveProps) {
  return <primitive {...props} object={object} dispose={null} />
}

