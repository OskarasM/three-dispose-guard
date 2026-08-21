# Contributing

## Set up

```bash
npm install
npm run check
```

Install Chromium once before browser tests:

```bash
npx playwright install chromium
npm run test:browser
```

## Correctness rule

A change that expands disposal behaviour must include an over-disposal test. At minimum, prove that a resource shared by two live users survives the first release. Prefer the browser harness when the behaviour reaches WebGL.

Do not add runtime dependencies without discussing the trade-off first. Keep Three.js and React as peer dependencies.

## Measurement rule

Do not add a performance or memory number to the README unless it came from a committed harness run. Record the browser, operating system, GPU renderer, number of cycles, fixed inputs and capture time. Describe `renderer.info.memory` values as resource counts, not bytes or direct driver memory.
