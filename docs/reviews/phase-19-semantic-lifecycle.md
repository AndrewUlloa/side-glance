# Review: Semantic lifecycle colors and aggregate readiness

> Spec: `docs/specs/phase-19-semantic-lifecycle.md`
> Plan: `docs/plans/phase-19-semantic-lifecycle.md`
> Status: verification in progress; awaiting final browser preview
> Reviewed: 2026-08-26

## Outcome

Phase 19 gives Side Glance one default color language: Working is cyan, Waiting
is amber, Ready is green, Failed is red, and Inactive is neutral. A successful
turn cannot become failure-red merely because it ran longer. People who prefer
the earlier duration ramp can deliberately choose Heat; its ceiling now learns
from a bounded, provider-local sliding window of completed-turn durations.

Claude's managed integration also delays Ready while Side Glance still knows a
subagent, background task, or session cron is active. The result remains an
honest best-known state because Claude exposes no post-aggregate commit hook.

The experience-design storyboard found and resolved three final frictions: invalid
fixed/custom theme values now explain the constraint and retry in place, and
`theme show --json` exposes current sample counts and learned ceilings instead
of making adaptation invisible. Real-browser review found and fixed both a
duplicate React key in the Failed transcript and an animation race that could
replace a person's manual lifecycle selection four seconds later. Manual
pointer and keyboard selections now pause the demo. No required finding remains.

## Journey storyboard

| Moment | User action and visible response | Feeling | Evidence |
|---|---|---|---|
| Discover | The homepage opens on a focused terminal with Working, Waiting, Ready short, Ready long, and Failed moments. Choosing a moment pauses the automatic tour so it stays inspectable. | Clarity 5/5 | Both Ready moments share `#3fa84e`; Failed uses `#f33533`; browser and source contracts prove the manual pause. |
| Install | `npx side-glance@beta init` keeps the recommended provider path short, then reviews `Colors: Status · Ready green · Waiting amber · Failed red`. | Confidence 5/5 | Existing arrow-key/static setup and PTY contracts remain green. |
| Work fans out | Claude emits a bounded `SubagentStart`; a parent Stop and an empty background registry cannot erase that separate evidence. | Trust 5/5 | Reducer and installed-hook integration remain Working until matching `SubagentStop`. |
| Work finishes | A later parent Stop with no known registry work produces Ready. Long and short success use the same green; the effective post-reducer phase gates alerts. | Relief 5/5 | Controller tests prevent paint/notification while aggregate work remains. |
| Work fails | Failed is immediately red, carries a distinct `×` marker, and the site transcript says publication stopped. | Urgency 5/5 | Core renderer and live browser show `#732018`/`#f33533`. |
| Meaning feels wrong | `side-glance theme` opens an Up/Down selector for Status, Heat, or Custom, reviews the consequence, and asks before writing. | Agency 5/5 | Real PTY tests cover selection, confirmation, cancellation, and input retry. |
| Heat is chosen | Adaptive Heat says it learns from 12 recent turns; `theme show --json` reports each provider's sample count and current ceiling. Fixed Heat remains available. | Comprehension 4/5 | Exact cold start, p80, bounds, rate limits, FIFO, source isolation, and prior-ceiling tests pass. |
| Config breaks | Runtime falls back to Status without rewriting the invalid file; `doctor --json` reports the bounded error. | Recovery 5/5 | Linked, oversized, unknown-field, permission, and atomic-write contracts pass. |

The exact adaptive formula remains progressive disclosure: the homepage teaches
lifecycle state and says Heat learns from recent local turns, while the README
and CLI expose the 12-turn window, sample count, and learned ceiling.

## Five-axis review

### Correctness

- The current completion captures the prior ceiling before its duration trains
  the source profile.
- Notification-only or inherited-notification completions never train duration
  history.
- Missing or malformed Claude registries preserve known work. Empty registry
  snapshots clear registry work but cannot erase a separately tracked subagent.
- Same-time positive work evidence wins over completion, and a child finish
  cannot independently create Ready.
- Status and Custom keep semantic hues constant; Heat alone uses duration hues.

