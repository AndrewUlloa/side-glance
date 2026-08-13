# Plan: Signal

> Derived from: `SPEC.md`
> Status: in progress
> Last updated: 2026-08-12

## Overview

Build Signal in vertical red-green slices: first make one normalized event deterministically resolve to one surface state; then harden persistence and rendering; then expose that behavior through the CLI and provider adapters; finally make the landing page an interactive view of the same model and publish only after the full local and browser gates pass.

The publication-readiness extension keeps the repository private while it proves the exact artifacts that will later be released: a minimal npm workspace package, standalone macOS/Linux executables, checksums and attestations, and a Homebrew formula derived from immutable release metadata.

## Architecture Decisions

- **Decision:** The root is a private workspace containing the site and development tooling; `packages/cli` is the only publishable npm package. **Rationale:** Users must not install React, Cloudflare, database, or site tooling to run a terminal hook.
- **Decision:** Compile one dependency-free JavaScript bundle for npm and inject the same bundle into platform-native Node single-executable artifacts. **Rationale:** npm users get a conventional package while Homebrew and direct-download users get a stable runtime independent of their Node installation.
- **Decision:** `npx` may run diagnostics but may not install permanent hooks from an ephemeral npm cache. **Rationale:** Lifecycle hooks must remain executable offline and across cache cleanup.
- **Decision:** Release workflows build on native GitHub-hosted macOS/Linux runners, smoke-test each executable, and publish only from an explicit version tag plus protected release environment. **Rationale:** Native artifacts cannot be inferred from a source-only test and publication must be intentional.
- **Decision:** Use typed JSON, an atomic lock directory, and atomic rename before adding a resident daemon. **Rationale:** This satisfies serialization and crash-recovery invariants with fewer failure domains; a future daemon can reuse the same controller contract.
- **Decision:** Native hooks submit events; only the controller renders. **Rationale:** Terminal/tmux state is a shared surface requiring one ownership decision.
- **Decision:** The wrapper establishes the surface and lifecycle fallback. **Rationale:** Provider hooks often lack a stable controlling TTY and cannot cover child-process termination alone.
- **Decision:** Title mutation is opt-in and terminal background reset means configured default. **Rationale:** Exact arbitrary prior terminal state is not portably knowable.

Rejected: direct painting from each provider hook, because it preserves the current ordering and ownership races.

Rejected: publishing the current root package, because it includes unrelated site dependencies and exposes a raw TypeScript executable. Rejected: permanent `npx` hook commands, because npm cache/network resolution is not a durable runtime contract.

## Dependency Graph

```text
protocol + reducer
        │
        ├──▶ atomic store + controller ──▶ renderer leases ──▶ CLI commands/wrapper
        │                                      │
        └──▶ shared phase/palette ─────────────┴──▶ adapters/installers
                                                       │
                                                       └──▶ interactive site
```

## Task List

### Phase 1: Deterministic core

- [x] **Task 1: Reject stale events and resolve session state**
  - **Acceptance:** Normalized lifecycle transitions are typed; obsolete generations and duplicate event IDs do not alter state; prompt content is absent from the protocol.
  - **Verify:** focused reducer RED/GREEN; `npm run test:unit`.
  - **Depends on:** None
  - **Files:** `tests/unit/reducer.test.ts`, `src/core/protocol.ts`, `src/core/reducer.ts`
  - **Size:** M

- [x] **Task 2: Arbitrate multiple leases on one surface**
  - **Acceptance:** Priority is deterministic; releasing one owner recomputes from remaining owners; final release resolves inactive.
  - **Verify:** focused lease RED/GREEN; unit suite.
  - **Depends on:** Task 1
  - **Files:** `tests/unit/leases.test.ts`, `src/core/leases.ts`
  - **Size:** S

- [x] **Task 3: Preserve thermal urgency as validated policy**
  - **Acceptance:** Thresholds/palette validate; short tasks suppress; urgency is bounded/monotonic; adaptive response never changes lifecycle ordering.
  - **Verify:** policy RED/GREEN; unit suite.
  - **Depends on:** Task 1
  - **Files:** `tests/unit/policy.test.ts`, `src/core/policy.ts`, `src/core/theme.ts`
  - **Size:** S

### Checkpoint: Deterministic core

- [x] Unit tests pass on Node 24
- [x] Core coverage clears enforced 90% line, 70% branch, and 95% function thresholds
- [x] Typecheck clean
- [x] Review stale-event and lease invariants

