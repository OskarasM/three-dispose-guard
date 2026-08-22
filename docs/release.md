# Release and deployment

This project uses authorised sessions only. Tokens, project IDs and registry credentials must never be committed.

## Release gate

From a clean checkout:

```bash
npm ci
npm run release:check
git diff --exit-code
npm pack --dry-run
```

Confirm that the package is still named `three-dispose-guard` immediately before tagging:

```bash
npm view three-dispose-guard
```

A not-found response means the unscoped name is available. If another owner has claimed it, rename the package and import examples to `@oskarasm/three-dispose-guard` before release.

## GitHub

The public repository lives under `OskarasM`. Merge only after every required CI and Vercel preview check passes. Keep branch protection enabled and accept vulnerability reports through private security advisories.

## npm provenance

The first publication needs one short-lived npm credential because trusted publishing can only be attached after the package exists:

1. Create a granular npm access token with the minimum package publishing permission and an immediate expiry.
2. Store it as the GitHub Actions secret `NPM_TOKEN`. Never put it in a local file.
3. Create the protected `npm` GitHub environment.
4. Push an annotated `v0.1.0` tag that matches `package.json`.
5. Watch the release workflow complete its checks, provenance publish and GitHub release.

After the first package exists, configure npm trusted publishing with:

- organisation or user: `OskarasM`;
- repository: `three-dispose-guard`;
- workflow: `release.yml`;
- environment: `npm`.

Remove `NPM_TOKEN` after the trusted publisher is active. Future releases use GitHub's short-lived OpenID Connect identity.

Do not create a classic or long-lived automation token.

## Vercel

Import the GitHub repository into Vercel with the repository root as the project root. The committed `vercel.json` builds `site-dist` with `npm run demo:build`.

Vercel Git integration should provide:

- a production deployment from `main`;
- an isolated preview deployment for each pull request;
- deployment status checks on the pull request.

No environment variables are required by the static lab.

## After publication

Verify installation in a clean directory:

```bash
npm install three three-dispose-guard
node -e "console.log(typeof require('three-dispose-guard').createResourceRegistry)"
```

Then check the npm provenance badge, GitHub release, production lab, raw JSON and CSV downloads, and all export links in the README. Run `npm run package:check` against the published tarball if installation differs from the release candidate.
