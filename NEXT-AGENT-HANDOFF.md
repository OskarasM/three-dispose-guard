# Next-agent handoff

Date: 22 August 2026
Checkpoint-only file: read this first, then remove it before opening the public release pull request.


## Where to work

- Working clone: `C:\Users\om117\Documents\Codex\2026-08-21\files-mentioned-by-the-user-build\three-dispose-guard`
- Branch: `release/v0.1.0-completion`
- Remote: `https://github.com/OskarasM/three-dispose-guard`
- Production project: Vercel team `zoltrack team`, project `three-dispose-guard`
- Do not overwrite the separate dirty checkout at `C:\Users\om117\projects\three-dispose-guard`. Sync it only after the remote branch is merged, preserving its local changes.

Use explicit paths when staging. Do not use `git add .` or `git add -A`.

## Checkpoint state

The branch is a working development checkpoint, not a release candidate.

Verified immediately before this handoff:

- `npm run typecheck`: passed.
- Focused Vitest suite: 37 of 37 passed across registry, resource collection, R3F and research-data tests.
- `npm run build`: passed for ESM, CommonJS and declarations.
- `npm run demo:build`: passed.
- `git diff --check`: passed, apart from harmless Windows line-ending notices.

The lab build still reports a 986 kB initial JavaScript chunk. This is a known remaining task, not a failed build.

## Completed work

Existing reviewable commits on this branch:

- `64c8a25 fix: harden guarded loader generations`
- `d80098e feat: make research captures reproducible`
- `09581e5 fix: keep unowned cache eviction inert`

The checkpoint commit after this document also contains:

- cache protection reclaiming a microtask-pending resource;
- deeply frozen diagnostic scope records;
- render-target attachment suppression across mixed roots;
- retryable synchronous loader and loader-extension failures;
- focused regressions for all of the above;
- accessible lab controls, tables, axe checks and responsive browser tests;
- a visible four-behaviour comparison table in the lab;
- a synchronous UI operation lock preventing overlapping suite and scenario runs;
- preliminary lazy imports in `ResearchApp`;
- package consumer tree-shaking checks, package metadata and release documentation updates;
- research schema v2, exact build-time package versions, collision-safe JSON/CSV capture, citation metadata and data licence.

## Highest-priority remaining work

1. Finish real code splitting.

   `demo/src/main.tsx` still statically imports `webgl-lab` and `research-lab` for `window.__disposeGuard`. Replace those functions with async dynamic-import wrappers. Update `demo/src/types.ts`, including making `runSharedProof` return a promise. Rebuild and confirm the initial chunk is materially smaller.

2. Add the missing real browser R3F stories.

   The browser suite still needs mounted `useGuardedLoader` cache reuse, final eviction, fresh reload, React Strict Mode same-tick remount and actual R3F Canvas unmount/remount. The current cache and canvas research proofs are mostly imperative simulations. Assert the native WebGL handle survives the first shared release and final eviction disposes exactly once.

3. Harden reference validation.

   `scripts/research-data.mjs` must require all four exact package versions and reject ranges, tags and non-string values. The committed JSON Schema is not currently executed by `scripts/verify-reference.mjs`; either validate against it or make the handwritten validator equivalently strict and test it.

4. Capture the real public schema-v2 dataset.

   First commit all code so the tree is clean. Then run `npm run benchmark:capture`, which performs the required five 50-cycle runs across all six scenarios. Add `benchmarks/reference.json` pointing to the generated JSON and CSV. Do not edit captured values by hand.

   Update `scripts/render-benchmark-chart.mjs` so its default source comes from the manifest, regenerate `docs/benchmark-result.svg`, and make `npm run benchmark:verify` pass. The current verifier intentionally fails because the manifest does not yet exist.

5. Replace the historical README measurements.

   `README.md` still presents the 21 August schema-v1 declarative-style result. Replace it only with the newly captured schema-v2 values. Say “five repeated runs, not statistically independent”. Link the JSON, CSV and reference manifest. Label the actual native R3F line correctly.

6. Fix CommonJS declaration resolution.

   Nest `types` under the `import` and `require` export conditions in `package.json`, using `.d.ts` for imports and `.d.cts` for requires for all three entry points. Make `scripts/package-smoke.mjs` traverse nested exports and typecheck a `.cts` consumer as well as the current ESM consumer.

7. Complete documentation corrections.

   - Put cache eviction inside a named later lifecycle function in README and lab quick-start examples, rather than executing it at module load.
   - State that Three.js is a required peer while React and R3F are optional peers.
   - Align the Node 20 statement with `engines.node`, or remove the consumer engine restriction if the built package supports older Node versions.
   - Include `docs/` in the npm tarball or replace packaged README links with absolute GitHub links.
   - Narrow the loader-error wording: public R3F may wrap a loader failure while retaining its original message, so do not promise Error object identity without a mounted-hook regression proving it.
   - Add the live lab link prominently near the README title.
   - Use exact event names: `disposal-scheduled`, `disposal-cancelled` and `dispose-error`.
   - In `docs/release.md`, install Chromium, Firefox and WebKit before `release:check` and describe npm 404 as “not currently published”, not a guarantee of name acceptance.
   - Document that the first short-lived granular npm token needs bypass-2FA publishing and should be an `npm` environment secret.
   - Remove or populate any empty changelog heading.

8. Re-run every gate after the above changes.

   Run `npm run check`, `npm run test:browser:all`, `npm run package:check`, `npm run benchmark:verify`, the React 18/R3F 8 compatibility set, `npm audit`, and `npm pack --dry-run --json`. Apply the React best-practices review after the final TSX edits.

## Publication state and external gates

- GitHub repository is public under `OskarasM`.
- The npm name `three-dispose-guard` returned 404 at the last check, which means it was not currently published. Recheck immediately before release.
- npm is not authenticated in this environment and the GitHub repository has no `NPM_TOKEN` secret.
- The GitHub `npm` environment does not yet exist.
- The Vercel project exists and the current production URL responds, but it contains an older build.

After all local and pull-request checks pass:

1. Push this feature branch and open a draft pull request.
2. Wait for every protected CI and Vercel preview check.
3. Merge to `main` only when green.
4. Verify the new production Vercel deployment.
5. Create the protected GitHub `npm` environment and add the authorised short-lived first-publish token.
6. Tag `v0.1.0` only after npm authentication is ready, then watch the provenance publish and GitHub release.
7. Configure npm trusted publishing after the first package exists, then remove `NPM_TOKEN`.

Do not commit credentials and do not tag while npm authentication is absent.
