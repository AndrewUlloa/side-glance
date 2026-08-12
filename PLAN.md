# Plan: Signal

> Derived from: `SPEC.md`
> Status: in progress
> Last updated: 2026-08-12

## Overview

Build Signal in vertical red-green slices: first make one normalized event deterministically resolve to one surface state; then harden persistence and rendering; then expose that behavior through the CLI and provider adapters; finally make the landing page an interactive view of the same model and publish only after the full local and browser gates pass.

## Architecture Decisions

- **Decision:** One package contains core, CLI, and site, while adapter modules stay thin. **Rationale:** The site must reuse the exact phase/palette contract and package distribution remains simple at this stage.
- **Decision:** Use typed JSON, an atomic lock directory, and atomic rename before adding a resident daemon. **Rationale:** This satisfies serialization and crash-recovery invariants with fewer failure domains; a future daemon can reuse the same controller contract.
- **Decision:** Native hooks submit events; only the controller renders. **Rationale:** Terminal/tmux state is a shared surface requiring one ownership decision.
- **Decision:** The wrapper establishes the surface and lifecycle fallback. **Rationale:** Provider hooks often lack a stable controlling TTY and cannot cover child-process termination alone.
- **Decision:** Title mutation is opt-in and terminal background reset means configured default. **Rationale:** Exact arbitrary prior terminal state is not portably knowable.

Rejected: direct painting from each provider hook, because it preserves the current ordering and ownership races.

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
- [x] Typecheck clean
- [x] Review stale-event and lease invariants

### Phase 2: Persistence and safe rendering

- [x] **Task 4: Serialize and recover private state**
  - **Acceptance:** Concurrent writers cannot lose updates; state writes are atomic/private; corrupt/old state safely resets; stale lock can be reclaimed only after validation.
  - **Verify:** filesystem and concurrent-process RED/GREEN integration tests.
  - **Depends on:** Tasks 1–2
  - **Files:** `tests/integration/store.test.ts`, `src/core/store.ts`, `src/core/controller.ts`
  - **Size:** M

- [ ] **Task 5: Render only to verified terminal surfaces**
  - **Acceptance:** Regular files, unsafe symlinks, missing/unowned devices, and control-byte labels are rejected; captured bytes contain only expected OSC sequences; reset uses OSC 111.
  - **Verify:** PTY/fixture RED/GREEN integration tests.
  - **Depends on:** Task 4
  - **Files:** `tests/integration/terminal-renderer.test.ts`, `src/renderers/terminal.ts`, `src/core/sanitize.ts`
  - **Size:** M

- [ ] **Task 6: Preserve exact Signal-owned tmux options**
  - **Acceptance:** Existing local styles/formats are snapshotted and restored; inherited values remain inherited; shared panes do not blindly clear each other.
  - **Verify:** isolated tmux RED/GREEN tests.
  - **Depends on:** Tasks 2, 4
  - **Files:** `tests/integration/tmux-renderer.test.ts`, `src/renderers/tmux.ts`
  - **Size:** M

### Checkpoint: Safe controller

- [ ] Unit and integration suites pass
- [ ] No external path can become executable state or a terminal write target
- [ ] Failure/recovery behavior reviewed

### Phase 3: CLI and adapters

- [ ] **Task 7: Add operational CLI and supervised wrapper**
  - **Acceptance:** `event`, `run`, `status`, `doctor`, `preview`, and `reset` work; wrapper preserves child exit/signal behavior and releases only its own lease.
  - **Verify:** spawned CLI RED/GREEN integration tests.
  - **Depends on:** Safe controller checkpoint
  - **Files:** `tests/integration/cli.test.ts`, `src/cli/index.ts`, `src/cli/run.ts`, `package.json`
  - **Size:** M

- [ ] **Task 8: Add provider adapters**
  - **Acceptance:** Claude, Codex, Gemini, OpenCode, Aider/generic fixtures map documented events to normalized phases; compact/resume/failure/waiting semantics are distinct.
  - **Verify:** adapter RED/GREEN fixture suite.
  - **Depends on:** Task 7
  - **Files:** `tests/unit/adapters.test.ts`, `src/adapters/*.ts`
  - **Size:** M

- [ ] **Task 9: Install and uninstall without clobbering configuration**
  - **Acceptance:** Temp-home installs are idempotent; existing hooks and Codex notify survive; uninstall removes only Signal-owned entries; generated commands use absolute executable paths.
  - **Verify:** installer RED/GREEN integration suite.
  - **Depends on:** Task 8
  - **Files:** `tests/integration/installers.test.ts`, `src/adapters/installers.ts`, `src/cli/install.ts`
  - **Size:** M

### Checkpoint: Usable product

- [ ] Real Claude and Codex configuration plans pass `doctor` without live mutation
- [ ] Wrapper and adapters share one controller
- [ ] Package build and all non-browser gates pass

### Phase 4: Interactive site and shipping

- [ ] **Task 10: Build the real state playground**
  - **Acceptance:** Page uses shared phase/theme data; visitors can use keyboard/touch to change state and renderer channel; copy/install command are product-specific.
  - **Verify:** component/model RED/GREEN, SSR test, local build.
  - **Depends on:** Task 3 and usable product checkpoint
  - **Files:** `app/page.tsx`, `app/globals.css`, `app/components/*`, `tests/site/*`
  - **Size:** M

- [ ] **Task 11: Complete responsive, accessible product storytelling**
  - **Acceptance:** Original first viewport, capability/limitation story, CLI coverage, setup, FAQ, reduced motion, focus/touch/mobile behavior, bespoke metadata/social preview.
  - **Verify:** lint/type/build, real browser desktop/mobile/keyboard/reduced-motion/console/network check.
  - **Depends on:** Task 10
  - **Files:** `app/*`, `public/*`, browser evidence
  - **Size:** M

- [ ] **Task 12: Review, launch, and rollback readiness**
  - **Acceptance:** Five-axis review has no required findings; all gates green; package remains unpublished; site deploy succeeds with documented rollback.
  - **Verify:** full commands from `CLAUDE.md`, deployment smoke test.
  - **Depends on:** Task 11
  - **Files:** `REVIEW.md`, `LAUNCH.md`, `README.md`
  - **Size:** M

## Parallelization

- **Safe to parallelize after contracts exist:** provider fixture research, site content structure, renderer capability documentation.
- **Must be sequential:** reducer → leases → store/controller → renderers → CLI → installers; site claims follow proven product capabilities.
- **Contract-first:** normalized protocol and phase/theme model precede all adapters and site interaction.

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