### Phase 2: Persistence and safe rendering

- [x] **Task 4: Serialize and recover private state**
  - **Acceptance:** Concurrent writers cannot lose updates; state writes are atomic/private; corrupt/old state safely resets; stale lock can be reclaimed only after validation.
  - **Verify:** filesystem and concurrent-process RED/GREEN integration tests.
  - **Depends on:** Tasks 1–2
  - **Files:** `tests/integration/store.test.ts`, `src/core/store.ts`, `src/core/controller.ts`
  - **Size:** M

- [x] **Task 5: Render only to verified terminal surfaces**
  - **Acceptance:** Regular files, unsafe symlinks, missing/unowned devices, and control-byte labels are rejected; captured bytes contain only expected OSC sequences; reset uses OSC 111.
  - **Verify:** PTY/fixture RED/GREEN integration tests.
  - **Depends on:** Task 4
  - **Files:** `tests/integration/terminal-renderer.test.ts`, `src/renderers/terminal.ts`, `src/core/sanitize.ts`
  - **Size:** M

- [x] **Task 6: Preserve exact Signal-owned tmux options**
  - **Acceptance:** Existing local styles/formats are snapshotted and restored; inherited values remain inherited; shared panes do not blindly clear each other.
  - **Verify:** isolated tmux RED/GREEN tests.
  - **Depends on:** Tasks 2, 4
  - **Files:** `tests/integration/tmux-renderer.test.ts`, `src/renderers/tmux.ts`
  - **Size:** M

### Checkpoint: Safe controller

- [x] Unit and integration suites pass
- [x] No external path can become executable state or a terminal write target
- [x] Failure/recovery behavior reviewed

### Phase 3: CLI and adapters

- [x] **Task 7: Add operational CLI and supervised wrapper**
  - **Acceptance:** `event`, `run`, `status`, `doctor`, `preview`, and `reset` work; wrapper preserves child exit/signal behavior and releases only its own lease.
  - **Verify:** spawned CLI RED/GREEN integration tests.
  - **Depends on:** Safe controller checkpoint
  - **Files:** `tests/integration/cli.test.ts`, `src/cli/index.ts`, `src/cli/run.ts`, `package.json`
  - **Size:** M

- [x] **Task 8: Add provider adapters**
  - **Acceptance:** Claude, Codex, Gemini, OpenCode, Aider/generic fixtures map documented events to normalized phases; compact/resume/failure/waiting semantics are distinct.
  - **Verify:** adapter RED/GREEN fixture suite.
  - **Depends on:** Task 7
  - **Files:** `tests/unit/adapters.test.ts`, `src/adapters/*.ts`
  - **Size:** M

- [x] **Task 9: Install and uninstall without clobbering configuration**
  - **Acceptance:** Temp-home installs are idempotent; existing hooks and Codex notify survive; uninstall removes only Signal-owned entries; generated commands use absolute executable paths.
  - **Verify:** installer RED/GREEN integration suite.
  - **Depends on:** Task 8
  - **Files:** `tests/integration/installers.test.ts`, `src/adapters/installers.ts`, `src/cli/install.ts`
  - **Size:** M

### Checkpoint: Usable product

- [x] Real Claude and Codex configuration plans pass `doctor` without live mutation
- [x] Wrapper and adapters share one controller
- [x] Package build and all non-browser gates pass

### Phase 4: Interactive site and shipping

- [x] **Task 10: Build the real state playground**
  - **Acceptance:** Page uses shared phase/theme data; visitors can use keyboard/touch to change state and renderer channel; copy/install command are product-specific.
  - **Verify:** component/model RED/GREEN, SSR test, local build.
  - **Depends on:** Task 3 and usable product checkpoint
  - **Files:** `app/page.tsx`, `app/globals.css`, `app/components/*`, `tests/site/*`
  - **Size:** M

- [x] **Task 11: Complete responsive, accessible product storytelling**
  - **Acceptance:** Original first viewport, capability/limitation story, CLI coverage, setup, FAQ, reduced motion, focus/touch/mobile behavior, bespoke metadata/social preview.
  - **Verify:** lint/type/build, real browser desktop/mobile/keyboard/reduced-motion/console/network check.
  - **Depends on:** Task 10
  - **Files:** `app/*`, `public/*`, browser evidence
  - **Size:** M

