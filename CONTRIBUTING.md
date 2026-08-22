# Contributing

## Set up

```bash
npm ci
npm run check
```

Install the supported browsers once before browser tests:

```bash
npx playwright install chromium firefox webkit
npm run test:browser:all
```

## Correctness rule

A change that expands disposal behaviour must include an over-disposal test. At minimum, prove that a resource shared by two live users survives the first release. Prefer the browser harness when the behaviour reaches WebGL.

Do not add runtime dependencies without discussing the trade-off first. Keep Three.js and React as peer dependencies.

Changes to loader instrumentation must also cover overlapping requests, array inputs, rejection and stale generations.

## Measurement rule

Do not add a performance or memory number to the README unless it came from a committed harness run. Record the browser, operating system, GPU renderer, number of cycles, fixed inputs and capture time. Describe `renderer.info.memory` values as resource counts, not bytes or direct driver memory.


Schema-v2 captures must contain every variant for every scenario. Use an explicit `not-measured` or `not-applicable` comparison where a variant has no honest implementation.

The JSON file is authoritative. The committed CSV and the committed chart must both be generated from it, never edited by hand.

## R3F cache rule

A change to guarded loading must test all three ownership moments:

1. One mounted consumer can leave without destroying another.
2. Zero consumers can be valid while the cache protection remains.
3. Eviction followed by the final consumer release disposes exactly once.

Also cover rejection or eviction while the loader callback is still pending.

## Before opening a pull request

```bash
npm run check
npm run test:browser:all
npm run package:check
npm run benchmark:chart
npm pack --dry-run
```

When measurements change, generate a new dated capture from a clean commit and regenerate the chart from it. Do not edit raw JSON, CSV or reported values by hand.

Keep documentation in British English and avoid claims that imply every R3F scene requires this package.
