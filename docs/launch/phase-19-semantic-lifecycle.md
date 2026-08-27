# Launch: Semantic lifecycle colors and aggregate readiness

> Status: shipped in `0.1.0-beta.7`
> Date: 2026-08-26

## Released behavior

Side Glance beta.7 makes semantic Status the default, adds explicit Heat
and Custom theme control, learns optional Heat ceilings from recent provider-local
turn durations, and keeps Claude Working while bounded known aggregate work
remains. README, package README, setup, CLI help, architecture, protocol, and the
homepage use the same meanings and claim boundary.

The release migrates persisted runtime state from schema 1 to schema 2 and
upgrades existing managed Claude integrations from seven to nine hook groups.
Both changes preserve compatible state and unrelated provider configuration.

## Release sequence

1. Merge the reviewed feature branch through protected `staging`; require every
   CI and Vercel check for the exact merge SHA.
2. Recheck the registry and tags, then prepare the next unused beta in a fresh
   release-only branch from current `staging`: package version, lockfile,
   changelog section/link, launch record, and current-version fixtures.
3. Release preparation PR #65 merged to protected `staging`; rerun every gate
   from release-preparation SHA
   `ffee005ea4986c20c8ce7a0a86a7e9845c6db13e`, then merge literal `staging` →
   `main` promotion PR #66.
4. Merge-commit the exact green staging head to protected `main`; verify main CI
   and Vercel production at `https://side-glance.vercel.app` for that SHA.
5. Create and push one protected annotated version tag at the verified main SHA.
   Let `release.yml` build, attest, publish npm `beta`, and create the immutable
   GitHub prerelease.
6. Verify npm integrity/provenance/dist-tags, GitHub assets/checksums/attestations,
   and fresh public `npx` enhanced/static smokes.
7. Only then open the generated-formula PR in `AndrewUlloa/homebrew-tap`; merge
   after all platform checks and finish with a public Homebrew smoke.

## Stop conditions

- Never tag or publish from this feature branch.
- Recheck that the planned beta is unused immediately before version preparation.
- Never move, delete, or reuse a protected version tag; fix forward instead.
- Never move npm `latest` to a beta.
- Do not update Homebrew before immutable release assets exist.
- Do not claim `sideglance.ai` is live until public DNS and TLS resolve.
- If a protected check, deployment SHA, or public artifact disagrees, stop and
  repair through the next protected forward path.

## Public verification checklist

- [x] Protected feature PR #64 merged to `staging` with exact-SHA checks green.
- [x] Next unused beta preparation merged to `staging` with full gates green.
- [x] Literal `staging` promoted to `main`; production Vercel SHA verified.
- [x] Protected annotated tag workflow green.
- [x] npm `beta`, integrity, and provenance match the release manifest.
- [x] GitHub prerelease, native archives, `SHA256SUMS`, and attestations match.
- [x] Fresh public enhanced/static npx and native archive smokes pass.
- [x] Homebrew formula PR checks and post-merge public smoke pass.
