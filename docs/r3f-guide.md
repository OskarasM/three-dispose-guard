# React Three Fiber guide

## The actual problem

React Three Fiber already attempts automatic disposal for declarative objects when they unmount. Its [object documentation](https://r3f.docs.pmnd.rs/api/objects) also documents `dispose={null}` for opting out.

`useLoader` is different because its result is cached by loader and input. The [hook documentation](https://r3f.docs.pmnd.rs/api/hooks#useloader) warns that cached assets are shared and should not be mutated casually. A component unmount does not necessarily mean the cache has been evicted.

Dispose Guard addresses that ambiguity. It does not replace ordinary R3F unmount cleanup.

## One ownership domain

Create one registry and one R3F cache guard for every R3F loader-cache domain.

```tsx
const registry = createResourceRegistry({ mode: 'audit' })
const cache = createR3FResourceCache({ registry })

<R3FResourceCacheProvider cache={cache}>
  <Canvas>
    <Suspense fallback={null}>
      <Scene />
    </Suspense>
  </Canvas>
</R3FResourceCacheProvider>
```

Two registries cannot claim the same loader/input key. This prevents two independent reference counts from each believing they may dispose the same global cache result.

## Loading and rendering a primitive

```tsx
function Scene() {
  const gltf = useGuardedLoader(GLTFLoader, '/scene.glb')
  return <GuardedPrimitive object={gltf.scene} />
}
```

`useGuardedLoader`:

1. Registers the loader/input request before R3F may suspend.
2. Composes the caller's loader-extension function.
3. Observes the public loader completion callback.
4. Creates one persistent cache protection for the result.
5. Acquires a borrowed lease for each committed React consumer.
6. Releases that borrowed lease with a microtask policy during cleanup.

`GuardedPrimitive` supplies `dispose={null}`. Do not render the same guarded result through an ordinary `<primitive>` that allows R3F to dispose it independently.
You may pass a loader constructor or a stable loader instance. Use the same representation for `useGuardedLoader`, `cache.preload` and `cache.evict` so the application expresses one cache key consistently.


## Preload and eviction

```ts
cache.preload(GLTFLoader, '/scene.glb')

// Later, according to the application's cache policy:
cache.evict(GLTFLoader, '/scene.glb')
```

Eviction clears the exact R3F cache key first, then releases the registry protection. If a mounted borrower remains, disposal waits for that borrower. Repeating `evict` is safe.

Use `cache.clear()` to evict every entry owned by that guard.

Do not call `useLoader.clear` directly for a guarded entry. The registry would not learn that the external cache stopped owning the result.
Loading, preloading and clearing all use the guard's same instrumented loader representation. This is especially important for configured loader instances.


## In-flight eviction

Three.js loaders do not share one portable cancellation interface. The guard therefore does not pretend to cancel every request.

When eviction occurs before resolution:

1. The request generation becomes stale.
2. A late result is not restored to the guarded cache.
3. The result is temporarily adopted as owned.
4. Microtask finalisation cleans it after any same-tick consumer has had an opportunity to claim it.

Rejected loads propagate their original error, create no cache protection and may be retried as a fresh generation. For array inputs, late sibling completions from a rejected generation are also cleaned.

The browser lab and integration suite exercise these flows with deterministic loaders.

## Strict Mode

React development Strict Mode replays effect setup and cleanup. React helpers use microtask release by default, so a same-tick remount cancels pending disposal. Imperative leases remain immediate unless `releasePolicy: 'microtask'` is requested.

This policy protects object-resource ownership. It does not intercept renderer context handling performed by an R3F Canvas.

## Migrating from manual traversal

Before:

```tsx
useEffect(() => {
  return () => {
    gltf.scene.traverse((object) => {
      object.geometry?.dispose()
      object.material?.dispose()
    })
  }
}, [gltf])
```

After:

```tsx
const gltf = useGuardedLoader(GLTFLoader, url)
return <GuardedPrimitive object={gltf.scene} />
```

Move disposal timing to the application's cache policy:

```ts
cache.evict(GLTFLoader, url)
```

This removes traversal from component cleanup and prevents the first consumer from destroying state still used by a second consumer or cache.
