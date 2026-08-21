# Measurement methodology

## Research question

When does explicit GPU-resource ownership improve a Three.js or React Three Fiber lifecycle, and when is ordinary disposal already sufficient?

The study records both positive and negative results. It does not assume that every R3F unmount leaks.

## Signals

The primary series is:

```ts
renderer.info.memory.geometries + renderer.info.memory.textures
```

`renderer.info.programs.length` is recorded as supporting context.

These values count resources known to Three.js. They do not report GPU bytes, JavaScript heap size or browser-driver allocations. The [Three.js disposal guide](https://threejs.org/manual/en/how-to-dispose-of-objects.html) explains why explicit disposal is required, and the [WebGLRenderer documentation](https://threejs.org/docs/#api/en/renderers/WebGLRenderer.info) defines the renderer information fields.

Shared-resource proofs also inspect the underlying `WebGLTexture` through the test renderer's private properties. That internal access is restricted to the research harness and is not part of the package API.

## Fixed protocol

- Assets are generated locally with deterministic seeds.
- The measured viewport is 192 by 128 pixels for allocation runs.
- Antialiasing is disabled in measured renderers.
- One four-cycle warm-up is completed and discarded.
- Five independent runs are captured.
- Each run contains 50 mount and unmount cycles per strategy.
- Strategies execute sequentially in the same browser session.
- Final totals, minimum, maximum, mean and population variance are recorded.
- Every raw per-cycle sample is retained in JSON and CSV.

## Four comparison strategies

### Unmanaged

A unique geometry, material and texture set is created and rendered each cycle. The object is removed from the scene without calling `dispose()`. This intentionally reproduces retained Three.js resources.

### Naïve eager disposal

Every collected resource is disposed immediately after its object unmounts. This is valid for unique resources but unsafe for a resource still used elsewhere.

### Declarative-style disposal

The unique-resource experiment models cleanup at declarative unmount. It is expected to match eager cleanup and the guard because ownership is unambiguous.

This line is not presented as a full R3F renderer benchmark. Real R3F `useLoader`, mounted-consumer and cache-clear behaviour is exercised by the adapter integration tests and specialised browser proofs.

### Dispose Guard

Each unique root is acquired as owned and released after unmount. The registry calls `dispose()` after its final count reaches zero.

## Six scenarios

1. **Unique resources** records all four resource-count series.
2. **Two live users** verifies that a real WebGL texture survives the first release and disappears after the second.
3. **Loader cache reuse** verifies survival at zero mounted users, handle reuse after remount and final disposal after eviction.
4. **Canvas remount** separates scene-resource disposal from renderer and context cleanup.
5. **Shared churn** alternates consumers around one protected resource for a fixed cycle count.
6. **In-flight eviction** uses an actual R3F preload with a deterministic late loader callback.

Each proof publishes individual pass or fail assertions rather than reducing different lifecycle questions to one memory graph.

## Reference environment

Captured on 21 August 2026:

- Windows_NT 10.0.26200 x64
- AMD Ryzen 7 5800H with Radeon Graphics
- 16 logical processors and 15.34 GiB reported system memory
- Chromium 151.0.7922.34, headless
- ANGLE with Vulkan SwiftShader
- Three.js 0.185.x
- React 19.x
- React Three Fiber 9.7.x
- three-dispose-guard 0.1.0

The software renderer makes this suitable for deterministic lifecycle evidence, not for performance conclusions about a physical GPU.

## Reference result

| Strategy | Five final totals | Mean | Variance |
|---|---:|---:|---:|
| Unmanaged | 401, 401, 401, 401, 401 | 401 | 0 |
| Naïve eager | 1, 1, 1, 1, 1 | 1 | 0 |
| Declarative-style | 1, 1, 1, 1, 1 | 1 | 0 |
| Dispose Guard | 1, 1, 1, 1, 1 | 1 | 0 |

All five specialised proofs passed.

## Reproduction

```bash
npm ci
npx playwright install chromium
npm run benchmark:capture
npm run benchmark:chart
```

The capture script adds the host operating system, CPU, logical processor count, reported memory, browser version and renderer string to the output.

A result from different hardware or a different browser should be committed under a new dated filename. Do not merge distinct environments into the reference capture without retaining their raw samples.

## Threats to validity

- `renderer.info` may contain stable internal resources not created by the scenario.
- Browser and driver versions can change allocation behaviour.
- Headless SwiftShader does not represent physical-GPU performance.
- Forced context loss is a lifecycle assertion, not a memory-pressure measurement.
- The declarative-style line isolates disposal timing and does not reproduce every R3F reconciler detail.
- Private WebGL-handle inspection can change between Three.js releases and is therefore confined to tests.
