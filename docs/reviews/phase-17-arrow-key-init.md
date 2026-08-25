# Review: Arrow-key guided setup

> Spec: `docs/specs/phase-17-arrow-key-init.md`
> Plan: `docs/plans/phase-17-arrow-key-init.md`
> Status: approved for feature merge
> Reviewed: 2026-08-25

## Outcome

Phase 17 replaces the diagnostic-first interactive initializer with a concise
recommended/customize/exit journey and progressive arrow-key prompts. The setup
planner, transaction, JSON schemas, notification defaults, and configuration
targets are unchanged. No new runtime dependency or dynamic asset is introduced.

## Five-axis review

### Correctness

- Single-select uses Up/Down and Enter; multiselect adds Space.
- Provider and notification selections remain in canonical planner order.
- Recommended consumes the planner's current provider, notification, and sound
  defaults rather than reimplementing them in presentation code.
- Final approval still precedes every configuration write. Progress starts only
  after approval and success is printed only after transaction verification.

### Simplicity and architecture

- The prompt adapter uses Node's `readline.emitKeypressEvents`; there is no CSI
  parser, full-screen TUI, stored preference, or prompt package.
- Enhanced and static prompt surfaces implement the same small contract.
- Bootstrap now uses the same single-select contract instead of treating a
  multiselect as a radio group.

### Security and recovery

- Prompt text strips control and bidi formatting characters; exact diagnostic
  details preserve content only after neutralizing terminal controls.
- Raw mode, input flow, listeners, abort handlers, and cursor visibility are
  restored on Enter, Ctrl-C, Escape, Ctrl-D, EOF, stream error, close, and process
  AbortSignal. A real PTY process-level SIGINT test exits 130.
- Raw-mode startup failure transfers to the numbered fallback without emitting
  ANSI. `NO_COLOR`, `TERM=dumb`, and accessible-mode PTYs are ANSI-free.
- Output errors cancel an active prompt or disable progress without escaping the
  transaction's caught rollback boundary.
- Failure progress says only that configuration could not be verified; rollback
  conflict and rollback failure never claim that nothing was applied.

### Performance and distribution

- Prompt work is bounded by four provider choices. The progress timer is unrefed
  and cleared on stop, error, and close.
- Frames are truncated to the terminal width before redraw, so logical lines do
  not create untracked physical rows.
- The npm bundle remains dependency-free and asset-free. Packed npm tests cover
  enhanced setup, `NO_COLOR`, and offline interactive `npm exec` bootstrap. SEA
  tests cover enhanced and static setup without Node on `PATH`.

### Product claims and accessibility

- The first decision uses provider names and recommended consequences rather than
  planner vocabulary.
- Customize reveals shorter provider and alert labels. The exact review retains
  action, target, warnings, coverage, and launch commands.
- Documentation explains Up/Down, Space, Enter, accessible/static prompts, npm's
  separate install confirmation, and non-interactive automation boundaries.
- Completion distinguishes changed/unchanged targets and states that notification
  delivery and sound were not live-tested.

## Independent findings resolved

Three independent reviewers covered UX, terminal security, and distribution.
All three approved the final revision with no remaining Required findings.
Required findings were resolved with regression tests:

- external AbortSignal and real process SIGINT prompt cleanup;
- asynchronous output-error containment during prompts and progress;
- bounded failure wording for rollback conflicts/failures;
- decision-critical warning, coverage, and launch details;
- width-safe redraw with separately visible controls and compact coverage labels;
- persistent raw-mode failure handoff through confirm, progress, and close, plus
  accessible/`TERM=dumb` static behavior;
- packed npm bootstrap and npm/SEA fallback parity.

## Verification

- Focused prompt, setup, and PTY matrix: 37/37 pass.
- Unit: 146/146 pass.
- Integration: 109 pass, 1 environment-dependent tmux test skipped.
- Distribution: 19/19 pass, including packed npm enhanced/static/bootstrap and
  native SEA enhanced/static smokes.
- Site: 37/37 pass; rendered HTML: 2/2 pass.
- Coverage: lines 91.03%, branches 78.16%, functions 95.50%.
- Typecheck, lint, diff check, production build, and full `npm test`: pass.

## Rollback

No data migration is introduced. Reverting the feature commit restores the
beta.5 numbered initializer; users can force the static surface at any time with
`SIDE_GLANCE_ACCESSIBLE=1` or `NO_COLOR=1`.
