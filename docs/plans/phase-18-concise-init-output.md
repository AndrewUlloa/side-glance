# Plan: Concise guided setup output

> Derived from: `docs/specs/phase-18-concise-init-output.md`
> Status: completed
> Last updated: 2026-08-26

## Overview

Refine only the human interactive projection around the existing setup planner
and durable bootstrap. Tests first define the concise transcript, production
renderers then satisfy it, public documentation explains provider availability,
and the complete verification matrix proves automation and distribution parity.

## Architecture decisions

- **Separate interactive and automated human projections.** Interactive setup
  gets a concise result; explicit automation keeps the detailed existing report.
- **Keep the planner authoritative.** Presentation derives found, skipped,
  targets, warnings, notifications, and launch commands from `SetupPlan`.
- **Silence only redundant bootstrap success.** JSON and dry-run bootstrap
  results remain unchanged; the delegated durable command owns interactive
  success output.
- **Map failure state, not child text.** Human bootstrap errors use bounded exit,
  signal, timeout, overflow, and interruption metadata plus recovery commands.

Rejected: a new TUI dependency, a full-screen layout, a `--verbose` flag, or any
change to provider/configuration semantics.

## Dependency graph

```text
[approved output contract]
          |
          +--> [RED setup transcript tests] --> [concise setup renderer]
          |
          +--> [RED bootstrap tests] --------> [handoff/error renderer]
          |
          +--> [README claim test] ----------> [README alignment]
                              |
                              +--> [PTY + package + SEA regression]
                                           |
                                           +--> [review + launch note]
```

## Task list

### Phase 1: Contract tests

- [x] **Task 1: Prove the concise setup transcript**
  - **Acceptance:** Found/skipped CLI names and `PATH` appear; pre-approval
    technical prose disappears; completion has one readiness state and a
    separate launch section.
  - **Verify:** `node --test tests/unit/setup-command.test.ts`
  - **Files:** `tests/unit/setup-command.test.ts`
  - **Size:** S

- [x] **Task 2: Prove bootstrap handoff and recovery output**
  - **Acceptance:** Existing-install success adds no footer; known child failure
    categories produce bounded cause and recovery commands.
  - **Verify:** `node --test tests/unit/bootstrap-command.test.ts`
  - **Files:** `tests/unit/bootstrap-command.test.ts`
  - **Size:** S

### Checkpoint: RED

- [x] Focused tests fail for the intended old transcript.
- [x] Existing JSON and safety assertions remain intact.

### Phase 2: Thin implementation slices

- [x] **Task 3: Refine interactive setup rendering**
  - **Acceptance:** Tasks 1 assertions pass without planner, transaction, or
    machine-schema changes.
  - **Verify:** focused unit plus setup PTY integration tests.
  - **Files:** `src/cli/setup-command.ts`, relevant tests.
  - **Depends on:** Task 1
  - **Size:** M

- [x] **Task 4: Refine bootstrap rendering**
  - **Acceptance:** Task 2 passes; JSON/dry-run projections remain byte-stable;
    errors do not claim unproven rollback.
  - **Verify:** focused bootstrap and npm package tests.
  - **Files:** `src/cli/bootstrap-command.ts`, relevant tests.
  - **Depends on:** Task 2
  - **Size:** M

- [x] **Task 5: Align availability documentation**
  - **Acceptance:** Main and package READMEs define CLI-on-`PATH` availability
    and distinguish desktop applications.
  - **Verify:** distribution documentation tests and `git diff --check`.
  - **Files:** `README.md`, `packages/cli/README.md`, documentation test.
  - **Depends on:** Tasks 3–4
  - **Size:** S

### Checkpoint: User journey

- [x] Enhanced and static PTYs convey the same decisions.
- [x] Packaged npm and standalone output match source behavior.
- [x] No write occurs before final approval.

### Phase 3: Verification and review

- [x] **Task 6: Complete full verification and five-axis review**
  - **Acceptance:** Every required gate passes; no required correctness,
    simplicity, architecture, security, or performance finding remains.
  - **Verify:** required `CLAUDE.md` gates, packed artifacts, manual PTY smoke.
  - **Files:** `docs/reviews/phase-18-concise-init-output.md`,
    `docs/launch/phase-18-concise-init-output.md`
  - **Depends on:** Tasks 1–5
  - **Size:** S

## Parallelization

The setup and bootstrap RED tests are logically independent, but this workspace
keeps implementation sequential so transcript expectations remain coherent.
Documentation follows the final user-facing vocabulary. No subagent delegation
is required for this bounded change.

## Rollback

No data migration or provider-config format changes. Reverting the feature
commit restores beta.6 output. Static prompts remain available through
`SIDE_GLANCE_ACCESSIBLE=1`, `NO_COLOR`, and `TERM=dumb`.

## Sign-off

- [x] Every task has acceptance and verification.
- [x] Dependencies are ordered.
- [x] No task is XL.
- [x] Checkpoints exist.
- [x] Requester approved the proposed experience and implementation.
