# Spec: Signal

> Filed by: Codex root session
> Status: approved
> Last updated: 2026-08-12

## One-line Summary

Build a safe, local-first attention layer that lets any coding CLI report working, waiting, ready, failed, and inactive state through a shared terminal/tmux controller, with a polished interactive product site.

Signal is distributed like a native terminal tool: GitHub is the canonical source and release record, checksummed standalone artifacts with workflow attestations are the primary runtime, Homebrew is the preferred macOS installer, and `terminal-signal` on npm provides a Node-based install plus an `npx` trial path.

## Objective

Signal replaces the personal Claude Code `stoplight.sh` with a typed controller, a universal supervised wrapper, and native adapters for CLIs that expose lifecycle hooks. It serializes state changes, rejects stale generations, arbitrates multiple sessions that share a terminal surface, validates all terminal targets, restores only Signal-owned state, and includes recovery tools for failure paths in which normal cleanup cannot execute.

It is for developers who run multiple coding-agent sessions and need to see which terminal needs attention without constantly foregrounding each window.

Success means all controller invariants have executable regression tests; Claude Code and Codex adapters produce the documented normalized events; any executable can be lifecycle-supervised; install/uninstall preserve existing configuration; unsupported terminals safely no-op; and the responsive site uses the actual Signal phase model in an accessible live demonstration.

## Assumptions

- [x] Signal is a separate product from ChangeScribe and lives in its own `terminal-signal` GitHub repository and local worktree.
- [x] Node 24.18.0 is the pinned development and release-build runtime; the bundled npm CLI supports Node 22+; macOS and Linux receive terminal-background support, while unsupported/Windows surfaces safely degrade to status and notification channels.
- [x] Claude Code and Codex are the first installed adapters; Gemini CLI, OpenCode, and Aider receive tested adapter contracts/install manifests without pretending they are locally available for live verification.
- [x] The current thermal palette and adaptive urgency concept remain, but lifecycle ordering and ownership take precedence over cosmetic behavior.
- [x] “Any coding CLI” means every executable can use the wrapper/protocol baseline; native semantic fidelity depends on events the underlying CLI actually exposes.
- [x] The repository remains a private release rehearsal until an explicit publication action makes it public; no packaging test may publish, tag, deploy, or mutate live provider configuration.
- [x] The root remains a private workspace for the site and development tooling; only `packages/cli` is publishable.
- [x] Standalone macOS/Linux artifacts embed their runtime and are the source consumed by Homebrew; Windows remains documented as unsupported until its terminal targeting has real coverage.
- [x] `npx terminal-signal` is for evaluation and diagnostics. Provider hooks must reference a durable installed executable, never an npm cache path.

## Success Criteria

| # | Criterion | How we measure | Target |
|---|---|---|---|
| 1 | Stale-event safety | Reducer and concurrent-controller tests | Older generation never changes resolved surface state |
| 2 | Multi-session safety | Lease arbitration tests | Releasing one owner never clears another; deterministic priority winner |
| 3 | Input and state safety | Boundary, corruption, traversal, symlink, and permission tests | Invalid data rejected; no evaluation or out-of-root write; private state modes |
| 4 | Terminal safety | PTY/fixture renderer tests | Exact allowed OSC bytes; regular files/symlinks/unowned targets rejected |
| 5 | Cleanup coverage | Lifecycle, wrapper-signal, session-end, stale-lease tests | Deterministic cleanup whenever controller/wrapper survives; recovery otherwise |
| 6 | tmux preservation | Isolated tmux integration tests | Exact pre-existing local options restored; multi-pane limitation explicit |
| 7 | Adapter fidelity | Fixture tests for Claude, Codex, Gemini, OpenCode, Aider/generic | Documented provider events map to normalized protocol without prompt content |
| 8 | Non-destructive setup | Temp-home installer tests | Install/uninstall idempotent and preserve unrelated hooks/notify configuration |
| 9 | Operability | CLI integration tests | `doctor`, `status`, `preview`, `reset`, `event`, `run`, `install`, `uninstall` return actionable results |
| 10 | Product site | SSR, accessibility, interaction, browser, and build checks | Responsive, keyboard usable, reduced-motion safe, no console/network failures |
| 11 | npm package integrity | `npm pack` allowlist and isolated prefix installation | Tarball contains only the compiled CLI and package docs; `signal` runs without site dependencies on supported Node |
| 12 | Durable hook installation | Global-package symlink and standalone-binary integration tests | Installer resolves and validates a stable executable; ephemeral `npx` locations are rejected for hook activation |
| 13 | Standalone releases | Native artifact build and smoke tests on each release runner | `signal` runs without a system Node installation; archive names, checksums, and version match the tag |
| 14 | Homebrew readiness | Formula generation and `brew audit`/install test | Formula selects the correct release artifact and installs the standalone `signal` executable |
| 15 | Supply-chain safety | Release workflow policy and dry-run checks | Least-privilege permissions, immutable tags, SHA-256 checksums, attestations/provenance where supported, no long-lived publish token in source |

## Non-Goals

