# Spec: Semantic lifecycle colors and aggregate readiness

> Filed by: Codex `/root`
> Status: approved for implementation
> Last updated: 2026-08-26

## One-line summary

Make Side Glance colors describe lifecycle state by default, make optional
completion heat learn a genuinely sliding local ceiling, and prevent Claude from
showing Ready while Side Glance still knows about work in flight.

## Problem

The current completion palette mixes two meanings. A successful turn starts
green, becomes amber, then becomes failure-red solely because it ran longer.
Its `adaptive` ceiling is not learned: a fixed 300-second maximum is only scaled
to 300–450 seconds using how quickly the user returned after an earlier turn.
That response latency is not the turn-duration distribution.

Claude also maps every parent `Stop` directly to Ready. The integration does not
observe `SubagentStart` or `SubagentStop`, and it does not consume Claude's
bounded background-work snapshots. A parent response can therefore paint Ready
while known subagents or scheduled work continue.

The resulting colors attract attention, but their meaning is hard to infer and
users have no guided recovery path when they prefer different logic.

## Approved experience

### Semantic default

The default **Status** theme has one durable meaning per lifecycle state:

| State | Meaning | Default accent |
|---|---|---|
| Working | Work is in motion | cyan/teal `009d89` |
| Waiting | A person must decide | amber `f0a726` |
| Ready | Known work is finished | green `3fa84e` |
| Failed | Work stopped unsuccessfully | red `f33533` |
| Inactive | No session owns the surface | neutral `71807d` |

Ready remains green at every duration. Duration may be exposed as metadata, but
it cannot change Status or Custom hues. The existing tmux markers `● ! ✓ ×`
remain, so color is never the only signal.

### Optional Heat

**Heat** preserves the existing green-to-amber-to-red successful-completion
ramp for people who explicitly want duration prominence. Its maximum is learned
separately for each provider source from recent eligible completed turns.
Ready turns below 10 seconds remain visually quiet in Heat; Status and Custom
show their semantic Ready color immediately.

```text
history                 newest 12 eligible completions per source
cold start              fixed 300s through seven samples
learned target          nearest-rank p80 × 1.5
candidate bounds        60s..7,200s
upward rate limit       max(30s, 20% of current ceiling) per sample
downward rate limit     max(15s, 10% of current ceiling) per sample
eligible sample         1s..28,800s, non-notification, accepted completion
```

At eight or more samples, sort the bounded FIFO and choose
`sorted[ceil(0.8 * n) - 1]`. Clamp `round(q80 * 1.5)` to the candidate bounds,
then rate-limit movement from the persisted ceiling. The current completion is
rendered against the ceiling learned before it; only later completions use the
updated value. The midpoint is `max(20, ceiling / 5)`, preserving the cold
10/60/300-second logarithmic anchors. Response-latency EWMA no longer changes
completion heat.

The history is private duration metadata only: no prompt, command, description,
path, transcript, output, or response content is stored.

### Aggregate Claude readiness

The protocol adds bounded `work.started` and `work.finished` events plus an
optional authoritative active-work snapshot. Claude maps `SubagentStart` and
`SubagentStop` by stable `agent_id`, and parent `Stop` consumes structurally
valid `background_tasks` and `session_crons` registries.

- Missing or malformed registries mean unknown and preserve known work.
- An explicit empty snapshot means Claude reported no registry work; it does
  not erase a separately tracked subagent until its matching `SubagentStop`.
- Nonempty known work keeps the effective phase Working.
- Finishing the last child never creates Ready by itself; a later parent Stop
  must confirm aggregate readiness.
- A child finish first removes that child, then reconciles any valid registry
  snapshot supplied on the same event.
- Same-session resume and compact starts preserve known aggregate work.
- Waiting and Failed continue to own attention even while child work exists.
- Same-timestamp activity wins over completion conservatively.
- `TaskCreated`, `TaskCompleted`, and `TeammateIdle` are not used as active-work
  evidence because they do not provide a truthful paired running lifecycle.

Only bounded work kinds and identifiers are stored. Domain-specific subagent,
background, and cron overflow sentinels remain conservative without making one
domain's authoritative empty snapshot unable to clear another domain.

Ready is a best-known state, not a claim that every parallel Claude hook
accepted the stop. Current Claude hooks expose no post-aggregate commit event.

### User control

`side-glance theme` is a guided arrow-key experience that offers:

- **Status** — semantic colors; recommended and default.
- **Heat** — Ready below 10 seconds stays visually quiet; longer successful
  completions heat up against an adaptive or fixed ceiling.
- **Custom** — one validated wash/accent pair per lifecycle state.

