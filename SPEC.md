# Spec: Side Glance

> Filed by: Codex root session
> Status: approved
> Last updated: 2026-08-12

## One-line Summary

Build a safe, local-first attention layer that lets any coding CLI report working, waiting, ready, failed, and inactive state through a shared terminal/tmux controller, with a polished interactive product site.

Side Glance is distributed like a native terminal tool: GitHub is the canonical source and release record, checksummed standalone artifacts with workflow attestations are the primary runtime, Homebrew is the preferred macOS installer, and `side-glance` on npm provides a Node-based install plus an `npx` trial path.

## Objective

Side Glance replaces the personal Claude Code `stoplight.sh` with a typed controller, a universal supervised wrapper, and native adapters for CLIs that expose lifecycle hooks. It serializes state changes, rejects stale generations, arbitrates multiple sessions that share a terminal surface, validates all terminal targets, restores only Side Glance-owned state, and includes recovery tools for failure paths in which normal cleanup cannot execute.

It is for developers who run multiple coding-agent sessions and need to see which terminal needs attention without constantly foregrounding each window.

Success means all controller invariants have executable regression tests; Claude Code and Codex adapters produce the documented normalized events; any executable can be lifecycle-supervised; install/uninstall preserve existing configuration; unsupported terminals safely no-op; and the responsive site uses the actual Side Glance phase model in an accessible live demonstration.

## Assumptions

- [x] Side Glance is a separate product from ChangeScribe and lives in its own `side-glance` GitHub repository and local worktree.
- [x] Node 24.18.0 is the pinned development and release-build runtime; the bundled npm CLI supports Node 22+; macOS and Linux receive terminal-background support, while unsupported/Windows surfaces safely degrade to status and notification channels.
- [x] Claude Code and Codex are the first installed adapters; Gemini CLI, OpenCode, and Aider receive tested adapter contracts/install manifests without pretending they are locally available for live verification.
- [x] The current thermal palette and adaptive urgency concept remain, but lifecycle ordering and ownership take precedence over cosmetic behavior.
- [x] “Any coding CLI” means every executable can use the wrapper/protocol baseline; native semantic fidelity depends on events the underlying CLI actually exposes.
- [x] The repository remains a private release rehearsal until an explicit publication action makes it public; no packaging test may publish, tag, deploy, or mutate live provider configuration.
- [x] The root remains a private workspace for the site and development tooling; only `packages/cli` is publishable.
- [x] Standalone macOS/Linux artifacts embed their runtime and are the source consumed by Homebrew; Windows remains documented as unsupported until its terminal targeting has real coverage.
- [x] `npx side-glance` is for evaluation and diagnostics. Provider hooks must reference a durable installed executable, never an npm cache path.

## Success Criteria

| # | Criterion | How we measure | Target |
|---|---|---|---|
| 1 | Stale-event safety | Reducer and concurrent-controller tests | Older generation never changes resolved surface state |
| 2 | Multi-session safety | Lease arbitration tests | Releasing one owner never clears another; deterministic priority winner |
| 3 | Input and state safety | Boundary, corruption, traversal, symlink, and permission tests | Invalid data rejected; no evaluation or out-of-root write; private state modes |
| 4 | Terminal safety | PTY/fixture renderer tests | Exact allowed OSC bytes; regular files/symlinks/unowned targets rejected |
| 5 | Cleanup coverage | Lifecycle, wrapper-signal, session-end, stale-lease tests | Deterministic cleanup whenever controller/wrapper survives; recovery otherwise |
| 6 | tmux preservation | Isolated tmux integration tests | Exact pre-existing local options restored; multi-pane limitation explicit |
| 7 | Adapter fidelity | Fixture tests for Claude, Codex, Gemini, OpenCode, Aider/generic | Documented provider events map to normalized protocol without prompt content |
| 8 | Non-destructive setup | Temp-home installer tests | Install/uninstall idempotent and preserve unrelated hooks/notify configuration |
| 9 | Operability | CLI integration tests | `doctor`, `status`, `preview`, `reset`, `event`, `run`, `install`, `uninstall` return actionable results |
| 10 | Product site | SSR, accessibility, interaction, browser, and build checks | Responsive, keyboard usable, reduced-motion safe, no console/network failures |
| 11 | npm package integrity | `npm pack` allowlist and isolated prefix installation | Tarball contains only the compiled CLI and package docs; `side-glance` runs without site dependencies on supported Node |
| 12 | Durable hook installation | Global-package symlink and standalone-binary integration tests | Installer resolves and validates a stable executable; ephemeral `npx` locations are rejected for hook activation |
| 13 | Standalone releases | Native artifact build and smoke tests on each release runner | `side-glance` runs without a system Node installation; archive names, checksums, and version match the tag |
| 14 | Homebrew readiness | Formula generation and `brew audit`/install test | Formula selects the correct release artifact and installs the standalone `side-glance` executable |
| 15 | Supply-chain safety | Release workflow policy and dry-run checks | Least-privilege permissions, immutable tags, SHA-256 checksums, attestations/provenance where supported, no long-lived publish token in source |

