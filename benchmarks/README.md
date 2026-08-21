# Benchmark results

This directory contains raw, reproducible WebGL lifecycle measurements.

## Reference capture

- `results/2026-08-21-windows-chromium.json` contains the complete five-run suite, variance summary, host metadata and specialised proof assertions.
- `results/2026-08-21-windows-chromium.csv` contains every per-cycle resource sample for independent analysis.
- `docs/benchmark-result.svg` is generated from the JSON and is not a hand-authored result.

## Generate a new capture

```bash
npm run benchmark:capture
npm run benchmark:chart -- benchmarks/results/<new-file>.json
```

The capture command starts an isolated Vite server and headless Chromium. It records the operating system, CPU, logical processor count, reported memory, browser version, WebGL renderer and package versions.

Keep separate files for separate browsers, GPUs or library-version matrices. Do not overwrite the reference file with a different environment.

## Interpretation

The unique-resource graph is a reproduction experiment, not evidence that R3F generally leaks. Naïve, declarative-style and guarded cleanup all remain flat when ownership is obvious.

The additional value of ownership tracking is tested through assertions for shared resources, cache survival, remount, repeated hand-off and late in-flight resolution.
