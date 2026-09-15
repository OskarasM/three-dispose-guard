# State

Updated: 2026-09-15

Overwritten, not appended. History goes to CHANGELOG.md (releases) and git. Max 150 lines. Not shipped in the npm tarball.

## Stage

Maintained. Version 0.1.1 is published on npm with provenance (2026-08-25) and the research lab is live at https://three-dispose-guard.vercel.app, deployed from `main` at fb0c29a. No library source change since 0.1.0; no open issues or pull requests before this setup branch.

## Now

Max 3 items.

- [ ] Review the agent setup pull request (AGENTS.md contract, vendored contract checker in CI, project docs) - gives every agent the same rules and a checked definition of done - branch `chore/agent-setup`, draft PR

## Blockers

- none

## Open questions for the owner

- Success metric: the repository documents quality gates but no adoption or usage target. Is there one (for example npm downloads, issues from real users), or is "correct and maintained" the goal?
- Reference dataset: the committed capture is schema v1 (2026-08-21); CONTRIBUTING.md describes schema v2. Capture a schema-v2 reference from a clean commit, or keep v1 as the published reference?
- The two moderate `npm audit` findings are in the Vitest dev toolchain; the offered fix is a major upgrade to Vitest 5. Schedule it, or accept for now?

## Last verified

2026-09-15: `npm ci`, `npm run check`, `npm run test:browser:all`, `npm run package:check`, `npm run benchmark:chart`, `npm pack --dry-run` - all pass (38 unit tests; Chromium 18/18, Firefox and WebKit smoke 6/6; chart unchanged; 26 packed files).

- Revision: fb0c29a (clean worktree of origin/main), repeated on the setup branch.
- Working directory: repository root. Browser tests ran with `THREE_DISPOSE_GUARD_TEST_PORT=4273` because another local process held port 4173.
- Evidence: pull request CI run for the setup branch; last `main` CI run 32875821619 passed on fb0c29a.
