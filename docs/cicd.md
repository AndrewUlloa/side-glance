# CI/CD

Side Glance uses the same promotion path as the reference projects:

```text
feature/*  -- pull request -->  staging  -- pull request -->  main
preview                           staging preview                 production
```

`main` is the only production branch. `staging` is the long-lived integration
branch, and each `feature/*` branch is a disposable unit of work created from the
latest `staging` commit. Fix, dependency, and agent branches follow the same pull
request path even when their generated prefix is not literally `feature/`.

Squash disposable feature branches into `staging`. Use a merge commit when
promoting `staging` to `main` so the long-lived branches retain shared ancestry
and the next promotion contains only new staged work.

## Gates

The `CI / verify` job runs for pull requests and pushes involving `main` or
`staging`, and for merge-queue groups. It installs the committed lockfile, then
runs lint, type checking, coverage, and the full test/build suite. Compatibility
and native-package jobs run beside it.

Linting is intentionally split by product surface. Ultracite with the Biome
engine checks and formats only the landing page (`app/`), its site tests, and the
Next/PostCSS configuration. ESLint continues to check the CLI, adapters, release
scripts, and non-site tests. These root development dependencies are not part of
the published `packages/cli` manifest or package files.

The `Branch Policy / require-staging-head` job runs on pull requests to `main`
and rejects every source branch except `staging`. This keeps feature work from
skipping the integration environment.

Husky installs local hooks during `npm install`/`npm ci`. The pre-commit hook
runs Biome through lint-staged only when landing-page files are staged. The
pre-push hook blocks direct pushes to `main` and `staging`; it is defense in
depth, not a replacement for GitHub's server-side rules.

## Deployments

Vercel Git integration owns deployments; GitHub Actions does not keep a second
Vercel token or create duplicate builds.

- A push to `feature/*` creates an ephemeral Preview deployment.
- A push to `staging` updates its stable Vercel branch URL.
- A merge to `main` creates the Production deployment at the verified Vercel alias,
  `https://side-glance.vercel.app`. `https://sideglance.ai` becomes canonical only
  after DNS and TLS verification.

The Vercel project must stay connected to `AndrewUlloa/side-glance`, with
Production Branch set to `main` and Node.js 24.x. Preview-only environment values
may be scoped to `staging` when the staging environment needs to differ. A custom
staging domain is optional; Vercel's stable branch URL is sufficient by default.
Production and Preview both receive the Cloudflare Web Analytics site token. Both
use the verified R2 development URL until `assets.sideglance.ai` is connected and
the explicit asset cutover checklist passes.

Rollback is a Vercel promotion of the last known-good production deployment. A
follow-up fix still moves through `staging` so the Git history and deployed state
reconcile normally.

## One-time GitHub setup

1. Create remote `staging` from the current protected `main` commit.
2. Protect both `main` and `staging` with rulesets that require a pull request,
   block force pushes and deletions, and require the same strict GitHub Actions
   checks: `CI / verify`, both `CI / npm-compatibility` matrix jobs, and
   `CI / native-macos-arm64`.
3. Add the `Branch Policy / require-staging-head` status check to the `main`
   branch rule only.
4. Keep squash merges enabled for feature PRs and merge commits enabled for
   `staging` to `main` promotions. Rebase merges are optional. Do not allow routine
   bypasses; use the repository owner's emergency path only for incident recovery.
5. Confirm Vercel's production branch is `main`, then merge a harmless feature
   through `staging` and verify all three deployment classes.

The ruleset is the actual merge boundary: a red or missing required check must
make the pull request unmergeable. The local hook only provides earlier feedback.
