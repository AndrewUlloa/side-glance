# Launch: Arrow-key guided setup

> Status: shipped in 0.1.0-beta.6
> Date: 2026-08-25

## Candidate behavior

Beta.6 made the durable `side-glance init` and staged `npx side-glance@beta init`
choices navigable with Up/Down, Space, and Enter. It added
recommended/customize/exit progressive disclosure, truthful post-approval progress,
an exact concise review, and a numbered accessibility fallback.

The candidate does not change provider detection, provider hooks, notification
coverage, lifecycle colors, configuration targets, JSON schemas, supported
platforms, or npm's `latest` tag.

## Release sequence

1. Merge the reviewed feature through protected `staging`.
2. Prepare the next unused beta version in a release-only branch: manifest,
   lockfile, changelog section/link, launch record, and current-version fixtures.
3. Merge release preparation into protected `staging` and promote the exact green
   staging head to protected `main`.
4. Create and push one protected annotated `v<version>` tag at the green `main`
   merge commit. Let `release.yml` assemble, attest, stage, publish npm `beta`,
   and expose the immutable GitHub prerelease.
5. Verify npm integrity/dist-tags, GitHub assets/checksums/provenance, and fresh
   public `npx side-glance@beta init` enhanced plus static flows.
6. Open the separate generated-formula pull request in `AndrewUlloa/homebrew-tap`;
   merge only after its platform checks pass, then smoke the public Homebrew flow.

## Stop conditions

- Never tag or publish as the already-used beta.5 version.
- Never move npm `latest` to a prerelease.
- Do not update the tap before immutable release assets exist.
- If protected CI or public artifact verification fails, stop promotion and fix
  forward with the next beta; do not move or replace a protected version tag.

## Public verification checklist

- [x] Protected feature PR merged to `staging`.
- [x] Beta.6 release preparation merged to `staging`.
- [x] `staging` promoted to `main`; required checks green.
- [x] Protected annotated tag workflow green.
- [x] npm `beta`, integrity, and provenance match the release manifest.
- [x] GitHub prerelease, native archives, `SHA256SUMS`, and attestations match.
- [x] Fresh public npx enhanced and `NO_COLOR` smokes pass.
- [x] Homebrew tap PR checks and post-merge smoke pass.
