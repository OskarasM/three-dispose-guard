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
- Every one of the six scenarios receives one four-cycle warm-up, which is discarded.
- Five repeated runs are captured. They are repeated observations, not statistically independent samples.
- Every recorded scenario run uses 50 lifecycle cycles or transitions.
- Scenarios and strategies execute in a fixed, documented order within one browser process.
- Final totals, minimum, maximum, mean and population variance are recorded for the unique-resource series.
- Every per-cycle resource sample, assertion, comparison outcome and scenario summary is retained in JSON and CSV.

Schema v2 records the exact package versions from `package-lock.json`, Git commit, dirty-worktree state, lockfile SHA-256, timezone, operating system, CPU, browser version and WebGL renderer. Filenames include a millisecond timestamp, platform, browser and commit prefix; an incrementing suffix prevents same-name overwrites.

## Four comparison strategies

### Unmanaged

A unique geometry, material and texture set is created and rendered each cycle. The object is removed from the scene without calling `dispose()`. This intentionally reproduces retained Three.js resources.

### Naïve eager disposal

Every collected resource is disposed immediately after its object unmounts. This is valid for unique resources but unsafe for a resource still used elsewhere.

### Native R3F disposal

The unique-resource experiment uses the public R3F `createRoot` reconciler with declarative geometry, material and texture elements. Each tree is committed and then unmounted. R3F's testing flag makes its idle cleanup run immediately; this changes scheduling, not which declarative objects R3F owns.

Native R3F is marked `not-applicable` or `not-measured` where there is no honest equivalent. In particular, R3F cannot infer an external owner for an arbitrary shared primitive, and its loader cache does not expose a general owned-resource cleanup contract for a late result. Those cells are never silently replaced by a modelled line.

### Dispose Guard

Each unique root is acquired as owned and released after unmount. The registry calls `dispose()` after its final count reaches zero.

## Six scenarios

1. **Unique resources** records unmanaged, eager, actual native-R3F and guarded resource-count series.
2. **Two live users** measures three real WebGL counterfactuals: unmanaged retention, eager invalidation and guarded final-owner cleanup. Native R3F is not applicable to an externally owned shared primitive.
3. **Loader cache reuse** verifies survival at zero mounted users, handle reuse after remount and final disposal after eviction. Unmeasured counterfactuals are labelled as such.
4. **Canvas remount** separates scene-resource disposal from renderer and context cleanup rather than treating them as one memory number.
5. **Shared churn** alternates consumers around one protected resource for the full cycle count.
6. **In-flight eviction** repeats an actual R3F preload with a deterministic late loader callback and unique cache key.

Each report publishes assertions and a four-variant applicability table. A variant can be `safe`, `unsafe`, `retained`, `not-measured` or `not-applicable`. Only rows with `measured: true` are empirical results.

## Historical schema-v1 reference

The files dated 21 August 2026 were captured before schema v2 and are retained unchanged as historical evidence. Their environment was Windows_NT 10.0.26200 x64, Chromium 151.0.7922.34 and ANGLE SwiftShader.

| Strategy | Five final totals | Mean | Variance |
|---|---:|---:|---:|
| Unmanaged | 401, 401, 401, 401, 401 | 401 | 0 |
| Naïve eager | 1, 1, 1, 1, 1 | 1 | 0 |
| Declarative-style model | 1, 1, 1, 1, 1 | 1 | 0 |
| Dispose Guard | 1, 1, 1, 1, 1 | 1 | 0 |

That dataset does not contain the actual-R3F line, repeated specialised scenarios, exact patch versions or full CSV provenance. It must not be relabelled as a schema-v2 result. A fresh capture is required before replacing the public chart or making new numerical claims.

The software renderer is suitable for deterministic lifecycle evidence, not performance conclusions about a physical GPU.

## Reproduction

```bash
npm ci
npx playwright install chromium
npm run benchmark:capture
npm run benchmark:chart
```

The capture validates all six scenarios before writing. It refuses approximate package versions or a missing scenario run. JSON follows [the schema](../benchmarks/research-capture.schema.json); CSV uses typed records documented in [the benchmark guide](../benchmarks/README.md).

A dirty-worktree capture is allowed for development but is marked `git_worktree_dirty=true`. A public reference should be generated from a clean commit. Different hardware, browsers or dependency sets produce separate collision-safe files and are never merged into one result.

The benchmark data is licensed separately under [CC BY 4.0](../DATA-LICENSE.md). Citation metadata is in [CITATION.cff](../CITATION.cff).

## Threats to validity

- `renderer.info` may contain stable internal resources not created by the scenario.
- Counts are lifecycle signals, not GPU bytes, JavaScript heap values, timings or driver-memory measurements.
- The five runs share one browser process, fixed order and deterministic inputs. Population variance describes repeatability under that protocol, not a population estimate or confidence interval.
- Fixed strategy and scenario order can introduce order effects. The order is recorded rather than randomised.
- Headless SwiftShader does not represent physical-GPU performance or vendor-driver behaviour.
- Chromium carries the WebGL assertions. Firefox and WebKit smoke checks do not establish equivalent allocation behaviour.
- Forced context loss is a lifecycle assertion, not a memory-pressure measurement.
- The actual-R3F unique test uses immediate test-environment disposal scheduling. Production R3F may schedule the same cleanup later.
- Specialised native-R3F counterfactuals are omitted when no equivalent ownership contract exists; `not-measured` is not evidence of success or failure.
- Private `WebGLTexture` inspection can change between Three.js releases and is confined to the harness.
- Exact versions, commit identity and lockfile hash improve reproducibility but do not prove that another machine will produce identical renderer counts.
- The study has no external replication yet. A physical-GPU capture and an independent environment remain valuable follow-up work.
