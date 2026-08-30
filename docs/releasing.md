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
`side-glance@0.1.0-beta.1` package. npm trusted publishing is configured for
owner `AndrewUlloa`, repository `side-glance`, workflow `release.yml`, and
environment `npm-release`; publishing is allowed while staged publishing is not,
and no legacy npm automation token is used by this repository. Required
environment reviewers can be added when a
second qualified release operator is available.

`AndrewUlloa/homebrew-tap` is public and provides the supported third-party tap
command `brew install AndrewUlloa/tap/side-glance`. Its protected `main` branch is
updated through narrowly scoped pull requests, and `brew test-bot` validates Linux
x64, Apple Silicon macOS, and experimental Intel macOS independently. Linux arm64
is supported by the release artifact and formula but is not a separate tap CI
runner. The release workflow only generates `side-glance.rb`; it has no credential
that can update the tap.

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

## npm dist-tag policy

Prereleases update only npm's `beta` tag; stable releases update `latest`. The
initial beta.1 publication also left `latest` pointing at beta.1, so the v0.1.0
stable workflow must deliberately replace it. Check the live dist-tags instead
of encoding their current value in release copy. Do not move `latest` to another prerelease: [npm's dist-tag
contract](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/) recommends channels
such as `beta` for unstable versions and reserves `latest` for the normal unqualified
install path.

npm rejects removing this package's `latest` tag, so cleanup is not a beta release
step. [Trusted-publishing OIDC](https://docs.npmjs.com/trusted-publishers/) supports
`npm publish`, not arbitrary dist-tag maintenance; the release workflow must not gain
a long-lived token for that purpose. Stable public installation examples use
`side-glance@latest`; prerelease testing remains explicit about
`side-glance@beta`.

## Artifact policy

- Supported v0.1 artifacts: macOS arm64, Linux x64 glibc, and Linux arm64 glibc.
- Intel macOS is an experimental artifact because Node does not regularly test that SEA path.
- Windows, Alpine/musl, and other platforms are not supported yet.
- macOS artifacts are ad-hoc signed for Mach-O launch unless a protected signing job with Developer ID and notarization is added. Do not call them Apple-notarized or Developer-signed.
- `SHA256SUMS` authenticates downloaded bytes only when obtained through the trusted GitHub release. GitHub attestations provide the workflow provenance record.

## Recovery and retry

The GitHub release remains a draft until npm succeeds. A retry downloads existing draft assets and byte-compares them; mismatches require a new version. If npm already has the version, its SHA-512 integrity must match the release manifest. The workflow never clobbers an asset or republishes different bytes under one version.

Do not move or delete a protected version tag after a workflow defect. If the
tagged workflow itself must change before publication, keep the failed tag as an
audit record, fix and test the workflow through protected branches, bump the
package to the next version, and create a new annotated tag. A transient retry is
appropriate only when the tagged workflow and its assembled bytes remain valid.

After the release finishes, verify GitHub's immutable-release attestation,
download the public artifacts again, verify `SHA256SUMS`, execute the Linux x64
binary, compare npm integrity, verify that the intended dist-tag moved while the
other channel did not, and
open a separate pull request in
`AndrewUlloa/homebrew-tap` using the generated `side-glance.rb`. Merge that pull
request only after every `brew test-bot` platform passes.