## Non-Goals

- Guaranteed cleanup after the CLI, controller, wrapper, shell, and watchdog all receive `SIGKILL`, after power loss, or after the terminal emulator has died.
- Exact recovery of an unknown background/title that a terminal does not reliably expose.
- Different whole-window OSC backgrounds for separate panes in one tmux client.
- Persisting prompts, assistant messages, transcripts, or secrets.
- Shipping a hosted account, telemetry service, or cloud synchronization system.
- Claiming Windows support before Windows terminal discovery, rendering degradation, and installer behavior have live release coverage.
- Automatically publishing from ordinary branch pushes or pull requests.

## Users and User Stories

- As a developer with several coding agents open, I want terminal state to show which session is working, waiting, ready, or failed so I can direct attention quickly.
- As a developer using multiple CLIs, I want one controller and installation model so each integration behaves consistently.
- As a cautious terminal user, I want reset/uninstall to preserve my existing configuration and explain platform limitations.
- As a prospective user, I want to try the real state model on the landing page before installing anything.

## Tech Stack

- Language: TypeScript 5.9; Node 24 for development and release builds; bundled JavaScript targets the documented npm runtime floor
- Site: React 19 + Next.js 16 + Tailwind 4, built and hosted exclusively through the standard Next.js/Vercel path
- CLI persistence: versioned JSON with atomic rename and cross-process lock directory
- Tests: Node test runner for unit/integration, isolated PTYs/tmux where available, browser verification for the site
- Hosting: Vercel production deployment after a verified unaliased candidate; rollback retains the prior deployment
- Distribution: npm workspace package, Node single-executable artifacts, GitHub Releases, and a Homebrew formula generated from release metadata

## Commands

```bash
npm install
npm run dev
npm run test:unit
npm run test:integration
npm run lint
npm run typecheck
npm run build
npm test
```

## Project Structure

```text
app/                 → interactive landing page
packages/cli/        → public npm manifest and package-specific documentation
scripts/release/     → deterministic CLI, standalone artifact, checksum, and formula builders
src/core/            → typed protocol, reducer, leases, policy, persistence
src/renderers/       → terminal, tmux, and notification renderers
src/adapters/        → provider lifecycle translators and installers
src/cli/             → command interface and wrapper supervision
tests/unit/          → pure behavior tests
tests/integration/   → filesystem, process, PTY, tmux, installer, and CLI tests
docs/                → audit, architecture, adapter protocol, launch notes
```

## Testing Strategy

- Every behavior begins with a focused failing Node test and its observed `RED` output.
- Pure reducer, protocol, policy, sanitization, and installer-merge logic are unit tested.
- Atomic persistence, concurrent writers, child supervision, CLI commands, terminal bytes, and tmux restoration are integration tested.
- The critical browser flow is: load the homepage, choose each phase, use keyboard controls, copy the install command, switch visual channels, and verify responsive/reduced-motion behavior.
- Enforced Node-native coverage target for `src/core`: 90% lines, 70% branches, and 95% functions. The verified baseline is 91.38% lines, 73.31% branches, and 98.81% functions.
- Distribution tests inspect the exact packed tarball, install it into an isolated npm prefix, execute its `side-glance` bin, extract and smoke the exact native archive, and validate the generated Homebrew formula. Tap audit and URL installation run only after immutable release assets exist.

## Boundaries

**Always do:** validate external input; preserve existing configuration; test failure paths; keep state private; use explicit capability detection; document degraded behavior.

**Ask first:** change GitHub repository visibility; create a public release/tag; publish or stage to npm; create or mutate a Homebrew tap repository; mutate the user’s live Claude/Codex configuration; replace an existing completion notifier; delete the Vercel project or change its production domain.

