# Spec: Concise guided setup output

> Filed by: Codex `/root`
> Status: implemented
> Last updated: 2026-08-26

## One-line summary

Turn Side Glance's interactive setup transcript into a calm detect, decide,
review, apply, and launch journey without changing provider planning, writes,
notification semantics, or machine output.

## Objective

The arrow-key prompt works, but the surrounding transcript still exposes
planner, transaction, and bootstrap vocabulary. Interactive setup will name the
provider CLIs found on the invoking shell's `PATH`, identify the skipped CLI
names once, present a compact decision review, finish with one readiness state,
and make the next launch command the most prominent outcome.

This is for someone running `npx side-glance@beta init` or `side-glance init`
for the first time in a normal terminal. Success means they can answer three
questions without interpreting `durable`, `pre-final`, or transaction language,
and can immediately see which command to run next.

## Approved journey

### Detect

- Start with `Side Glance` rather than a diagnostic report heading.
- Render each available provider as found.
- Render skipped provider names once as not found on this Terminal's `PATH`.
- Never imply an unavailable CLI account or desktop application is unusable.

### Decide

- Keep the existing recommended/customize/exit arrow-key interaction.
- Phrase the recommendation as a human outcome: providers plus computer
  notifications, not semicolon-delimited planner data.

### Review

- Show only the selected providers, notification state and sound, and owned
  configuration targets before confirmation.
- State once that no live alert is sent during setup when notifications are on.
- Keep warnings that materially affect the decision.
- Do not show launch commands, hook coverage prose, or transaction mechanics in
  the pre-approval review.

### Apply and complete

- Start progress only after confirmation.
- Do not print the same verification outcome in both the progress line and final
  heading.
- Finish with `Side Glance is ready`, a compact provider/notification summary,
  then a visually separate `Next` launch-command section.
- Show a created backup path as recovery information, but do not repeat the
  configuration path, coverage report, or wrapper explanation.
- Show generic wrapper guidance only when no managed launch command exists.

### Bootstrap handoff and failure

- When `npx` finds an existing durable executable and its interactive setup
  succeeds, do not append an internal `Package installed: no` summary.
- Retain the authoritative bootstrap result for `--json` and dry-run modes.
- Distinguish interruption, timeout, output overflow, signal termination, and
  nonzero exit in human errors when that state is known.
- Give `side-glance init` and `side-glance doctor --json` as recovery commands
  for a failed durable handoff.
- Never claim provider files were unchanged or rolled back unless the delegated
  setup result proves it.

## Success criteria

| # | Criterion | Proof |
|---|---|---|
| 1 | Provider discovery names found and skipped CLIs and explains `PATH` | Unit plus PTY transcript assertions |
| 2 | Interactive review omits coverage, launch, and transaction prose | Unit transcript assertions |
| 3 | Completion has one readiness heading and a separate launch section | Unit, PTY, npm artifact, and SEA assertions |
| 4 | Successful existing-install `npx` handoff emits no bootstrap footer | Bootstrap unit and packed npm PTY tests |
| 5 | Failed handoff reports bounded cause and recovery commands | Bootstrap unit tests for exit, timeout, signal, and interruption |
| 6 | JSON, dry-run, static prompts, and setup transactions are unchanged | Existing integration/distribution suites |
| 7 | README explains CLI-on-`PATH` availability and desktop-app distinction | Documentation claim test |

## Non-goals

- Changing provider detection, supported providers, hook coverage, notification
  defaults, configuration targets, backups, or transaction recovery.
- Adding a full-screen terminal UI, new prompt dependency, stored preference, or
  `--verbose` mode.
- Removing detail from `--dry-run`, `--json`, `doctor`, or explicit automated
  setup output.
- Claiming that a configured notification or sound was live-tested.
- Publishing or promoting a release as part of the implementation commit.

## Technical constraints

- Node 24.18.0 from `.nvmrc`; the npm and SEA bundles remain dependency-free.
- Prompt and detail sanitization continues to neutralize terminal controls and
  bidi formatting.
- The existing planner and projected JSON schemas remain authoritative.
- The interactive renderer may select a concise human projection explicitly;
  automated human output keeps the detailed projection.
- Terminal lines must remain useful in static/accessible mode and within a
  typical 80-column window.

## Boundaries

**Always:** write RED observable-output tests before production edits; preserve
write-after-confirmation; keep errors bounded and truthful; run every repository
gate.

**Ask first:** change provider or notification defaults, add dependencies, alter
JSON schemas, or publish a new package version.

**Never:** execute provider commands during discovery; suppress an actionable
warning; claim rollback or no-change state without evidence; leak internal child
output buffers or unsanitized paths.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Concision hides a decision-critical warning | High | Preserve planner warnings in review and test them |
| Bootstrap error reveals unsafe process detail | Medium | Map bounded status categories; never echo commands or buffers |
| Static and enhanced transcripts diverge | Medium | Assert semantics in unit and real PTY tests |
| Automated consumers parse human text | Medium | Preserve JSON schema and detailed automation output; document human text as presentation |

## Open questions

None. The requester approved the proposed transcript and implementation on
2026-08-26.

## Sign-off

- [x] Request and assumptions are captured.
- [x] Success criteria are measurable.
- [x] Safety and product-claim boundaries are explicit.
- [x] No blocking question remains.
- [x] Requester approved implementation.
