# API reference

## Core entry point

Import from `three-dispose-guard`. The core has no React or R3F dependency.

### `createResourceRegistry(options?)`

Creates a `ResourceRegistry`.

```ts
const registry = createResourceRegistry({
  mode: 'audit',
  historyLimit: 100,
  collectors: [],
  onError(error, resource) {},
})
```

- `mode` defaults to `audit`. Audit records `would-dispose` without calling `dispose()`.
- `historyLimit` defaults to 100 immutable diagnostic events.
- `collectors` extend the built-in Three.js traversal.
- `onError` receives a disposal exception after a `dispose-error` event is recorded.

### `registry.acquire(root, options?)`

Returns an idempotent `ResourceLease`.

```ts
const lease = registry.acquire(root, {
  ownership: 'owned',
  label: 'hero model',
  releasePolicy: 'immediate',
})

lease.release()
lease[Symbol.dispose]()
```

- `owned` makes collected resources eligible for final disposal.
- `borrowed` records a user but never creates ownership.
- `immediate` finalises an orphan during `release()`.
- `microtask` schedules finalisation. A same-tick acquire cancels the pending disposal.

Calling `release()` more than once has no effect.

### `registry.protect(root, options?)`

Returns an idempotent `ResourceProtection`. Protection is an explicit cache, pool or external ownership anchor. Releasing the final protection permits disposal only when no owners or borrowers remain.

### `registry.snapshot()`

Returns the same frozen object until registry state changes.

```ts
interface RegistrySnapshot {
  mode: 'audit' | 'dispose'
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
```

`ResourceKind` is `geometry`, `material`, `texture`, `renderTarget`, `skeleton` or `custom`.

### `registry.subscribe(listener)`

Registers a snapshot listener and returns an unsubscribe function. Listeners run after a state transition has completed.

### `registry.flush()`

Synchronously processes resources waiting under `releasePolicy: 'microtask'`. Tests and controlled shutdown paths can use it when awaiting the queued microtask is inconvenient.

### Collection functions

`collectDisposableResources(root)` returns a deduplicated `Set`. `countResourceKinds(resources)` produces exact kind counts. `resourceKind(value)` identifies supported resources.

The built-in collector covers:

- Object3D descendants and material arrays
- Scene background, environment and override material
- Texture-valued material fields and nested uniforms
- Skeletons and render targets
- Common loader result fields such as `scene`, `scenes`, `materials` and `textures`

A render target owns its attachments and is collected as one disposal unit.

## React entry point

Import from `three-dispose-guard/react`.

### `ResourceRegistryProvider`

Accepts either a supplied `registry` or `options` used to create one. A supplied registry takes precedence.

### `useResourceLease(root, options?)`

Acquires after commit and releases during effect cleanup. Its default release policy is `microtask`. Pass `registry` directly or use a provider.

### `useResourceSnapshot(registry?)`

Uses `useSyncExternalStore` and supports server rendering through the same immutable snapshot.

### `useResourceRegistry()`

Returns the context registry or throws a clear error when no provider exists.

## R3F entry point

Import from `three-dispose-guard/r3f`. It requires React and `@react-three/fiber` as optional peers.

### `createR3FResourceCache({ registry })`

Returns one coordinator for one R3F loader-cache ownership domain.

Methods:

- `preload(loader, input, extensions?)`
- `evict(loader, input)`
- `clear()`
- `snapshot()`
- `subscribe(listener)`

A loader/input pair cannot be claimed by two different guards because R3F's underlying loader cache is global for that key.

### `useGuardedLoader(loader, input, extensions?, onProgress?)`

Mirrors the R3F `useLoader` signature and return type. It registers a cache entry before suspension, protects resolved results and acquires a borrowed component lease after commit.

### `GuardedPrimitive`

Accepts R3F primitive props except `dispose`. It always renders with `dispose={null}` so the registry remains the only disposal authority for that primitive.

### `R3FResourceCacheProvider` and `useR3FResourceCache`

Supply and read the guard through React context.
