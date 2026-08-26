# Plan: Semantic lifecycle colors and aggregate readiness

> Derived from: `docs/specs/phase-19-semantic-lifecycle.md`
> Status: in progress
> Last updated: 2026-08-26

## Overview

Land lifecycle truth before visual confidence: first model bounded child work,
then learn duration profiles and semantic themes, then add the guarded theme
experience, align public explanation, complete an end-to-end storyboard audit,
and follow the protected feature/release/promotion/tag sequence.

## Architecture decisions

- **Status is the default; Heat is explicit.** Failure-red has one semantic
  meaning unless a person deliberately selects duration heat.
- **Learn from turn duration, not return latency.** Per-source p80 profiles are
  bounded, private, rate-limited, and deterministic.
- **Render before training.** Each completed session stores the ceiling it used,
  so the visual does not normalize itself and later ownership repaint is stable.
- **Aggregate inside the parent session.** Children do not receive separate
  leases or notifications.
- **Unknown is not empty.** Missing Claude registries preserve known work.
- **Configuration is closed data.** A separate private JSON config supports
  semantic presets and bounded custom colors without executable input.
- **Protected release remains two-stage.** Feature and version preparation are
  separate PRs into `staging`; literal `staging` promotes to `main`; immutable
  artifacts follow the protected annotated tag.

## Dependency graph

```text
[approved semantic contract]
          |
          +--> [RED aggregate lifecycle] --> [Claude hooks + reducer + notify]
          |                                      |
          +--> [RED profile migration] -----> [sliding ceiling + stable repaint]
                                                 |
          +--> [RED theme/config/CLI] ------> [Status/Heat/Custom experience]
                                                 |
          +--> [RED public parity] ---------> [README + focused site story]
                                                 |
                              [full gates + real browser + storyboard audit]
                                                 |
                         [feature PR -> release PR -> main -> tag -> artifacts]
```

## Task list

### Phase 1: Aggregate lifecycle truth

- [x] **Task 1: Write RED event, adapter, and reducer contracts**
  - **Acceptance:** Tests prove explicit-empty versus unknown snapshots,
    bounded IDs/overflow, conservative same-time ordering, and no child-created
    Ready.
  - **Verify:** focused adapter, validation, reducer tests.
  - **Size:** M

- [x] **Task 2: Implement protocol and Claude aggregation**
  - **Acceptance:** Subagent hooks and parent registries reduce to best-known
    aggregate phase; no provider content persists.
  - **Verify:** focused unit plus locked-store integration sequence.
  - **Depends on:** Task 1
  - **Size:** M

- [x] **Task 3: Gate notifications and upgrade installer coverage**
  - **Acceptance:** A completion input that reduces to Working neither paints
    nor notifies Ready; existing seven-hook installs upgrade transactionally to
    nine.
  - **Verify:** controller and installer integration tests.
  - **Depends on:** Task 2
  - **Size:** M

### Checkpoint: Lifecycle RED → GREEN

- [x] Known child work survives parent Stop, hook reordering, and store writes.
- [x] Only a later eligible aggregate parent Stop can produce Ready.

### Phase 2: Truly sliding duration ceiling

- [x] **Task 4: Write RED profile, migration, and rendering contracts**
  - **Acceptance:** Cold start, p80, outlier, rate limit, FIFO, bounds, source
    isolation, poisoning, prior-ceiling, and schema-1 migration cases fail for
    the intended missing behavior.
  - **Verify:** focused policy, reducer, store, controller tests.
  - **Size:** M

- [x] **Task 5: Implement state schema 2 and adaptive profiles**
  - **Acceptance:** Eligible completions update bounded source profiles after
    their own visual ceiling is captured; response EWMA no longer changes heat.
  - **Verify:** Task 4 tests plus state concurrency regression.
  - **Depends on:** Task 4
  - **Size:** M

### Checkpoint: Adaptive RED → GREEN

- [x] Eight 400-second Claude turns move the next ceiling 300 → 360.
- [x] A single 7,200-second outlier cannot raise a mostly-short profile.
- [x] Codex remains on its own independent profile.

### Phase 3: Theme control

- [x] **Task 6: Write RED semantic theme and config safety contracts**
  - **Acceptance:** Status and Custom never inherit Heat hues; malformed,
    linked, oversized, and unknown-field config cannot reach rendering.
  - **Verify:** policy, visual, config, and doctor unit/integration tests.
  - **Size:** M

