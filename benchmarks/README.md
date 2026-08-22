# Benchmark results

This directory contains raw WebGL lifecycle measurements and their machine-readable schema.

## Schema versions

Schema v2 is defined by [`research-capture.schema.json`](research-capture.schema.json). A v2 capture includes:

- a discarded warm-up for all six scenarios;
- five repeated 50-cycle executions of every scenario;
- per-cycle unique-resource samples;
- every assertion and variant-comparison record;
- variance and per-scenario summaries;
- exact dependency versions, Git commit and dirty state;
- package-lock SHA-256, timezone, host, browser and GPU renderer.

The CSV is a comprehensive tabular companion to the JSON. Its `record_type` column is one of:

- `metadata` for capture-wide provenance;
- `sample` for each per-cycle renderer count;
- `variant_summary` for final totals and variance;
- `assertion` for every scenario assertion in every run;
- `comparison` for safe, unsafe, retained or explicitly unmeasured variant outcomes;
- `scenario_summary` for aggregate pass counts.

All rows repeat the capture ID and provenance columns so a filtered CSV remains attributable.

Interactive lab downloads are named `three-dispose-guard-browser-suite-*` and carry
`artifactKind: browser-suite`. They include exact lockfile versions injected at build time, but
only the CLI changes the kind to `provenance-complete-capture` and adds Git, lock-hash and host provenance.

## Historical schema-v1 reference

The files [`2026-08-21-windows-chromium.json`](results/2026-08-21-windows-chromium.json) and [`2026-08-21-windows-chromium.csv`](results/2026-08-21-windows-chromium.csv) are the original schema-v1 reference. They remain unchanged for auditability.

They contain five repeated unique-resource runs and one set of specialised proofs. Their “native” line is a declarative-style model, not actual R3F. Do not relabel these files as schema v2 or use them as evidence for the upgraded native comparison.

## Generate a new capture

```bash
npm ci
npx playwright install chromium
npm run benchmark:capture
```

The command starts an isolated Vite server, runs the full protocol, validates the document and writes a new JSON/CSV pair. Filenames contain an ISO timestamp with milliseconds, platform, browser and commit prefix. Existing names receive an incrementing suffix and are never overwritten.

A development capture from an uncommitted tree is allowed but records `git_worktree_dirty=true`. Generate a public reference from a clean commit, then pass the new JSON path to the chart script before changing any reported result.

## Interpretation

The unique-resource series is a lifecycle reproduction, not evidence that R3F generally leaks. The native line in schema v2 uses R3F `createRoot`. Shared-resource counterfactuals directly measure unmanaged retention, eager invalidation and guarded ownership with real WebGL handles.

Cells marked `not-measured` or `not-applicable` are limitations, not implied successes. See [the methodology](../docs/methodology.md) before comparing captures.

Benchmark data is licensed under [CC BY 4.0](../DATA-LICENSE.md). Cite the software and dataset using [CITATION.cff](../CITATION.cff).
