# Release and deployment

This project uses authorised sessions only. Tokens, project IDs and registry credentials must never be committed.

## Release gate

From a clean checkout:

```bash
npm ci
npm run release:check
npm run test:browser:smoke
npm run benchmark:chart
git diff --exit-code
npm pack --dry-run
```

Confirm that the package is still named `three-dispose-guard` immediately before tagging:

```bash
npm view three-dispose-guard
```

A not-found response means the unscoped name is available. If another owner has claimed it, rename the package and import examples to `@oskarasm/three-dispose-guard` before release.

## GitHub

Create the public repository under `OskarasM`, push the verified `main` branch and enable branch protection for CI. The repository should use the MIT licence and accept vulnerability reports through private security advisories.

## npm provenance

Configure npm trusted publishing for the GitHub repository and the `release.yml` workflow. Create the protected `npm` GitHub environment. A signed `v0.1.0` tag then runs all release checks, publishes with provenance and creates the GitHub release.

Do not add a long-lived npm token when trusted publishing is available.

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

Then check the npm provenance badge, GitHub release assets, production lab, raw JSON and CSV downloads, and all export links in the README.