- [x] **Task 7: Implement private config and rendering resolution**
  - **Acceptance:** Missing/invalid config safely resolves to Status; valid
    Status, adaptive/fixed Heat, and Custom resolve consistently in every
    renderer.
  - **Verify:** Task 6 tests and terminal/tmux renderer regressions.
  - **Depends on:** Task 6
  - **Size:** M

- [x] **Task 8: Implement guided and automated theme CLI**
  - **Acceptance:** Arrow-key selection, static fallback, review, cancellation,
    show/set/preview/reset, and JSON contracts work without a new dependency.
  - **Verify:** CLI unit, PTY, packed npm, and standalone tests.
  - **Depends on:** Task 7
  - **Size:** L

### Phase 4: Public journey and review

- [x] **Task 9: Align setup, README, package README, changelog, and site**
  - **Acceptance:** Every surface uses the same semantic legend, honest
    aggregate boundary, adaptive explanation, and recovery command; the focused
    homepage demonstrates Failed and keeps short/long Ready green.
  - **Verify:** documentation, site, and rendered HTML tests.
  - **Depends on:** Tasks 3, 5, 8
  - **Size:** M

- [x] **Task 10: Run real-browser and experience storyboard review**
  - **Acceptance:** Desktop/mobile, keyboard, reduced-motion, overflow,
    console, and network checks pass; the journey from install to recovery has
    no required experience-design finding.
  - **Verify:** browser evidence and `docs/reviews/phase-19-*`.
  - **Depends on:** Task 9
  - **Size:** M

- [x] **Task 11: Run every repository gate and five-axis review**
  - **Acceptance:** Unit, integration, coverage, lint, typecheck, build, full
    test, diff check, package, SEA, correctness, simplicity, architecture,
    security, and performance reviews have no required finding.
  - **Verify:** `CLAUDE.md` gate matrix and review record.
  - **Depends on:** Tasks 1–10
  - **Size:** M

### Phase 5: Protected publication

- [x] **Task 12: Merge feature PR through protected staging**
  - **Acceptance:** Required CI and Vercel are green for the exact staged SHA;
    all review threads resolved.
  - **Depends on:** Task 11
  - **Size:** M

- [x] **Task 13: Prepare and merge the next unused beta release PR**
  - **Acceptance:** Version, lockfile, changelog, launch record, fixtures, and
    beta publish channel agree; full gates rerun.
  - **Depends on:** Task 12
  - **Size:** M

- [ ] **Task 14: Promote staging to main and verify production**
  - **Acceptance:** Literal staging is merge-committed to protected main and
    Vercel production is Ready for that exact SHA at side-glance.vercel.app.
  - **Depends on:** Task 13
  - **Size:** M

- [ ] **Task 15: Tag, publish, attest, and update Homebrew**
  - **Acceptance:** Protected annotated tag workflow publishes immutable GitHub
    prerelease and npm beta with matching integrity/provenance; public npx and
    native smokes pass; generated formula passes all tap platforms and public
    brew smoke.
  - **Depends on:** Task 14
  - **Size:** L

## Parallelization

Three read-only expert roles informed the approved contract:

- lifecycle architect — Claude aggregate events, ordering, and claim boundary;
- adaptive theme designer — semantic mapping, exact learned ceiling, and theme
  recovery experience;
- release steward — live protected branches, version availability, deployment,
  artifact, and Homebrew path.

Implementation remains owned by `/root` so red-green evidence and shared state
schema stay coherent.

## Rollback

- Status is the missing-config default; `side-glance theme set heat --ceiling
  300 --yes` restores the closest legacy appearance.
- State schema-1 input remains readable. Do not downgrade a schema-2 state with
  an older binary without backing up the private state file.
- Provider installer rollback uses its existing verified backup transaction.
- Before tag publication, revert through a new protected PR. After an immutable
  tag, fix forward with the next unused beta; never move the tag.

## Sign-off

- [x] Every task has acceptance and verification.
- [x] Dependencies and experience checkpoints are ordered.
- [x] High-risk state, hook, config, and release boundaries are explicit.
- [x] Requester authorized the plan and protected publication.
