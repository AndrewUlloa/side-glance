# Launch: Concise guided setup output

> Status: merged to `staging` in PR #60; included in the beta.7 candidate
> Date: 2026-08-26

## Candidate behavior

The next Side Glance beta presents provider detection, setup review, completion,
and the launch command in concise user language. A successful
`npx side-glance@beta init` handoff no longer appends an internal bootstrap
footer, while known handoff failures identify the bounded cause and recovery
commands.

The candidate does not change provider detection, provider hooks, notification
defaults or coverage, lifecycle colors, configuration targets, JSON schemas,
supported platforms, or npm's `latest` tag.

## Release sequence

1. Completed: merge the reviewed feature through protected `staging`.
2. Prepare the next unused beta version in a release-only branch: manifest,
   lockfile, changelog section/link, launch record, and version fixtures.
3. Merge release preparation into protected `staging`, then promote that exact
   green head to protected `main`.
4. Create one protected annotated version tag at the green `main` merge commit;
   let `release.yml` assemble, attest, stage, publish the npm `beta` tag, and
   create the immutable GitHub prerelease.
5. Verify npm integrity, provenance, and dist-tags; verify GitHub archives,
   checksums, and attestations; run fresh public enhanced and static `npx` setup
   smokes.
6. Open and verify the generated Homebrew formula pull request only after the
   immutable release artifacts exist.

## Stop conditions

- Do not publish or tag from this feature branch.
- Never reuse an already-published beta version or move npm `latest` to a beta.
- Do not update Homebrew before immutable release assets exist.
- If protected CI or public artifact verification fails, stop promotion and fix
  forward with the next unused beta version.

## Public verification checklist

- [x] Protected feature PR merged to `staging` in PR #60.
- [ ] Next beta release preparation merged to `staging`.
- [ ] `staging` promoted to `main`; required checks green.
- [ ] Protected annotated tag workflow green.
- [ ] npm `beta`, integrity, and provenance match the release manifest.
- [ ] GitHub prerelease, archives, checksums, and attestations match.
- [ ] Fresh public enhanced, `NO_COLOR`, and existing-install `npx` smokes pass.
- [ ] Homebrew formula PR checks and post-merge smoke pass.