### Simplicity

- The default has no new setup decision. Setup teaches the semantic line and a
  single recovery command.
- The existing prompt adapter powers theme selection; no TUI dependency or
  executable configuration language was introduced.
- Twelve rounded seconds and one ceiling per provider are sufficient state for
  the learned model.

### Architecture

- Provider adapters normalize bounded work evidence; the reducer owns lifecycle
  truth; the controller renders and notifies only the effective reduced phase.
- Appearance parsing and persistence are separate from rendering. Renderers see
  only validated themes and bounded ceilings.
- Schema 1 migrates in memory to schema 2 without repainting merely because the
  binary was upgraded.

### Security and privacy

- Work state stores only bounded kind/ID pairs; no prompt, command, description,
  output, path, transcript, or response content is retained.
- Config uses a closed JSON schema, six-digit colors, bounded size, verified
  no-follow parent traversal, atomic private writes, and safe Status fallback.
- Provider config updates remain inside the existing transactional installer and
  preserve unrelated hooks.

### Performance and distribution

- Profile work sorts at most 12 numbers; aggregate snapshots retain at most 32
  bounded references with an overflow sentinel.
- The package remains dependency-free at runtime and adds no network request.
- Source, PTY, packed npm, standalone native, website, and protected release
  paths remain covered by the repository gates.

## Browser evidence

- Desktop: 1280×720, zero horizontal overflow, short/long Ready both
  `#173326`/`#3fa84e`, Failed `#732018`/`#f33533`.
- Mobile: 390×844, terminal and all five lifecycle controls fit with zero
  horizontal overflow.
- Keyboard: native buttons retain visible `:focus-visible` treatment; manual
  pointer or keyboard activation pauses playback instead of racing the timer.
- Console/assets: the post-feature browser pass had no page errors or failed
  images. The final local server emitted only the known non-fatal Alan Sans
  fallback-generation warning; the production build and rendered HTML passed.
- Reduced motion: the browser runtime reported the normal preference; the
  reduced path is separately enforced by `useReducedMotion`, media-query, first
  hydration, and rendered-CSS tests because this browser backend cannot emulate
  the OS preference.

## Required findings resolved

1. Replace the response-return heuristic with an actual completed-duration FIFO.
2. Make semantic Status the default and keep legacy heat explicit.
3. Preserve tracked subagents across unrelated empty registry snapshots.
4. Retry invalid guided theme values with an actionable constraint.
5. Expose learned ceilings and sample counts through theme inspection.
6. Give repeated Failed transcript actions unique React keys.
7. Reconcile `work.finished` child removal with supplied registry snapshots.
8. Make activity, work, waiting, and failure evidence beat completion at equal
   timestamps; require Ready completion to be strictly later than work evidence.
9. Preserve known aggregate work across same-session resume and compact starts.
10. Gate notification delivery on the reduced session's effective confidence.
11. Train one duration sample per semantic turn and reject incoherent profiles.
12. Close every persisted nested schema and validate bounded work identifiers.
13. Reuse the hardened config-target machinery for every appearance parent.
14. Split overflow sentinels by subagent, background, and cron provenance.
15. Preserve and accurately report existing Heat or Custom setup choices.
16. Preselect current theme values, review all Custom pairs, add help, repair
    backups, cancellation, accessible fallback, and packed artifact coverage.
17. Pause the website's automatic tour after a manual lifecycle choice.

## Verification gates

- Unit: 181 passing.
- Integration: 124 passing; one intentional live-tmux skip.
- Distribution: 19 passing, including packed npm and standalone theme smokes.
- Site: 37 passing; rendered HTML: 2 passing.
- Coverage: 305 passing and one skip; 93.05% lines, 82.69% branches,
  96.99% functions.
- Lint, typecheck, production build, aggregate `npm test`, and
  `git diff --check`: passing.

## Rollback

Before publication, revert through a protected PR. After an immutable beta tag,
fix forward with the next unused beta. Users can immediately select Status,
fixed/adaptive Heat, Custom, or reset to Status without rewriting provider hooks.