- Guaranteed cleanup after the CLI, controller, wrapper, shell, and watchdog all receive `SIGKILL`, after power loss, or after the terminal emulator has died.
- Exact recovery of an unknown background/title that a terminal does not reliably expose.
- Different whole-window OSC backgrounds for separate panes in one tmux client.
- Persisting prompts, assistant messages, transcripts, or secrets.
- Shipping a hosted account, telemetry service, or cloud synchronization system.
- Claiming Windows support before Windows terminal discovery, rendering degradation, and installer behavior have live release coverage.
- Automatically publishing from ordinary branch pushes or pull requests.

## Users and User Stories

- As a developer with several coding agents open, I want terminal state to show which session is working, waiting, ready, or failed so I can direct attention quickly.
- As a developer using multiple CLIs, I want one controller and installation model so each integration behaves consistently.
- As a cautious terminal user, I want reset/uninstall to preserve my existing configuration and explain platform limitations.
- As a prospective user, I want to try the real state model on the landing page before installing anything.

## Tech Stack

- Language: TypeScript 5.9; Node 24 for development and release builds; bundled JavaScript targets the documented npm runtime floor
- Site: React 19 + vinext + Tailwind 4, packaged for Sites/Cloudflare
- CLI persistence: versioned JSON with atomic rename and cross-process lock directory
- Tests: Node test runner for unit/integration, isolated PTYs/tmux where available, browser verification for the site
- Hosting: OpenAI Sites after local gates pass
- Distribution: npm workspace package, Node single-executable artifacts, GitHub Releases, and a Homebrew formula generated from release metadata

## Commands

```bash
npm install
npm run dev
npm run test:unit
npm run test:integration
npm run lint
npm run typecheck
npm run build
npm test
```

## Project Structure

```text
app/                 → interactive landing page
packages/cli/        → public npm manifest and package-specific documentation
scripts/release/     → deterministic CLI, standalone artifact, checksum, and formula builders
src/core/            → typed protocol, reducer, leases, policy, persistence
src/renderers/       → terminal, tmux, and notification renderers
src/adapters/        → provider lifecycle translators and installers
src/cli/             → command interface and wrapper supervision
tests/unit/          → pure behavior tests
tests/integration/   → filesystem, process, PTY, tmux, installer, and CLI tests
docs/                → audit, architecture, adapter protocol, launch notes
```

## Testing Strategy

- Every behavior begins with a focused failing Node test and its observed `RED` output.
- Pure reducer, protocol, policy, sanitization, and installer-merge logic are unit tested.
- Atomic persistence, concurrent writers, child supervision, CLI commands, terminal bytes, and tmux restoration are integration tested.
- The critical browser flow is: load the homepage, choose each phase, use keyboard controls, copy the install command, switch visual channels, and verify responsive/reduced-motion behavior.
- Enforced Node-native coverage target for `src/core`: 90% lines, 70% branches, and 95% functions. The verified baseline is 91.38% lines, 73.31% branches, and 98.81% functions.
- Distribution tests inspect the exact packed tarball, install it into an isolated npm prefix, execute its `signal` bin, extract and smoke the exact native archive, and validate the generated Homebrew formula. Tap audit and URL installation run only after immutable release assets exist.

## Boundaries

**Always do:** validate external input; preserve existing configuration; test failure paths; keep state private; use explicit capability detection; document degraded behavior.

**Ask first:** change GitHub repository visibility; create a public release/tag; publish or stage to npm; create or mutate a Homebrew tap repository; mutate the user’s live Claude/Codex configuration; replace an existing completion notifier; deploy outside the configured Sites project.

**Never do:** write to an unverified path as a TTY; execute state; log prompt/transcript content; use `SIGKILL` cleanup as a product claim; overwrite unrelated hooks; hide a failing gate.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Native CLI event contracts change | Medium | High | Thin versioned adapters, fixture tests, and `doctor` capability reports |
| Terminal/multiplexer variance | High | Medium | Renderer capability matrix, safe no-op, PTY tests, isolated tmux verification |
| Lock left after abrupt death | Medium | Medium | Owner identity, stale-lock timeout, atomic writes, startup reconciliation |
| Shared terminal has competing mutator | Medium | Medium | Surface leases, generation CAS, explicit ownership semantics, reset command |
| Landing page overclaims guarantees | Medium | High | Copy derives from this spec and includes the failure-domain boundary |
| npm cache or version-manager path becomes a permanent hook | Medium | High | Resolve durable installs, reject ephemeral cache paths, and test global-prefix installation |
| Release artifact differs from tested source | Low | High | Build after tests from an immutable tag, generate checksums/attestations in the same workflow, smoke-test downloaded artifacts |
| Public supply chain is compromised | Low | Critical | Minimal workflow permissions, protected release environment, npm OIDC trusted publishing after repository visibility permits provenance |

## Open Questions

No local implementation decision is blocking. The first public release still requires explicit approval and external setup for repository visibility, protected rulesets/environments, npm ownership and trusted publishing, private vulnerability reporting, and the Homebrew tap destination.

## References

- `docs/edge-case-audit.md`
- `PLAN.md`
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Codex hooks: https://developers.openai.com/codex/hooks

## Sign-off

- [x] Author has written this spec
- [x] Assumptions confirmed by the requester’s “go ahead and fix everything” instruction
- [x] Success criteria are measurable
- [x] Boundaries agreed
- [x] Open questions resolved or explicitly deferred
- [x] Human direction approved implementation
