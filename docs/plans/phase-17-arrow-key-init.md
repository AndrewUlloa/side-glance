# Plan: Arrow-key guided setup

> Derived from: `docs/specs/phase-17-arrow-key-init.md`
> Status: completed in 0.1.0-beta.6
> Last updated: 2026-08-25

## Overview

Build the interaction as progressive enhancement around the existing setup
planner. A verified TTY receives a modern select/multiselect surface; static
streams keep the current parser. The setup command adds one recommended versus
customize decision, a concise review, truthful progress, and a concise verified
result. Machine output and configuration transactions remain unchanged.

## Architecture decisions

- **Keep planning separate from presentation.** The existing discovery, plan,
  transaction, JSON, and dry-run layers remain authoritative.
- **Use two prompt surfaces behind one interface.** Enhanced TTY and static
  fallback share outcomes but not rendering mechanics.
- **Recompute defaults on each run.** Recommended setup consumes the current
  planner output; Side Glance will not store onboarding preferences.
- **Close the approval boundary before writes.** Raw prompt state must be settled
  before the configuration transaction or bootstrap installer starts.
- **Use Node's keypress decoder, not a new dependency.** Pure reducers own
  selection state; a scoped raw-mode lease owns listeners, cursor visibility,
  stream flow, and exact restoration. Static prompts keep cooked readline.
- **No feature flag.** The capability gate is the rollback boundary: unsupported
  terminals retain the existing static path, and reverting one release commit
  restores beta.5 behavior without data migration.

Rejected: replacing the setup planner, changing provider defaults, using a
full-screen TUI framework, or making enhanced prompts mandatory for automation.

## Dependency graph

```text
[prompt contract + fallback]
          |
          +--> [recommended/customize setup branch]
          |                 |
          |                 +--> [concise review/result + progress]
          |
          +--> [bootstrap single-select]
          |
          +--> [PTY + packed npm + SEA verification]
                            |
                            +--> [docs, review, protected release]
```

## Task list

### Phase 1: Prompt foundation

- [x] **Task 1: Prove enhanced selection behavior**
  - **Description:** Add RED unit and PTY tests for Up/Down/Enter single-select,
    Up/Down/Space/Enter multiselect, cancellation, sanitization, and fallback.
  - **Acceptance:** Tests fail on beta.5 for the intended behavior rather than a
    fixture or dependency error.
  - **Verify:** `node --test tests/unit/prompts.test.ts tests/integration/setup-pty.test.ts`
  - **Depends on:** None
  - **Files:** `tests/unit/prompts.test.ts`, `tests/integration/setup-pty.test.ts`
  - **Size:** S

- [x] **Task 2: Add the enhanced prompt adapter**
  - **Description:** Implement verified-TTY selection with Node keypress events,
    static fallback, cleanup, sanitization, single/multi selection, and progress
    primitives without a new runtime dependency.
  - **Acceptance:** Arrow tests pass; fallback has no ANSI; raw/cursor state is
    restored on every tested completion.
  - **Verify:** focused tests, `npm run build:cli`
  - **Depends on:** Task 1
  - **Files:** `src/cli/prompts.ts`
  - **Size:** M

### Checkpoint: Prompt foundation

- [x] Focused prompt and PTY tests pass.
- [x] Dependency/license audit is recorded.
- [x] Static fallback remains byte-for-byte machine-safe.

### Phase 2: First-run journey

- [x] **Task 3: Prove the recommended and customize branches**
  - **Description:** Add RED setup-command tests for the default recommended
    option, progressive disclosure, customize path, exact defaults, and exits.
  - **Acceptance:** The first choice has no planner jargon; recommended skips
    detailed choices; customize exposes them; neither writes before approval.
  - **Verify:** `node --test tests/unit/setup-command.test.ts`
  - **Depends on:** Task 2
  - **Files:** `tests/unit/setup-command.test.ts`
  - **Size:** S

- [x] **Task 4: Implement the concise setup journey**
  - **Description:** Render compact discovery, add recommended/customize/exit,
    keep detailed output for dry-run/JSON, and simplify provider/notification
    labels.
  - **Acceptance:** Task 3 passes without changing planner semantics.
  - **Verify:** focused setup and CLI integration tests
  - **Depends on:** Task 3
  - **Files:** `src/cli/setup-command.ts`, `src/cli/prompts.ts`, `tests/unit/setup-command.test.ts`
  - **Size:** M