**Never do:** write to an unverified path as a TTY; execute state; log prompt/transcript content; use `SIGKILL` cleanup as a product claim; overwrite unrelated hooks; hide a failing gate.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Native CLI event contracts change | Medium | High | Thin versioned adapters, fixture tests, and `doctor` capability reports |
| Terminal/multiplexer variance | High | Medium | Renderer capability matrix, safe no-op, PTY tests, isolated tmux verification |
| Lock left after abrupt death | Medium | Medium | Owner identity, stale-lock timeout, atomic writes, startup reconciliation |
| Shared terminal has competing mutator | Medium | Medium | Surface leases, generation CAS, explicit ownership semantics, reset command |
| Landing page overclaims guarantees | Medium | High | Copy derives from this spec and includes the failure-domain boundary |
| npm cache or version-manager path becomes a permanent hook | Medium | High | Resolve durable installs, reject ephemeral cache paths, and test global-prefix installation |
| Release artifact differs from tested source | Low | High | Build after tests from an immutable tag, generate checksums/attestations in the same workflow, smoke-test downloaded artifacts |
| Public supply chain is compromised | Low | Critical | Minimal workflow permissions, protected release environment, npm OIDC trusted publishing after repository visibility permits provenance |
| A second hosting toolchain silently returns | Low | Medium | Contract-test the canonical Next.js scripts and reject Cloudflare/vinext dependencies and source artifacts |

## Vercel Deployment Contract

The requester explicitly approved deploying the landing page to Vercel. Success means:

- the repository has an explicit, test-covered Vercel build contract using standard Next.js;
- `dev`, `build`, and `start` use the standard Next.js CLI, and Vercel invokes the canonical `build` script;
- no Cloudflare Worker, vinext, Wrangler, Vite bridge, or D1 starter artifact remains in the site toolchain;
- an unaliased Vercel candidate is built first and returns the Side Glance page with no browser console or network errors;
- the exact verified candidate is promoted to the production alias rather than rebuilt;
- metadata resolves to the Vercel production hostname; and
- the production URL and rollback command are recorded in `LAUNCH.md`.

## Linear Homepage Token-Parity Contract

The requester chose the current Linear homepage as the implementation reference, not merely a mood reference. Side Glance keeps its own content, phase colors, and four-terminal product story, but its marketing typography, neutral surfaces, control feedback, and entrance timing must use the measured values served by `linear.app/homepage` on 2026-08-13. The dated evidence and source asset hashes live in `docs/linear-homepage-token-audit.md`.

Success means:

- marketing text uses Inter Variable with weights 400, 510, 590, and 680, `"cv01", "ss03"` OpenType features, and automatic optical sizing;
- the proportional fallback stack and display scale match Linear's current tokens; the live hero uses 64px at weight 510, line-height 1, and `-.022em` tracking on desktop, 56px/1.1 on laptop, and 38px/1.1 on mobile;
- the site exposes Linear's measured layout, radius, neutral color, shadow, duration, and easing values as named CSS custom properties rather than scattered approximations;
- the hero text uses Linear's current shared reveal primitive exactly: a 1-second tween with `cubic-bezier(.25, .1, .25, 1)`, entering from opacity 0, blur 10px, and translateY 20%, with desktop line delays of .4s and .5s and description delay of .6s;
- ordinary interactive controls transition explicit properties for .16s with `cubic-bezier(.25, .46, .45, .94)` and press to scale .97;
- ambient illustration timing uses the measured 1.3s delay, 1.5s duration, and `cubic-bezier(.455, .03, .515, .955)` where it corresponds to Linear's background/UI reveal;
- hero and below-the-fold entrances run only on a fresh, no-hash, no-reduced-motion visit and are cancelled rather than restarted after the visitor scrolls;
- staged spatial choreography may still use Motion where geometry changes, but its timing and easing values must import from the same typed token module used by the CSS contract;
- Side Glance's semantic Working, Ready, Waiting, and Failed palette remains the canonical CLI palette and is not replaced by Linear's brand colors;
- Berkeley Mono is named as the preferred terminal font only when it is already licensed and installed by the visitor; Side Glance does not redistribute or hotlink Linear's proprietary font asset, and uses a documented system-monospace fallback otherwise;
- `prefers-reduced-motion: reduce` removes entrances, ambient loops, smooth scrolling, and meaningful transition delay while leaving every element visible; and
- desktop at 1440×900 and 1256×833 plus mobile at 390×844 pass computed-style, animation-timing, overflow, keyboard, console, and network checks against the captured values.

