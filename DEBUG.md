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