- [x] **Task 5: Add truthful progress and completion**
  - **Description:** Start progress only after confirmation, stop successfully
    only after complete verification, and render concise launches plus bounded
    notification claims.
  - **Acceptance:** Injected failure never prints readiness; success distinguishes
    changed/unchanged and says delivery was not live-tested.
  - **Verify:** setup transaction and command failure-injection tests
  - **Depends on:** Task 4
  - **Files:** `src/cli/setup-command.ts`, `tests/unit/setup-command.test.ts`
  - **Size:** S

- [x] **Task 6: Upgrade bootstrap choice navigation**
  - **Description:** Replace the bootstrap's multiselect-as-radio loop with the
    same arrow-key single-select while preserving exact installer confirmation
    and durable handoff.
  - **Acceptance:** Exactly one method is returned; cancellation invokes no
    package manager; static fallback still works.
  - **Verify:** `node --test tests/unit/bootstrap-command.test.ts`
  - **Depends on:** Task 2
  - **Files:** `src/cli/bootstrap-command.ts`, `tests/unit/bootstrap-command.test.ts`
  - **Size:** S

### Checkpoint: Core journey

- [x] Recommended and customize flows work through a real PTY.
- [x] Automation and JSON integration tests remain green.
- [x] No configuration write precedes final approval.

### Phase 3: Distribution, copy, and release

- [x] **Task 7: Prove packaged and standalone behavior**
  - **Description:** Exercise enhanced and fallback setup from the packed npm
    artifact and native SEA binary, including Node 22/24 compatibility.
  - **Acceptance:** Bundles contain required code/notices and require no dynamic
    dependency or asset lookup.
  - **Verify:** distribution tests, package dry-run, standalone build/smoke
  - **Depends on:** Tasks 4–6
  - **Files:** `tests/distribution/npm-package.test.mjs`, `tests/distribution/standalone.test.mjs`, `scripts/release/build-standalone.mjs`
  - **Size:** M

- [x] **Task 8: Align public onboarding copy**
  - **Description:** Document arrow controls, recommended versus customize,
    static/accessibility mode, npm's separate confirmation, and the released
    version without adding unsupported claims.
  - **Acceptance:** README, CLI README, changelog, and website install claim tests
    agree with the shipped flow.
  - **Verify:** site/distribution claim tests and `git diff --check`
  - **Depends on:** Tasks 4–7
  - **Files:** `README.md`, `packages/cli/README.md`, `CHANGELOG.md`, `tests/site/release-claims.test.ts`
  - **Size:** M

- [x] **Task 9: Complete five-axis and launch review**
  - **Description:** Record correctness, simplicity, architecture, security,
    performance, rollback, and launch evidence; resolve every required finding.
  - **Acceptance:** Independent UX, security, and distribution reviewers approve;
    all repository gates pass on the final revision.
  - **Verify:** required gates from `CLAUDE.md`, audit, pack, PTY manual smoke
  - **Depends on:** Tasks 1–8
  - **Files:** `docs/reviews/phase-17-arrow-key-init.md`, `docs/launch/phase-17-arrow-key-init.md`
  - **Size:** S

- [x] **Task 10: Ship the protected prerelease**
  - **Description:** Bump the next beta, merge feature and release preparation
    through protected staging/main, create the annotated tag, publish npm/GitHub,
    update the tap, and verify fresh npx and Homebrew arrow-key journeys.
  - **Acceptance:** Protected checks and release workflow are green; public npm,
    native assets, provenance, checksums, and tap formula resolve the same commit;
    real terminal smoke succeeds.
  - **Verify:** GitHub checks, release verification, npm metadata/provenance,
    Homebrew test-bot, fresh public install smokes
  - **Depends on:** Task 9
  - **Files:** version/changelog/release metadata only
  - **Size:** M

## Parallelization

- Safe: UX copy audit, terminal-security review, and distribution architecture
  review can run independently before implementation and again before merge.
- Sequential: RED prompt tests -> adapter -> RED journey tests -> journey ->
  distribution -> review -> release.
- Contract-first: prompt outcomes and cancellation semantics must stabilize before
  setup/bootstrap changes.

## Rollback

There is no data migration. Reverting the feature commit restores the static
beta.5 initializer. During release, do not move npm `latest`; if public
verification fails, leave the failed beta tagged, fix forward with the next beta,
and do not update the Homebrew tap until the replacement passes.

## Sign-off

- [x] Every task has acceptance and verification.
- [x] Dependencies are ordered.
- [x] No task is XL.
- [x] Checkpoints exist.
- [x] The requester's full-permission directive approves execution of this plan.