## Four-Terminal Storyboard Contract

The requester’s real workflow is four coding-agent terminals open at once. The hero visual must explain that origin story before it explains individual controls. Success means:

- the first rendered frame contains four distinct terminal sessions in a legible 2×2 grid, matching the supplied desktop workspace rather than a generic single-window mockup;
- a finite, human-readable stage sequence wakes the sessions in lifecycle order and then resolves the grid into one layered stack;
- the final stack is ordered from cool to urgent—Working (cyan), Ready (green), Waiting (amber), Failed (red)—with all four state colors still visible;
- animation timing, terminal data, layout values, and spring values live in named storyboard/config objects rather than inline JSX magic numbers;
- repeated terminal windows render from one data array, and one integer stage drives the visual sequence;
- the sequence runs once on load, completes in under five seconds, remains fully operable while moving, and offers an explicit Replay control after completion;
- the existing interactive single-terminal state playground remains available below the hero rather than competing with the opening storyboard;
- `prefers-reduced-motion: reduce` skips directly to the ordered final stack with no running animation; and
- desktop and 390×844 mobile browser checks show all four windows, no horizontal overflow, no runtime/console errors, and successful playground interaction.

## Lenis Smooth Scrolling Contract

The landing page uses Lenis's supported React adapter at the document root. Success means:

- the app imports `lenis/dist/lenis.css` and mounts one root `ReactLenis` instance from `lenis/react`;
- Lenis owns its automatic animation-frame loop and enables the site's existing anchor links;
- navigation stops any previous scroll inertia before beginning the next anchor transition;
- `respectReducedMotion` remains enabled so wheel smoothing is disabled and anchor navigation is immediate when the visitor requests reduced motion;
- touch scrolling remains native and the integration does not add custom easing, multipliers, nested-scroll traversal, or a second animation loop;
- the previous global `scroll-behavior: smooth` declaration is removed so Lenis is the only smooth-scroll controller; and
- desktop, mobile, and reduced-motion browser checks show the Lenis root class, working anchor navigation, no horizontal overflow, and no runtime errors.

## Agentation Environment Contract

Agentation is an annotation aid for development review, never a production feature. Success means:

- `agentation` is pinned as a development dependency and mounted through a client-only component with no sync endpoint;
- the toolbar renders when `NODE_ENV=development`, `VERCEL_ENV=development`, or `VERCEL_ENV=preview`;
- the toolbar does not render for a local production build, `VERCEL_ENV=production`, an unknown environment, or the public production alias;
- the environment decision is centralized in one pure predicate with a complete test matrix rather than scattered JSX checks;
- the ordinary production build's rendered HTML contains no Agentation toolbar markup;
- the Vercel Preview deployment visibly exposes the toolbar and returns HTTP 200; and
- the existing production deployment remains untouched and is browser-verified without Agentation after the preview ships.

## Side Glance Rename Contract

The project-owned brand, public package, executable, release artifacts, website,
documentation, source identifiers, test fixtures, and automation use one identity:
**Side Glance** in prose and `side-glance` in machine-facing names.

Success means:

- the publishable workspace package is named `side-glance` and exposes only the
  `side-glance` executable;
- help, errors, install commands, provider hooks, standalone archives, Homebrew
  formulae, CI artifact names, repository metadata, and site metadata agree;
- new runtime state uses Side Glance-owned environment variables, markers,
  directories, filenames, and tmux identifiers;
- installers can still recognize and remove pre-rename managed hooks so an upgrade
  never strands configuration that the product owns;
- the entire test suite, coverage gate, lint, typecheck, build, distribution checks,
  and real-browser checks pass; and
- a final case-sensitive repository scan finds no stale project branding outside
  explicitly documented migration-only identifiers or ordinary operating-system
  process-signal terminology.

**Always:** preserve terminal safety, lease ownership, configuration preservation,
and recovery semantics while changing identity.

**Ask first:** publish the npm package, rename a remote repository or hosted project,
promote a deployment, or mutate live provider configuration.

**Never:** make an external publication during this source rename, drop ownership of
previously managed hooks, or disguise a stale product reference as generic wording.

## Open Questions

