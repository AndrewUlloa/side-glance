# Changelog

Notable user-facing changes are recorded here. Side Glance follows [Semantic Versioning](https://semver.org/) while beta releases may still change configuration contracts with explicit migration notes.

## [Unreleased]

### Added

- The landing-page lifecycle demo now switches interactively between semantic
  Status and duration-based Heat using the same production theme model as the
  CLI, with explicit success, failure, quiet-turn, and adaptive-ceiling copy.

### Fixed

- Installed managed hooks now acknowledge targetless provider subprocesses
  instead of surfacing a failed hook when Codex or another provider does not
  expose a controlling terminal. Reliable per-terminal colors still use the
  supervised wrapper.

## [0.1.0-beta.8] — 2026-08-26

### Changed

- Guided setup keeps the Recommended path concise while Customize now includes
  the shared Status, Heat, and Custom color selector. Review and completion show
  the choice, and colors save only after provider configuration verifies.

## [0.1.0-beta.7] — 2026-08-26

### Added

- Guided `side-glance theme` control with semantic Status, adaptive or fixed
  Heat, validated Custom lifecycle pairs, JSON automation, and safe reset.
- Claude subagent start/stop coverage plus bounded background-task and
  session-cron snapshots so known work in flight delays Ready.

### Changed

- Interactive setup now names provider CLI commands found or skipped on the
  invoking Terminal's `PATH`, presents a decision-only review, abbreviates home
  paths, and finishes with one readiness summary plus the next launch command.
- An existing durable installation now owns the complete human `npx init`
  transcript without a redundant bootstrap footer; failed handoffs report a
  bounded cause and direct retry and diagnostic commands.
- Status is now the default lifecycle palette: Ready stays green at every turn
  duration and Failed alone is red. The earlier completion ramp remains an
  explicit Heat preset.
- Adaptive Heat now learns a private provider-local ceiling from the newest 12
  eligible completed-turn durations using a bounded, rate-limited p80. It no
  longer substitutes response latency for turn-duration history.
- Runtime state migrates from schema 1 to schema 2 without losing sessions,
  surface snapshots, replay IDs, or compatible legacy timing data.

## [0.1.0-beta.6] — 2026-08-25

### Added

- Interactive `init` and bootstrap choices now support Up/Down navigation, Space
  toggles for multiple selections, Enter to continue, and a protected static
  fallback for non-TTY, no-color, dumb, and accessible terminal sessions.

### Changed

- Guided setup now opens with a concise recommended/customize/exit decision,
  progressively reveals advanced provider and notification choices, and shows
  write-and-verify progress only after final approval.

## [0.1.0-beta.5] — 2026-08-25

### Fixed

- Bare Homebrew invocations now recover and retain the stable `side-glance` bin
  symlink by matching it to the running executable identity, so the canonical
  `side-glance init` journey can create a safe provider plan without requiring
  an explicit `--executable` path.

## [0.1.0-beta.4] — 2026-08-25

### Added

- Guided `side-glance init` onboarding with an exact `side-glance setup` alias,
  read-only preview, provider detection, notification recommendations, explicit
  automation flags, post-write verification, and re-runnable repair.
- A staged `npx side-glance@beta init` bootstrap that keeps ephemeral npm-cache
  paths out of provider hooks and hands setup to an exact-version durable install.

### Changed

- Homebrew followed by `side-glance init` is now the canonical installed journey;
  direct `install`, `uninstall`, `doctor`, and `run` commands remain available for
  advanced use and recovery.
- Notification guidance now states the event coverage for each provider, defaults
  Side Glance alerts off when native delivery is ready or unknown, and avoids
  claiming a universal completion bell.

### Fixed

- Multi-provider setup rolls back caught apply and verification failures in reverse
  order without overwriting a concurrent external edit. Power loss and `SIGKILL`
  remain an explicit partial-setup boundary repaired by the next `init` or `doctor`.

## [0.1.0-beta.3] — 2026-08-24

### Added

- Capability-matrix diagnostics that separate provider binaries, native alerts,
  adapters, installed integration, stable surfaces, overrides, and live evidence.
- Phase-specific tmux markers and an opt-in, sanitized terminal-title fallback.

### Changed

- Completed heat now uses completed-turn duration and per-session response-latency
  history instead of time spent sitting Ready.
- Provider hook stdout is reduced to provider-safe acknowledgements; semantic wait
  events are deduplicated and managed hook timeouts are explicitly bounded.
- Claude/Codex/Gemini completion hooks are labeled pre-final and do not ring Ready
  while the provider can still block or retry.
- OpenCode targets stable v1 only, now supports colors without alerts, and rejects
  the incompatible v2 beta. Aider uses only its documented static callback.
- The verified Vercel hostname and R2 development URL remain defaults until custom
  DNS and TLS are actually active.
- Compatible Babel, brace-expansion, esbuild, and js-yaml development-tool fixes
  bring both full and production-only npm audits to zero vulnerabilities.
- A reviewed main-ruleset payload adds the existing `require-staging-head` check
  without weakening the live pull-request, history, or CI protections.
- Release provenance now uses the current pinned `actions/attest` v4 contract and
  its required artifact-metadata permission instead of the legacy wrapper action.

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

[Unreleased]: https://github.com/AndrewUlloa/side-glance/compare/v0.1.0-beta.8...HEAD
[0.1.0-beta.8]: https://github.com/AndrewUlloa/side-glance/releases/tag/v0.1.0-beta.8
[0.1.0-beta.7]: https://github.com/AndrewUlloa/side-glance/releases/tag/v0.1.0-beta.7
[0.1.0-beta.6]: https://github.com/AndrewUlloa/side-glance/releases/tag/v0.1.0-beta.6
[0.1.0-beta.5]: https://github.com/AndrewUlloa/side-glance/releases/tag/v0.1.0-beta.5
[0.1.0-beta.4]: https://github.com/AndrewUlloa/side-glance/releases/tag/v0.1.0-beta.4
[0.1.0-beta.3]: https://github.com/AndrewUlloa/side-glance/releases/tag/v0.1.0-beta.3
[0.1.0-beta.2]: https://github.com/AndrewUlloa/side-glance/tree/v0.1.0-beta.2
[0.1.0-beta.1]: https://www.npmjs.com/package/side-glance/v/0.1.0-beta.1
