# Three Dispose Guard

Ownership-aware GPU resource disposal for Three.js, with a safe audit mode and tests for the failure that matters: disposing something another component still uses.

![Measured Three.js resource counts over 50 mount cycles](docs/benchmark-result.svg)

The committed browser harness ran five 50-cycle trials on 21 August 2026. Every unmanaged trial ended at 401 allocated geometries and textures; every guarded trial ended at the stable one-texture renderer baseline. The observed variance was zero resources across the five runs. These are Three.js resource counts, not GPU bytes.

> Local build status: the package, demo and verification harness are implemented. It has not been published to npm or GitHub from this workspace.

## Why this exists

JavaScript garbage collection and GPU resource disposal are separate systems. Three.js creates WebGL buffers, textures, framebuffers and shader programs on demand. Dropping the final JavaScript reference does not call `geometry.dispose()`, `texture.dispose()` or the other explicit cleanup APIs.

The tempting fix is a recursive scene traversal on every unmount. That is unsafe. A geometry, material or texture can be shared by several meshes, and loader results are commonly cached. Disposing after the first user unmounts can force a costly re-upload for the user that remains.

Three Dispose Guard makes that missing ownership model explicit:

- **owned** scopes are eligible for disposal after their final user releases;
- **borrowed** scopes are measured, but never become disposal candidates;
- **protections** keep cache-owned resources alive until explicit eviction;
- **audit mode**, the default, reports what would be disposed without mutating anything.

## Install

```bash
npm install three-dispose-guard three
```

React is an optional peer dependency and is only needed for the `three-dispose-guard/react` entry point.

## Vanilla Three.js

Start in audit mode:

```ts
import { createResourceRegistry } from 'three-dispose-guard'

const guard = createResourceRegistry()
const lease = guard.acquire(model, {
  ownership: 'owned',
  label: 'product preview',
})

scene.add(model)

// During teardown
scene.remove(model)
lease.release()

console.table(guard.snapshot().events)
```

Once audit output matches the lifecycle you expect, opt into disposal:

```ts
const guard = createResourceRegistry({ mode: 'dispose' })
```

`release()` is idempotent and also implements `Symbol.dispose`, so it works with explicit resource management in supported toolchains.

## Shared resources

Acquiring the same root twice increments counts for each unique geometry, material, texture, render target and skeleton found below it:

```ts
const first = guard.acquire(sharedModel, { ownership: 'owned', label: 'card A' })
const second = guard.acquire(sharedModel, { ownership: 'owned', label: 'card B' })

first.release()  // nothing is disposed
second.release() // the final owned references are disposed
```

The browser test renders an actual `WebGLTexture`, releases the first mesh, and asserts that the renderer still holds the same GPU handle. It then releases the second mesh and verifies that Three.js removes the handle.

## Cached assets

A cache is an owner even when no component is mounted. Protect the cached result for the cache lifetime:

```ts
const cacheProtection = guard.protect(gltf.scene, { label: 'catalogue GLTF cache' })

const component = guard.acquire(gltf.scene, { ownership: 'owned' })
component.release()

// Clear the loader cache first, then release its ownership protection.
useLoader.clear(GLTFLoader, url)
cacheProtection.release()
```

If your code does not control eviction, acquire the result as `borrowed`. The guard will never dispose it.

## React and React Three Fiber

```tsx
import { ResourceRegistryProvider, useResourceLease } from 'three-dispose-guard/react'

function Model({ scene }: { scene: THREE.Object3D }) {
  useResourceLease(scene, { ownership: 'owned', label: 'hero model' })
  return <primitive object={scene} dispose={null} />
}
```

Put `dispose={null}` on the tracked R3F subtree. This prevents two ownership systems from both attempting cleanup.

An important correction to the original project hypothesis: current React Three Fiber already attempts to dispose declaratively created objects on unmount. Its documentation also warns that cached assets and objects mounted through `<primitive>` require care. This package is for those explicit ownership boundaries, vanilla Three.js lifecycles, and diagnostics. It does not claim that every R3F unmount leaks.

