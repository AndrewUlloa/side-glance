# Releasing Side Glance

Side Glance releases are assembled once from a protected version tag. The exact npm tarball and native archives are tested, checksummed, attested, staged as a draft GitHub release, published to npm, and only then made visible. Homebrew tap updates remain a separate credential boundary.

## Live release infrastructure

`AndrewUlloa/side-glance` is public. Protected `main`, `staging`, and `v*` refs,
tag-restricted `github-release` and `npm-release` environments, immutable
releases, private vulnerability reporting, Dependabot security updates, secret
scanning with push protection, and repository-wide full-SHA Action enforcement
are enabled. Pull requests to both protected branches require the Linux test and
coverage job, Node 22 and 24 package checks, the native macOS package check, and
the Vercel preview check.

Initial npm ownership is established by the published
`side-glance@0.1.0-beta.1` package. Before the next tag, confirm npm trusted publishing
for owner `AndrewUlloa`, repository `side-glance`, workflow
`release.yml`, and environment `npm-release`; no legacy npm automation token is
used by this repository. Required environment reviewers can be added when a
second qualified release operator is available. Create `AndrewUlloa/homebrew-tap`
only after the first immutable release exists, and update it through a narrowly
scoped pull request rather than this repository's release token.

## Release pull request

1. Update `packages/cli/package.json`, `CHANGELOG.md`, and launch copy together.
2. Keep prereleases on npm's `beta` dist-tag. A stable version must deliberately change `publishConfig.tag` to `latest`.
3. Run every local gate, merge the release PR into protected `staging`, then
   promote `staging` to protected `main`.
4. Create and push an annotated `v<version>` tag only after the merged commit is green.

The validator derives npm's `beta` or `latest` channel and GitHub's prerelease
state from the exact package SemVer. The workflow publishes the tarball assembled
from that tag with npm OIDC provenance; it never accepts a repository token.

The release workflow rejects private repositories, forks, unprotected tags, tags that do not match the CLI version, tags not reachable from `main`, mutable action references, and artifacts that do not match the assembled manifest.

## Artifact policy

- Supported beta artifacts: macOS arm64, Linux x64 glibc, and Linux arm64 glibc.
- Intel macOS is an experimental beta artifact because Node does not regularly test that SEA path.
- Windows, Alpine/musl, and other platforms are not supported yet.
- macOS artifacts are ad-hoc signed for Mach-O launch unless a protected signing job with Developer ID and notarization is added. Do not call them Apple-notarized or Developer-signed.
- `SHA256SUMS` authenticates downloaded bytes only when obtained through the trusted GitHub release. GitHub attestations provide the workflow provenance record.

## Recovery and retry

The GitHub release remains a draft until npm succeeds. A retry downloads existing draft assets and byte-compares them; mismatches require a new version. If npm already has the version, its SHA-512 integrity must match the release manifest. The workflow never clobbers an asset or republishes different bytes under one version.

After the release finishes, verify GitHub's immutable-release attestation,
download the public artifacts again, verify `SHA256SUMS`, execute the Linux x64
binary, compare npm integrity, and open a separate Homebrew tap pull request using
the generated `side-glance.rb`.
