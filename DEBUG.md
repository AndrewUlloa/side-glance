# Vercel preview upload failure

## Observations

- Environment: macOS arm64, Vercel CLI 54.18.0, linked project `andrew-243s-projects/terminal-signal`.
- The first preview upload attempted 267.8 MB, reached 67 MB, then failed before deployment creation with an OpenSSL `bad record mac` TLS error.
- `vercel deploy --dry` selected 222 files totaling 281,535,211 bytes.
- `work/` contributed 240,771,924 bytes and `outputs/` contributed 38,280,624 bytes.
- Vercel already ignored `.next`, `.vercel`, `node_modules`, `.git`, and `.env.local`.

## Hypotheses

### H1: Release rehearsal artifacts inflated the upload (ROOT HYPOTHESIS)

- Supports: `work/` plus `outputs/` account for 99.1% of the selected bytes and closely match the failed upload size.
- Conflicts: none.
- Test: inspect Vercel's dry-run selection and sizes.

### H2: Next.js or dependency build output inflated the upload

- Supports: `.next` is 34 MB and `node_modules` is 800 MB locally.
- Conflicts: the dry run explicitly lists both as ignored.
- Test: inspect Vercel's ignored-file list.

### H3: The failure was only a transient Vercel TLS fault

- Supports: the immediate error occurred in TLS transport.
- Conflicts: the upload included two 120 MB binaries unrelated to the website; retrying the same payload leaves the avoidable failure condition intact.
- Test: reduce selected deployment bytes, then retry once.

## Experiments

`vercel deploy --dry` confirmed H1 without changing source: `work/` and `outputs/` were selected while `.next` and `node_modules` were already ignored.

## Root Cause

Vercel CLI does not infer every generated directory from `.gitignore`; the repository lacked a `.vercelignore`, so native release rehearsal artifacts dominated the preview upload.

## Fix

Add a test-covered `.vercelignore` for non-site generated artifacts, verify the dry-run payload is bounded, and retry the preview deployment.

---

# Clean-CI rendered HTML failure after the Vercel-only migration

## Observations

- GitHub Actions run `31664448256`, job `94335901839`, failed only in `tests/rendered-html.test.mjs` after a successful standard `next build`.
- The exact error was `ERR_MODULE_NOT_FOUND` for `dist/server/index.js`.
- That path was the removed vinext Worker output; standard Next.js writes the prerendered homepage to `.next/server/app/index.html`.
- The test passed locally because an ignored, stale `dist/server/index.js` remained from the previous vinext build. The file is not tracked, so it does not exist in a clean checkout.
- Unit, integration, distribution, site-contract, Next build, npm compatibility, and native artifact checks passed.

## Hypotheses

### H1: The rendered-output test still targets vinext output, and stale local state masked it (ROOT HYPOTHESIS)

- Supports: the failing path is `dist/server/index.js`; the test imports that exact path; local `dist/server/index.js` exists but is untracked; Next produced `.next/server/app/index.html` in both local and CI builds.
- Conflicts: none.
- Test: prove the old file is untracked and the Next artifact exists after `next build`.

### H2: Next.js emits a different output layout on Linux

- Supports: the failure occurred on Linux CI and not on local macOS.
- Conflicts: the log fails before reading any Next artifact; both environments report the same static route, and the test explicitly asks for vinext's `dist` path.
- Test: inspect the CI build route output and local `.next/server/app` layout.

### H3: CI did not run the site build before the rendered-output test

- Supports: a missing generated file can mean a missing build step.
- Conflicts: the log records a successful `next build` immediately before the failing test.
- Test: inspect command ordering in the workflow log.

## Experiments

- H1 confirmed without source changes: `test -f dist/server/index.js` succeeds locally while `git ls-files dist/server/index.js` returns nothing; `.next/server/app/index.html` exists after the canonical build.
- H2 rejected: the successful CI route report matches the local build, and no platform-specific output was requested by the test.
- H3 rejected: CI completed the Next.js build directly before executing `tests/rendered-html.test.mjs`.

## Root Cause

The Vercel-only migration changed the canonical build output from vinext's ignored `dist/server` tree to Next.js's `.next/server/app` tree, but the rendered HTML test kept importing the obsolete path, and a stale local artifact hid that dependency.

## Fix

Read and assert against Next.js's generated `.next/server/app/index.html`, add a regression assertion forbidding the obsolete `dist/server/index.js` reference, and verify after removing generated output and rebuilding.