Automation supports `theme show`, `theme set`, `theme preview`, and `theme
reset` with single-object JSON output. Custom values are exact six-digit hex;
no shell or code evaluation is permitted. Guided setup teaches the default in
one compact line and points to `side-glance theme` without adding a mandatory
setup decision.

Configuration lives in a private, atomic file beneath the XDG config directory.
Absent configuration means Status. Invalid configuration is preserved for
diagnosis, never reaches renderer bytes, and falls back safely to Status in
provider hooks; `doctor --json` reports the error. Every parent directory is
identity-checked so a symlink cannot redirect reads or writes.

### Public explanation

The CLI, README, package README, and website use the same state legend and
algorithm. The focused homepage demonstrates Working, Waiting, Ready, and
Failed, with short and long Ready both green. Public copy explains that Heat is
optional, learns only local duration numbers, and that known Claude subagent
work delays Ready. The website never claims it can inspect local history.

## State and compatibility

- Event protocol remains version 1 with additive optional bounded fields.
- Persisted lifecycle state upgrades from schema 1 to schema 2.
- Schema-1 sessions, surfaces, replay IDs, and response EWMA are retained.
- Schema 2 adds provider duration profiles and per-completion ceiling snapshots.
- A bounded semantic-turn identity prevents retries or completion corrections
  from training one turn more than once.
- A normal atomic update writes the migrated state; upgrade alone does not
  repaint a surface.
- Existing seven-hook Claude installs become `partial`; the next init/setup or
  install adds only `SubagentStart` and `SubagentStop` and preserves third-party
  hooks.

## Success criteria

| # | Criterion | Proof |
|---|---|---|
| 1 | Status renders all Ready durations green and Failed red | Policy, visual, renderer, site tests |
| 2 | Heat ceiling learns the specified bounded source-local FIFO | Policy and reducer test matrix |
| 3 | The completion that trains a profile uses its prior ceiling | Controller repaint tests |
| 4 | Known Claude child/background work prevents Ready and notification | Adapter, reducer, controller, integration tests |
| 5 | Old state and old Claude installations migrate without data loss | Store and installer integration tests |
| 6 | Theme guidance supports Status, Heat, Custom, review, cancellation, JSON, and reset | CLI unit and PTY tests |
| 7 | Invalid theme files cannot poison rendering and are diagnosable | Config and doctor tests |
| 8 | README, package README, and website explain the same lifecycle | Documentation and site tests |
| 9 | Browser behavior works on desktop/mobile, keyboard, and reduced motion | Real-browser verification |
| 10 | Protected beta release reaches main, Vercel, npm beta, GitHub, and Homebrew | Release workflow and public artifact checks |

## Non-goals

- Guaranteeing acceptance by every parallel provider hook.
- Blocking Claude, parsing transcripts, or inspecting task files.
- Treating pending task-list items as active computation.
- Per-child colors, labels, notifications, or surface leases.
- Moving npm `latest` to a beta.
- Claiming the custom production domain is live before its public DNS resolves.

## Boundaries

**Always:** write observable RED tests before each production slice; retain
non-color markers; bound untrusted IDs, arrays, files, and duration values; use
atomic private writes; preserve unrelated provider configuration; run every
repository and browser gate before promotion.

**Ask first:** none for the approved phase. The requester explicitly authorized
implementation, protected merges, publication, and deployment on 2026-08-26.

**Never:** publish from a feature branch; move or delete a protected release
tag; silently treat malformed work registries as empty; execute custom theme
input; store provider content; bypass a protected check; promote anything other
than literal `staging` to `main`.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A confident Ready is emitted while work remains | High | Conservative aggregate set, explicit-empty semantics, post-reducer notification gate |
| One unusual duration poisons future heat | Medium | p80, bounded sample, FIFO, rate limits, source isolation |
| Invalid custom color reaches terminal control bytes | High | closed schema, exact hex, safe fallback, renderer receives parsed values only |
| State upgrade loses active sessions | High | explicit schema-1 migration and round-trip tests |
| New hooks overwrite user config | High | existing transactional installer, owned-handler matching, backup and verification |
| Homepage becomes a settings dashboard | Medium | focused lifecycle storyboard; detailed control remains in CLI/docs |

## Open questions

None. The requester approved the complete endeavor and protected release path on
2026-08-26. The implementation assumes beta.7 remains unused at final release
preparation; otherwise it will select the next unused beta.

## Sign-off

- [x] Feedback and current failure are captured.
- [x] State meanings and adaptive algorithm are exact.
- [x] Success criteria are measurable.
- [x] Safety and product-claim boundaries are explicit.
- [x] No blocking question remains.
- [x] Requester authorized implementation and publication.
