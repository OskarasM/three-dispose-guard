# Changelog

All notable changes are documented here.

## 0.1.1 - 2026-08-25

No change to the library. `src/` is untouched since 0.1.0, so the built `dist`
in this tarball is identical to the one in 0.1.0.

### Changed

- README documents the demo, the prose and font-budget checks, and the sibling
  projects, and points at the renamed scene-narrator demo.
- Documentation spells "naive" one way throughout.

### Fixed

- Published provenance. The 0.1.0 attestation names a commit from before the
  repository history was rewritten, so the source it points at is no longer in
  this repository. This release is built and signed against current `main`.

## 0.1.0 - 2026-08-22

### Added

- Audit-first ownership registry for owned, borrowed and protected Three.js resources.
- Immediate and React-safe microtask release policies.
- Immutable scope, resource-kind, pending-disposal and error diagnostics.
- Extensible collection for application-specific disposable resources.
- React provider, lease and snapshot hooks.
- R3F loader-cache guard, preload, eviction, in-flight handling and safe primitive component.
- Six-scenario WebGL research lab with JSON and CSV downloads.
- Five-run reference dataset, generated chart and reproducible capture script.
- Unit, React, R3F integration and Chromium WebGL tests.
- Mounted React Three Fiber browser stories asserting cache reuse, deferred eviction, same-tick remount, exactly-once disposal and Canvas remount against the driver texture handle.
- ESM, CommonJS and TypeScript declaration builds.
- Research capture provenance metadata and a CC BY 4.0 data licence.
- Keyboard, touch, reduced-motion and WCAG A/AA coverage for the public lab.
- Core-only consumer and tree-shaking verification.

### Fixed

- Guarded loader callbacks are associated with the exact cache key and request generation.
- Overlapping array loads no longer cross-protect sibling results.
- Rejected and evicted in-flight generations clean late results without reviving stale cache entries.
- Loader instances now use one stable R3F representation for load, preload and eviction.
- Errors thrown by a caller's loader error callback cannot corrupt guard bookkeeping.
- CommonJS consumers now resolve the .d.cts declarations, because types is nested inside each export condition.
- The benchmark capture script always closes its Vite server when the browser fails to launch.
