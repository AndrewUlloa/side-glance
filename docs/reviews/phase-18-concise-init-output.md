# Review: Concise guided setup output

> Spec: `docs/specs/phase-18-concise-init-output.md`
> Plan: `docs/plans/phase-18-concise-init-output.md`
> Status: approved for feature merge
> Reviewed: 2026-08-26

## Outcome

Phase 18 turns interactive setup into a short detect, decide, review, apply, and
launch journey. It removes planner and bootstrap vocabulary from the normal
terminal transcript while preserving the setup plan, transaction, provider
defaults, notification semantics, JSON projections, dry-run output, and static
prompt fallback.

The review found and fixed one correctness edge case: a provider present on
`PATH` but blocked by a safety check is now described as unsafe to configure,
not as a missing CLI command. There are no remaining required findings.

## Five-axis review

### Correctness

- Found and skipped provider names derive from the authoritative `SetupPlan`.
- A fully missing provider set and a detected-but-blocked provider set produce
  distinct, truthful no-write outcomes.
- The review shows selected providers, notification state and sound,
  configuration targets, and every decision-critical warning.
- Progress still begins only after confirmation. The existing transaction owns
  revalidation, write, verification, backup, and caught rollback behavior.
- Completion derives provider state, launch commands, and backup paths from the
  projected transaction result; home-owned paths display with `~/`.
- Automated human, `--dry-run`, and `--json` projections retain their previous
  detailed contracts.

### Simplicity

- One dedicated interactive result projection provides the shorter success
  transcript. It does not add a prompt dependency, stored state, or verbose mode.
- A small warning-code map shortens known warnings without parsing or truncating
  untrusted planner messages.
- Successful existing-install bootstrap handoff suppresses only its redundant
  interactive footer; other bootstrap outcomes retain their established output.

### Architecture

- Provider discovery, planning, selection defaults, targets, notifications, and
  configuration writes remain outside the presentation layer.
- The durable command remains the owner of interactive setup output after an
  `npx` handoff. Bootstrap continues to own installation and machine projections.
- Source, static PTY, enhanced PTY, packed npm, and standalone SEA paths exercise
  the same setup behavior.

### Security and recovery

- Interactive details, launch commands, and backup paths pass through the
  existing terminal-control and bidi sanitizer.
- Failure text maps bounded child status only; it never echoes captured child
  output, arguments, or arbitrary signals.
- Failed delegated setup offers `side-glance init` and
  `side-glance doctor --json` without claiming a rollback or no-write outcome.
- Existing revalidation, symlink, identity, permission, backup, locking, and
  rollback-conflict tests remain green.

### Performance

- Rendering remains linear over four provider observations and their bounded
  warning set.
- No runtime dependency, network request, process probe, or additional provider
  command execution was introduced.
- Package size and build paths remain covered by the packed npm and native SEA
  distribution tests.

## Product and documentation review

- Both public READMEs explain that availability means a provider CLI executable
  is visible on the invoking Terminal's `PATH`.
- The documentation explicitly says a missing CLI does not make an account or
  desktop application unavailable, and a desktop app counts only when it exposes
  its CLI to that shell.
- The review and completion state that setup does not live-test notification
  delivery or sound.
- The changelog describes only implemented presentation and recovery behavior.

## Verification

- RED proof: six focused transcript/documentation assertions failed against the
  previous output; the bounded-warning assertion also failed before its map was
  implemented.
- Full `npm test`: pass.
- Unit: 148/148 pass.
- Integration: 109 pass, 1 environment-dependent live tmux test skipped.
- Distribution: 19/19 pass, including a packed offline `npx` handoff to an
  existing durable executable and native SEA enhanced/static smokes.
- Site: 37/37 pass; rendered HTML: 2/2 pass.
- Coverage: 257 pass, 1 tmux skip; lines 91.03%, branches 78.14%, functions
  95.50%.
- Typecheck, Biome, ESLint, `git diff --check`, and production build: pass.
- Production build retains the existing non-fatal Alan Sans fallback warning.

## Rollback

No data migration or configuration-format change was introduced. Reverting the
feature commit restores the beta.6 transcript. Users can continue to force the
static surface with `SIDE_GLANCE_ACCESSIBLE=1`, `NO_COLOR=1`, or `TERM=dumb`.
