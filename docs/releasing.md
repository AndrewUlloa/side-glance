# Releasing Side Glance

Side Glance releases are assembled once from a protected version tag. The exact npm tarball and native archives are tested, checksummed, attested, staged as a draft GitHub release, published to npm, and only then made visible. Homebrew tap updates remain a separate credential boundary.

## One-time public setup

The repository already has protected `main` and `v*` refs, tag-restricted `github-release` and `npm-release` environments, Discussions, and squash/rebase merge hygiene. These remaining external changes require the repository owner's explicit approval and cannot be completed by a local test:

1. Make `AndrewUlloa/side-glance` public.
2. Enable private vulnerability reporting and immutable releases after the repository is public.
3. Add required reviewers to the existing `github-release` and `npm-release` environments after the repository plan makes that control available.
4. Reserve `side-glance` on npm. If npm requires a bootstrap publish before trusted publishing can be configured, use a one-time short-lived granular token in the protected environment and revoke it immediately.
5. Configure npm trusted publishing for owner `AndrewUlloa`, repository `side-glance`, workflow `release.yml`, and environment `npm-release`; then disallow legacy automation tokens.
6. Create `AndrewUlloa/homebrew-tap` only after the first immutable release exists, and update it through a narrowly scoped pull request rather than this repository's release token.

## Release pull request

1. Update `packages/cli/package.json`, `CHANGELOG.md`, and launch copy together.
2. Keep prereleases on npm's `beta` dist-tag. A stable version must deliberately change `publishConfig.tag` to `latest`.
3. Run every local gate and merge through protected `main`.
4. Create and push an annotated `v<version>` tag only after the merged commit is green.

The release workflow rejects private repositories, forks, unprotected tags, tags that do not match the CLI version, tags not reachable from `main`, mutable action references, and artifacts that do not match the assembled manifest.

## Artifact policy

- Supported beta artifacts: macOS arm64, Linux x64 glibc, and Linux arm64 glibc.
- Intel macOS is an experimental beta artifact because Node does not regularly test that SEA path.
- Windows, Alpine/musl, and other platforms are not supported yet.
- macOS artifacts are ad-hoc signed for Mach-O launch unless a protected signing job with Developer ID and notarization is added. Do not call them Apple-notarized or Developer-signed.
- `SHA256SUMS` authenticates downloaded bytes only when obtained through the trusted GitHub release. GitHub attestations provide the workflow provenance record.

## Recovery and retry

The GitHub release remains a draft until npm succeeds. A retry downloads existing draft assets and byte-compares them; mismatches require a new version. If npm already has the version, its SHA-512 integrity must match the release manifest. The workflow never clobbers an asset or republishes different bytes under one version.

After the release finishes, download the public artifacts again, verify `SHA256SUMS`, execute the Linux x64 binary, compare npm integrity, and open a separate Homebrew tap pull request using the generated `side-glance.rb`.
