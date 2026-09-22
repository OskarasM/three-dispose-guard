# Roadmap

Updated: 2026-09-15

Forward plan only. Shipped work leaves this file (CHANGELOG.md + git). Rejected ideas live in docs/DECISIONS.md. Max 250 lines. Not shipped in the npm tarball.

Drafted from repository evidence (docs/methodology.md, CONTRIBUTING.md, benchmarks/README.md, build output). Items are proposals until the owner orders them.

## Next

Ordered. Top item moves to STATE Now when started.

1. Merge the project setup pull request - done when all 8 required CI checks and the Vercel preview pass and the owner merges it.
2. Align the README measurement wording with docs/methodology.md - the README calls the five runs "independent" while the methodology says they are repeated observations, not statistically independent samples - done when both say the same and `npm run check:prose` passes.
3. Document the demo lab's visual design - the lab has a UI and a token schema (demo/src/tokens.css) but no design document, so AGENTS.md says `none (not documented)` - done when a design document describes the existing tokens, type and layout rules without redesigning anything and AGENTS.md points to it.

## Later

- Schema-v2 reference capture from a clean commit, replacing the schema-v1 README figures only with newly captured values - owner decision (question in docs/STATE.md).
- Physical-GPU capture and an independent environment (docs/methodology.md "no external replication yet") - needs hardware other than ANGLE SwiftShader; commit as a new dated dataset, never overwrite.
- Vitest major upgrade to clear the two moderate dev-toolchain audit findings - owner decision; run the full Done gates and CI compatibility jobs afterwards.

## Parked

- Demo build warns that one chunk (registry, about 740 kB before gzip) exceeds 500 kB - the lab chunks already load on demand and the browser suite passes - revisit when the initial page weight becomes a measured problem.
- Publishing the shared token schema as a package - three copies are cheaper than one package plus three build wirings (demo/src/tokens.css) - revisit at four projects using it.

## Out of scope for now

- WebGPU measurement - outside the 0.1.x scope stated in README.
- GPU byte measurement, renderer or context-loss ownership, cache eviction policy inference - listed in README "What this cannot solve".
