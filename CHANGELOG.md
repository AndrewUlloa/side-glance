# Changelog

Notable user-facing changes are recorded here. Side Glance follows [Semantic Versioning](https://semver.org/) while beta releases may still change configuration contracts with explicit migration notes.

## [Unreleased]

## [0.1.0-beta.3] — 2026-08-18

### Fixed

- Pass npm package tarballs as explicit relative paths so npm 11 does not
  interpret `release/*.tgz` as a GitHub repository shorthand during dry-run or
  trusted publication.

## [0.1.0-beta.2] — 2026-08-18 (unpublished)

The protected beta.2 tag remains an audit record of a release attempt that
stopped at the npm dry-run before any npm package or GitHub Release was
published. Beta.3 contains the same product changes plus the release-path fix.

### Added

- Public release rehearsal with exact npm packaging, standalone artifacts, centralized checksums, release metadata, Homebrew formula generation, and protected-tag automation.
- Opt-in native desktop notifications for accepted ready, attention, failure, and cancellation events, with privacy-safe multi-session labels and configurable macOS sound.
- Notification-enabled provider hook installation, an owned OpenCode plugin, an Aider completion bridge, generic process-exit alerts, and notification readiness diagnostics.

### Changed

- Public deployment now requires immutable GitHub Releases, SHA-pinned Actions,
  protected Vercel checks, and npm OIDC publishing with SemVer-derived release channels.
- Future releases are licensed under Apache-2.0, adding an explicit patent grant;
  the already-published beta.1 release remains available under its original MIT terms.

## [0.1.0-beta.1] — 2026-08-14

### Added

- Serialized lifecycle controller with generation and turn ordering.
- Multi-session surface leases and bounded recovery.
- Terminal and tmux renderers with ownership-aware cleanup.
- Claude Code, Codex, and Gemini hook installers plus generic supervised execution.
- Doctor, status, preview, reset, install, uninstall, event, and run commands.
- Interactive product site using the real phase and urgency model.

[Unreleased]: https://github.com/AndrewUlloa/side-glance/compare/v0.1.0-beta.3...HEAD
[0.1.0-beta.3]: https://www.npmjs.com/package/side-glance/v/0.1.0-beta.3
[0.1.0-beta.2]: https://github.com/AndrewUlloa/side-glance/tree/v0.1.0-beta.2
[0.1.0-beta.1]: https://www.npmjs.com/package/side-glance/v/0.1.0-beta.1
