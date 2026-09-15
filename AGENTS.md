# three-dispose-guard

Shared instructions for Codex, Claude Code and other repository agents. Current user instructions override these repository defaults. Observed code, configuration and verified live state override stale descriptions; reconcile the documents when they disagree.

## Product

- Audience: Three.js and React Three Fiber developers whose geometries, materials, textures or loader results are shared, cached or passed between owners.
- Primary goal: an audit-first ownership registry that disposes GPU resources exactly once, only after the final owner releases them, published on npm with provenance and backed by a public research lab (https://three-dispose-guard.vercel.app).
- Success metric: not documented in the repository (owner question in docs/STATE.md). Evidence in use today: every required CI check green, over-disposal tests for every disposal change, and measurements only from committed harness runs.
- Non-goals: adding the guard to every R3F scene by default; owning `WebGLRenderer.dispose()` or context loss; inferring an application's cache eviction policy; intercepting disposal by other libraries; GPU byte measurement; WebGPU (outside the 0.1.x scope); FinalizationRegistry-based cleanup (rejected: non-deterministic and does not express ownership). See README "What this cannot solve".
- Detail: `none`

## Stack

- TypeScript 5 library, ES modules, built with tsup to ESM, CommonJS and declarations for three entry points: `three-dispose-guard`, `/react`, `/r3f`. Node `>=20` (engines); CI covers Node 20 and 24 on Ubuntu and Windows, plus Node 22 jobs.
- Core has zero runtime dependencies. `three` is a required peer; `react` and `@react-three/fiber` are optional peers used only by their entry points. Peer ranges in package.json are tested in CI (React 18 / R3F 8 / Three 0.163 and current).
- Tests: Vitest (jsdom) for unit, React and R3F; Playwright (Chromium full suite, Firefox and WebKit smoke) against the Vite demo.
- Demo and research lab: React + Vite in `demo/`, built to `site-dist/`. Vercel Git integration deploys production from `main` and a preview per pull request (vercel.json); no environment variables.
- npm publishing: `.github/workflows/release.yml` on a `v*` tag, trusted publishing over OIDC with provenance, environment `npm`. No stored npm token.

## Commands

Run from the repository root; package.json scripts are the source of truth.

- Install: `npm ci`
- Browsers for Playwright (once): `npx playwright install chromium firefox webkit`
- Dev server (demo): `npm run dev`
- Lint: none
- Typecheck: `npm run typecheck`
- Test: `npm test`
- Build library: `npm run build`
- Build demo: `npm run demo:build`
- Prose check (plain ASCII, British spelling): `npm run check:prose`
- Font budget (150 kB of woff2): `npm run check:fonts`
- Aggregate gate (typecheck, prose, fonts, test, build, demo build): `npm run check`
- Browser tests: `npm run test:browser` (Chromium), `npm run test:browser:smoke` (Firefox, WebKit), `npm run test:browser:all`
- Package smoke (packs, installs ESM and CommonJS consumers): `npm run package:check`
- Benchmark capture (new dated dataset): `npm run benchmark:capture`
- Benchmark chart (regenerates docs/benchmark-result.svg from JSON): `npm run benchmark:chart`
- Release gate: `npm run release:check`
- Regenerate icons from the one source mark: `npm run icons`
- Agent contract check (vendored, see .github/agent-setup/SOURCE.md): `node .github/agent-setup/check.mjs --ci --repo-id three-dispose-guard .`
- Playwright starts its own server on port 4173 and refuses a busy port; set `THREE_DISPOSE_GUARD_TEST_PORT` to use another.

## Conventions

Branches, commits and release:
- Default branch `main` is protected: 8 required CI checks (4 Node/OS jobs, 2 R3F compatibility jobs, `browser`, `benchmark-data`). Work on a branch and merge by PR only after CI and the Vercel preview pass. A merge to `main` deploys the production lab.
- This repository is public. Never commit tokens, project IDs, registry credentials, private paths or personal details. Report vulnerabilities through private security advisories (SECURITY.md).
- No co-author or AI attribution trailers. Enable the hook once per clone: `git config core.hooksPath .githooks`. The history was rewritten once to remove such trailers; published provenance must not be broken again, so never rewrite pushed history.
- Release only through a `v*` tag matching package.json (docs/release.md). Trusted publishing matches owner `OskarasM`, repository `three-dispose-guard`, workflow `release.yml`, environment `npm`; keep all four in step. Never add `NODE_AUTH_TOKEN` or a classic or long-lived token. Existing tags `v0.1.0` and `v0.1.1` are published; never move or delete them.

Code and tests (from CONTRIBUTING.md):
- A change that expands disposal behaviour must include an over-disposal test: a resource shared by two live users survives the first release. Prefer the browser harness when behaviour reaches WebGL.
- Loader instrumentation changes also cover overlapping requests, array inputs, rejection and stale generations.
- Guarded loading changes test all three ownership moments: one consumer leaves without destroying another; zero consumers stay valid while cache protection remains; eviction then final release disposes exactly once. Also cover rejection or eviction while the loader callback is pending.
- Keep disposal idempotent, audit mode the default, shared resources with an explicit owner, and R3F cache clearing through the guard (`cache.evict`/`cache.clear`, never `useLoader.clear` for guarded entries).
- No new runtime dependencies without discussing the trade-off first. Keep Three.js and React as peers.
- Layout: library source `src/`, unit tests `tests/`, browser tests `tests/browser/`, demo `demo/src/`, scripts `scripts/`, datasets `benchmarks/results/`, published guides `docs/` (shipped in the npm tarball, except STATE, ROADMAP and DECISIONS).
- Never edit by hand: `dist/`, `site-dist/`, `docs/benchmark-result.svg`, the committed benchmark JSON/CSV or any reported value, generated icons in `demo/public/`.

Measurement and prose:
- No performance or memory number in README unless it came from a committed harness run with browser, OS, GPU renderer, cycles, fixed inputs and capture time. Describe `renderer.info.memory` values as resource counts, not bytes.
- Schema-v2 captures contain every variant for every scenario; use explicit `not-measured` or `not-applicable` where no honest implementation exists. The JSON is authoritative; CSV and chart are generated from it. New environments get a new dated capture from a clean commit, never an overwrite.
- Documentation and code comments use British English and plain ASCII (no smart quotes, en or em dashes, or ellipsis character); `npm run check:prose` enforces it. Distinguish measurements from interpretation; do not imply every R3F scene needs this package.
- `demo/src/tokens.css` is a token schema shared by name with two sibling projects; keep variable names stable. Fonts are self-hosted under the 150 kB budget; keep the OFL licence texts beside them.

## Project docs

Read the smallest set the task needs. Files marked "search only" are never read in full.

| file | holds | read |
|---|---|---|
| `docs/STATE.md` | stage, Now (max 3), blockers, last verified checks | start of substantive work |
| `docs/ROADMAP.md` | Next, Later, Parked, Out of scope for now | before feature or scope work |
| `docs/DECISIONS.md` | decision register: status and reason | search the relevant section before changing direction |
| `CHANGELOG.md` | release history; shipped in the npm tarball, so user-facing release notes only | search only |
| `CONTRIBUTING.md`, `docs/release.md`, `SECURITY.md` | contributor rules, release and deployment procedure, security policy | before code, release or security work |
| `docs/api.md`, `docs/ownership-model.md`, `docs/r3f-guide.md`, `docs/methodology.md`, `benchmarks/README.md` | published API, ownership model, R3F guide, measurement method | before changing the matching behaviour or claims |

A current explicit user request authorises its scope even if absent from these docs. Ask before expanding that scope materially. Revisit rejected decisions only with new evidence; explain the tradeoff.

## Done = verified

Work is done only when these pass, run in this order, output read. `npm run check` runs typecheck, prose, fonts, unit tests, library build and demo build.

1. `npm run check`

- Browser-visible, WebGL, R3F or demo change: also `npm run test:browser:all`.
- Before opening a pull request (CONTRIBUTING.md): also `npm run package:check`, `npm run benchmark:chart` with no resulting diff in docs/benchmark-result.svg, and `npm pack --dry-run`.
- Peer-range or R3F change: CI's React 18 / R3F 8 / Three 0.163 job must pass; it is not run locally by default.
- Release: `npm run release:check` from a clean checkout with all three browsers installed, then the steps in docs/release.md.
- Docs-only change: `npm run check:prose`, links, consistency with package.json scripts and CI, `git diff --check`, and the agent contract check.
- Update only project docs whose facts changed: `docs/STATE.md` (Now, blockers, Last verified, Updated date), `docs/DECISIONS.md` (new or changed decisions with reason), `docs/ROADMAP.md` (items moved or added), a `CHANGELOG.md` entry for user-visible changes in a release.
- Report which checks ran and their result. Never skip, weaken, or delete a check to make it pass.

## Design

Visual design: `none (not documented)`. The demo lab has a UI: tokens and their rules live in `demo/src/tokens.css`; read it and run `npm run test:browser` (axe WCAG A/AA, 44 px targets, no overflow at 375-1440 px, reduced motion) before any UI change.
