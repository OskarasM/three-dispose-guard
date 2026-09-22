# Decisions

Register of settled choices so nobody re-litigates them. Add or update rows; never delete a row, mark it Superseded. No length cap: search the relevant section, do not read in full. Not shipped in the npm tarball.

Status: Accepted | Implemented | Open (needs owner) | Deferred (valid later) | Rejected (do not revive without new evidence and owner approval) | Superseded (by row/date)

Rows dated before 2026-09-15 index choices already written in this repository (commit messages, README, CONTRIBUTING.md, code comments); the source is named in each row. Where no commit dates a choice, the date is the 0.1.0 release (2026-08-22) or the capture date.

## Library scope and API

| Date | Decision | Status | Reason / evidence |
|---|---|---|---|
| 2026-08-22 | Audit mode is the default; disposal mode is opted into after recorded ownership matches the application. | Implemented | README R3F quick start; PR template "Audit mode remains the default". |
| 2026-08-22 | Zero runtime dependencies; Three.js a required peer, React and R3F optional peers per entry point. | Implemented | package.json; CONTRIBUTING.md asks for a trade-off discussion before any runtime dependency. |
| 2026-08-22 | Imperative leases default to `immediate`, React helpers to `microtask`, so a same-tick Strict Mode replay can reclaim a resource before disposal. | Implemented | README Public API. |
| 2026-08-22 | FinalizationRegistry is not used. | Rejected | Garbage-collection timing is non-deterministic and does not express ownership (README "What this cannot solve"). |
| 2026-08-22 | A render target owns its attachments, so they are not disposed twice. | Implemented | README Custom collectors. |

## Measurement and research

| Date | Decision | Status | Reason / evidence |
|---|---|---|---|
| 2026-08-21 | Publish the unique-resource negative result: all explicit cleanup strategies stay flat when ownership is simple. | Accepted | README Measured result; the guard's value is shown by the other five scenarios. |
| 2026-08-22 | Remove the reference manifest, unexecuted JSON Schema, `benchmark:verify` and CITATION.cff; trim the CI compatibility matrix from nine jobs to four. | Implemented | Commit 082b005: the manifest gate existed only to satisfy a validator and deliberately failed release:check. |
| 2026-08-22 | Raw measurement data stays in the repository, not the npm tarball; the chart is generated from the JSON and CI fails on drift. | Implemented | README; ci.yml `benchmark-data` job. |
| 2026-08-23 | Prose rule (plain ASCII, British spelling) is enforced by a script, with API-name spellings excluded by extension and method-call context rather than an exception list. | Implemented | Commit 1f3e253; scripts/check-prose.mjs header. |

## Release and repository

| Date | Decision | Status | Reason / evidence |
|---|---|---|---|
| 2026-08-22 | Publish over npm trusted publishing (OIDC) with provenance; no stored or long-lived npm token. | Implemented | Commit 3710da3; release.yml comments; docs/release.md. |
| 2026-08-22 | Self-host type with a 150 kB woff2 budget gate. | Implemented | Commit e5592af; scripts/check-font-budget.mjs. |
| 2026-08-22 | Token schema is copied into each sibling project rather than published as a package. | Deferred | demo/src/tokens.css: three copies are cheaper than a package; revisit at four repositories. |
| 2026-08-25 | Cut 0.1.1 with no library change to restore published provenance after the history rewrite. | Implemented | CHANGELOG.md 0.1.1; commit 98b0d68. |
| 2026-08-25 | Refuse co-author trailers with a commit-msg hook, and recreate the GitHub repository to drop pull requests that still carried them. | Implemented | .githooks/commit-msg; commit fb0c29a (Vercel production deployment confirmed against it). |

## Project setup

| Date | Decision | Status | Reason / evidence |
|---|---|---|---|
| 2026-09-15 | AGENTS.md is the shared project contract (seven sections, checked in CI by a vendored checker in .github/project-check/); docs/STATE.md, docs/ROADMAP.md and this file hold current state, plan and decisions; CHANGELOG.md stays the release history. | Accepted (owner) | Owner-approved setup pattern; checker source and hashes in .github/project-check/SOURCE.md. |
| 2026-09-15 | The contract checker runs as a step in the existing required Node/OS compatibility jobs instead of a new job. | Accepted (proposal) | A new job would not be a required status check under current branch protection; the step also exercises the checker on Windows and Node 20. |
| 2026-09-15 | scripts/check-prose.mjs skips `project-check` directories. | Accepted (proposal) | The vendored checker must stay byte-identical to its source hash and contains an American spelling. |
| 2026-09-15 | docs/STATE.md, docs/ROADMAP.md and docs/DECISIONS.md are excluded from the npm tarball (package.json `files` negations), asserted by scripts/package-smoke.mjs. | Accepted (proposal) | `docs/` ships as published guides; working project docs are not package content. |