- [x] **Task 12: Review, launch, and rollback readiness**
  - **Acceptance:** Five-axis review has no required findings; all local and CI gates are green; package remains unpublished; deployment and live-install approval boundaries are documented with rollback.
  - **Verify:** full commands from `CLAUDE.md`, browser production-build smoke test, draft PR checks.
  - **Depends on:** Task 11
  - **Files:** `REVIEW.md`, `LAUNCH.md`, `README.md`
  - **Size:** M

## Parallelization

- **Safe to parallelize after contracts exist:** provider fixture research, site content structure, renderer capability documentation.
- **Must be sequential:** reducer → leases → store/controller → renderers → CLI → installers; site claims follow proven product capabilities.
- **Contract-first:** normalized protocol and phase/theme model precede all adapters and site interaction.

### Phase 5: Public distribution readiness

- [x] **Task 13: Isolate the npm CLI package**
  - **Acceptance:** Root stays private; `packages/cli` owns `terminal-signal`; the packed allowlist contains a compiled executable and package docs only; no site runtime dependency is installed.
  - **Verify:** focused pack-manifest RED/GREEN test; isolated `npm install --prefix` smoke test on the minimum supported Node.
  - **Depends on:** Task 12
  - **Files:** `package.json`, `packages/cli/package.json`, `scripts/build-cli.mjs`, `tests/distribution/npm-package.test.mjs`
  - **Size:** M

- [x] **Task 14: Make provider activation durable across npm symlinks**
  - **Acceptance:** Global npm bin symlinks resolve to a validated stable target; known ephemeral npm cache paths cannot be written into provider hooks; standalone execution resolves itself correctly.
  - **Verify:** installer RED/GREEN tests using an isolated global prefix and synthetic cache path.
  - **Depends on:** Task 13
  - **Files:** `src/cli/install.ts`, `src/adapters/installers.ts`, installer/distribution tests
  - **Size:** M

- [ ] **Task 15: Build standalone release artifacts**
  - **Acceptance:** The compiled CLI is injected into a native executable; local native smoke test passes with a stripped `PATH`; archive naming is deterministic and the exact content is checksummed.
  - **Verify:** artifact RED/GREEN test plus native local build; CI matrix covers macOS arm64/Intel and Linux arm64/x64.
  - **Depends on:** Task 13
  - **Files:** `scripts/release/*`, `.github/workflows/release.yml`, distribution tests
  - **Size:** M

- [ ] **Task 16: Generate and verify Homebrew packaging**
  - **Acceptance:** A formula is generated from versioned artifact URLs and SHA-256 values; it installs only `signal`; local syntax and Homebrew style tests pass; tap readall, audit, install, and upgrade tests run after immutable URLs exist.
  - **Verify:** formula schema RED/GREEN test and local style check; isolated tap install/upgrade smoke test after release.
  - **Depends on:** Task 15
  - **Files:** `packaging/homebrew/*`, release scripts/workflow, distribution tests
  - **Size:** M

- [ ] **Task 17: Secure and rehearse publication**
  - **Acceptance:** CI verifies pack contents and artifacts; release workflow uses least privilege, protected environment, attestations, and npm trusted-publishing shape; dry runs cannot publish; docs distinguish install, activation, update, and rollback.
  - **Verify:** workflow policy test, `npm publish --dry-run`, full gates, GitHub Actions green, five-axis release review.
  - **Depends on:** Tasks 14–16
  - **Files:** workflows, `README.md`, `LAUNCH.md`, `REVIEW.md`, distribution tests
  - **Size:** M

### Checkpoint: Publication-ready but unpublished

- [x] Exact npm tarball installed and exercised from an isolated prefix
- [x] Native artifact exercised without relying on the developer checkout
- [x] Homebrew formula generated and locally verified
- [x] No registry package, public release, visibility change, tap mutation, or live provider mutation occurred
- [x] Release review and rollback documents match the artifacts

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Node test runner TypeScript behavior differs from package build | Medium | Medium | Run tests on pinned Node 24 and typecheck separately |
| Local environment lacks some CLIs/terminals | Medium | High | Fixture contracts plus `doctor`; label live verification separately |
| Site starter dependency vulnerabilities | High | Medium | Run audit, avoid server persistence, review production dependency paths before publish |
| Installer touches personal config incorrectly | High | Low | Temp-home proof first; live mutation remains Ask First |

## Open Questions

None blocking. Public package publication and live config mutation remain explicit approval gates.

## Sign-off

- [x] Every task has acceptance + verify
- [x] Tasks ordered by dependency
- [x] No XL tasks remain
- [x] Checkpoints between phases
- [x] Requester approved implementation with red-green TDD