## What gets collected

`collectDisposableResources()` handles:

- geometries attached to Object3D trees;
- single materials and material arrays;
- every texture-valued material property found at runtime;
- textures nested in shader uniforms, arrays and uniform objects;
- render targets as owners of their attachments;
- skeletons used by skinned meshes;
- common loader result fields such as `scene`, `scenes`, `materials` and `textures`.

The collector uses Three.js runtime type flags rather than a frozen list of texture slot names. This keeps it compatible with current and custom materials without walking unrelated loader metadata.

## Reproduce the measurement

```bash
npm install
npm run dev
```

Open the local site and run the 50-cycle test. Each cycle creates and renders four new geometries and four data textures, removes them from the scene, then samples `renderer.info.memory`. The unmanaged and guarded variants use separate WebGL contexts so the first result cannot contaminate the second.

### Recorded environment and result

| Field | Recorded value |
| --- | --- |
| Date | 21 August 2026 |
| Runs | 5 |
| Cycles per run | 50 |
| Browser | Chrome 151.0.0.0, Playwright Chromium |
| Operating system | Windows 10 reported by the browser user agent |
| Renderer | ANGLE, AMD Radeon Graphics, Direct3D 11 |
| Fixed workload | 4 geometries and 4 data textures per cycle |
| Unmanaged final count | 200 geometries, 201 textures, total 401 |
| Guarded final count | 0 geometries, 1 stable internal texture, total 1 |
| Across-run variance | 0 resources for both variants |

The result demonstrates application-visible allocation retention in `renderer.info`. It is not a claim about driver bytes or process memory.

For the automated browser assertions:

```bash
npx playwright install chromium
npm run test:browser
```

### What the number means

`renderer.info.memory.geometries` and `.textures` are counts of resources Three.js believes are allocated. They are not bytes, and they are not a direct reading of driver memory. Three.js may retain a small stable set of internal resources for reuse. A flat line after warm-up is the useful signal.

## Why there is no `FinalizationRegistry` cleanup

`FinalizationRegistry` callbacks are delayed and may never run. More importantly, the callback cannot access the collected target unless the registry retains a strong reference, which would prevent collection. It can be useful for warnings about abandoned lease wrappers, but it is not a correctness mechanism for GPU disposal. This implementation keeps cleanup deterministic and explicit.

## Verification

```bash
npm run check
npm run test:browser
```

The suite covers:

- two owners sharing a texture, with no disposal after the first release;
- disposal after the final owner releases;
- cache protection across unmount and remount;
- borrowed assets that must never be disposed;
- audit mode that never mutates resources;
- idempotent release;
- shader-uniform texture discovery;
- 1,000 mount and unmount cycles with a flat registry;
- a browser-level check against the actual WebGL texture handle;
- a browser leak harness that fails if guarded resource counts grow;
- horizontal overflow checks at 375, 768, 1024 and 1440 pixels.

## Limits

- The registry only knows about scopes adopted through its API.
- A borrowed asset is intentionally never disposed by the registry.
- Protecting a cache requires an explicit release during eviction.
- Renderer and controls instances have their own terminal disposal lifecycle and are not scene resources.
- `ImageBitmap.close()` is not called. Three.js documents that the image may be shared outside the texture, so the application must close it when appropriate.
- WebGPU resources are outside the v0.1 scope.

## Sources

- [Three.js: How to dispose of objects](https://threejs.org/manual/en/how-to-dispose-of-objects.html)
- [Three.js: WebGLRenderer.info](https://threejs.org/docs/pages/WebGLRenderer.html#info)
- [React Three Fiber: automatic disposal](https://github.com/pmndrs/react-three-fiber/blob/master/docs/API/objects.mdx#disposal)
- [React Three Fiber: useLoader cache warning](https://github.com/pmndrs/react-three-fiber/blob/master/docs/API/hooks.mdx#useloader)

## Licence

MIT
