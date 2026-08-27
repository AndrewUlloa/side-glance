# Launch: Concise guided setup output

> Status: shipped in `0.1.0-beta.7`
> Date: 2026-08-26

## Released behavior

Side Glance beta.7 presents provider detection, setup review, completion,
and the launch command in concise user language. A successful
`npx side-glance@beta init` handoff no longer appends an internal bootstrap
footer, while known handoff failures identify the bounded cause and recovery
commands.

The release does not change provider detection, provider hooks, notification
defaults or coverage, lifecycle colors, configuration targets, JSON schemas,
supported platforms, or npm's `latest` tag.

## Release sequence

1. Merged the reviewed feature through protected `staging` in PR #60.
2. Prepared beta.7 in a release-only branch, including the manifest, lockfile,
   changelog, launch record, and version fixtures.
3. Merged release preparation into protected `staging`, then promoted that exact
   green head to protected `main`.
4. Created the protected annotated `v0.1.0-beta.7` tag at the green `main` merge
   commit; `release.yml` assembled, attested, staged, and published the npm
   `beta` package and immutable GitHub prerelease.
5. Verified npm integrity, provenance, and dist-tags; verified GitHub archives,
   checksums, and attestations; ran fresh public enhanced and static `npx` setup
   smokes.
6. Merged and verified the generated Homebrew formula in tap PR #5 after the
   immutable release artifacts existed.

## Stop conditions

- Do not publish or tag from this feature branch.
- Never reuse an already-published beta version or move npm `latest` to a beta.
- Do not update Homebrew before immutable release assets exist.
- If protected CI or public artifact verification fails, stop promotion and fix
  forward with the next unused beta version.

## Public verification checklist

- [x] Protected feature PR merged to `staging` in PR #60.
- [x] Beta.7 release preparation merged to `staging`.
- [x] `staging` promoted to `main`; required checks green.
- [x] Protected annotated tag workflow green.
- [x] npm `beta`, integrity, and provenance match the release manifest.
- [x] GitHub prerelease, archives, checksums, and attestations match.
- [x] Fresh public enhanced, `NO_COLOR`, and existing-install `npx` smokes pass.
- [x] Homebrew formula PR checks and post-merge smoke pass.