No local implementation decision is blocking. The first public release still requires explicit approval and external setup for repository visibility, protected rulesets/environments, npm ownership and trusted publishing, private vulnerability reporting, and the Homebrew tap destination.

## Desktop Notification and Sound Contract

Side Glance adds an explicit, local-first computer-notification channel for developers
running several coding agents at once. The channel is disabled by default and is
enabled only through `--notifications` or the matching Side Glance environment
configuration.

Success means:

- accepted `turn.completed`, `attention.waiting`, `turn.failed`, and
  `turn.cancelled` events each request one desktop notification; session start, turn
  start, acknowledgement, teardown, duplicate event IDs, stale timestamps,
  generations, and turn IDs request none;
- notification delivery is independent of visual surface ownership and terminal target
  discovery, so a lower-priority or targetless session still reports its own accepted
  attention event;
- macOS uses `/usr/bin/osascript` without a shell to request Notification Center with a
  bounded title/body and configurable installed sound name; Linux capability-detects a
  `notify-send` backend and treats sound as best-effort; unsupported/headless systems
  degrade without failing lifecycle state or provider hooks;
- titles contain only Side Glance, provider, normalized phase, and either an explicit
  bounded label or a short deterministic digest of the session ID; provider-generated
  titles, cwd, prompts, responses, transcripts, tool inputs, and secrets are never
  displayed by default;
- `side-glance install <claude|codex|gemini|opencode> --notifications --json`
  persistently enables Side Glance notifications in only Side Glance-owned hook/plugin
  entries, preserves provider-native notification settings and unrelated handlers, and
  remains idempotent and exactly reversible;
- OpenCode installation creates and removes only a managed global plugin that forwards
  documented events as JSON to the durable Side Glance executable; it does not mutate
  OpenCode's native Attention configuration or duplicate provider-native notifications
  unless the user explicitly enables both;
- `side-glance notify --source aider --kind completed --json` gives Aider's static
  notification command a no-stdin bridge using wrapper-provided session/surface
  identity, and documentation pairs it with `side-glance run`; no existing Aider
  notification command is overwritten;
- `side-glance run --notify-on-exit` reports a generic child success, failure, signal,
  or spawn failure exactly once and is documented as process-exit—not per-turn—support;
- `doctor` reports Side Glance's native OS backend and separately reports provider-native
  notification readiness for Codex, Gemini, OpenCode, and Aider without mutating live
  configuration;
- provider hook stdout remains one valid JSON object with no raw terminal bytes;
  provider-native notification commands/settings are preserved byte-for-byte unless a
  future explicit provider-owned operation is separately specified; and
- unit/integration/distribution tests cover notification bytes/arguments, privacy,
  dedupe/staleness, concurrent sessions, missing backends, install/uninstall ownership,
  OpenCode plugin generation, Aider bridge behavior, generic exit semantics, packaged
  execution, and help/docs accuracy.

**Always:** use argument-vector process execution, bound and sanitize every displayed
field, make notification failure non-fatal, preserve provider configuration, and keep
the published CLI dependency-free.

**Ask first:** mutate live provider configuration, fire a real desktop notification in
the user's session during development, publish, deploy, or add a runtime dependency.

**Never:** interpolate untrusted notification content into a shell or script program,
display provider prompt-derived content by default, replace Codex `notify`, change
Gemini/OpenCode/Aider native preferences silently, promise sound on Linux/headless
systems, or describe generic process exit as per-turn completion.

Assumptions approved by the requester's “I want it all; go ahead” direction: native
Side Glance notifications and provider-native alerts may coexist only by explicit user
choice; the default Side Glance notification sound is a configurable macOS installed
sound; exact click-to-terminal routing and delivery while Focus/notification settings
silence alerts are not guaranteed.

## References

- `docs/edge-case-audit.md`
- `PLAN.md`
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Codex hooks: https://developers.openai.com/codex/hooks
- Motion reference: https://linear.app/homepage
- Lenis React README: https://github.com/darkroomengineering/lenis/blob/main/packages/react/README.md
- Agentation install guide: https://www.agentation.com/install

## Sign-off

- [x] Author has written this spec
- [x] Assumptions confirmed by the requester’s “go ahead and fix everything” instruction
- [x] Success criteria are measurable
- [x] Boundaries agreed
- [x] Open questions resolved or explicitly deferred
- [x] Human direction approved implementation
