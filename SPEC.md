# Spec: Side Glance

> Filed by: Codex root session
> Status: approved
> Last updated: 2026-08-24

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
| 16 | Guided setup | Temp-home CLI, planner, rollback, and packaged-install tests | One re-runnable command detects providers, previews owned changes, configures selected integrations, verifies the result, and exactly rolls back caught multi-provider apply/verification failures when no external writer has intervened |

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
- As a new user, I want one guided setup command that detects my coding agents, explains notification tradeoffs, and gives me the exact launch commands without requiring me to edit provider configuration by hand.
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

## Guided Setup Contract

> Amendment status: approved by the requester on 2026-08-24

Side Glance adopts the useful onboarding shape of Ultracite's `init` command: one
discoverable, interactive-by-default entry point; environment-aware recommendations;
explicit automation flags; and safe re-runs. Because Side Glance configures global
provider files rather than a project-local toolchain, its setup flow adds a complete
read-only preview and a multi-provider rollback boundary.

The primary journey is:

```bash
brew install AndrewUlloa/tap/side-glance
side-glance init
```

The public discovery journey is:

```bash
# During the beta channel
npx side-glance@beta init

# After the stable package owns the latest tag
npx side-glance@latest init
```

### User experience

- `side-glance init` (and its exact `setup` alias) runs interactively only when both input
  and output are attached to a TTY. It introduces Side Glance, performs read-only detection,
  and shows installed,
  already configured, partially configured, experimental, incompatible, and unavailable
  provider states without executing provider binaries.
- Discovery classifies each provider as `eligible`, `blocked`, `unavailable`, or
  `guidance-only`. Only an `eligible` provider is selected by default: its binary is
  present, its configuration target passed read-only safety checks, and its supported
  integration contract is not contradicted by detected overrides. Already configured
  providers remain selectable only while eligible. A blocked provider is displayed with
  a redacted reason but cannot be selected; unavailable providers are informational;
  Aider and generic commands are guidance-only. When nothing is eligible, setup exits
  read-only with guidance instead of forcing an empty or unsafe plan.
- Claude, Codex, Gemini, and the stable-command OpenCode v1 contract are selectable
  integration targets. Claude and Codex are labeled contract-audited; Gemini and
  OpenCode remain labeled experimental. The presence of `opencode` makes it a v1-contract
  candidate, not a live version proof; a detected `opencode2`-only beta or active OpenCode
  configuration override is reported as incompatible rather than silently configured.
- Aider and arbitrary commands are reported as supported wrapper/manual-bridge paths,
  not as installable provider-hook targets. Setup never overwrites Aider's notification
  command. The result prints exact Aider and generic wrapper guidance when applicable.
- The user separately chooses which selected providers should use Side Glance computer
  notifications. When provider-native notifications are already ready, setup recommends
  leaving Side Glance notifications off and explains the duplicate-alert risk. This is a
  recommendation, not a silent override.
- Notification defaults are deterministic: native ready defaults Side Glance off with a
  duplicate warning; native unknown defaults off with uncertainty explained; native
  disabled/not configured plus an available Side Glance backend defaults on; a temporarily
  unavailable Side Glance backend defaults off with a degraded warning; and an unsupported
  platform makes Side Glance notifications unselectable. An explicit automation choice
  that cannot be delivered fails before mutation. Codex's effective unfocused default,
  custom top-level notify command, and Gemini's possible higher-precedence override remain
  distinct warnings rather than one generic status.
- The plan states what a selected notification channel can actually report. Claude covers
  attention and failure while pre-final Ready stays silent; Codex and Gemini cover
  attention while pre-final Ready stays silent; OpenCode v1 experimentally covers Ready,
  attention, and failure; Aider completion requires its explicit static bridge; and the
  generic wrapper reports only process exit when `--notify-on-exit` is selected. Setup
  never equates “notifications enabled” with a guaranteed completion bell.
- If any Side Glance notifications are selected, setup explains that macOS uses the
  installed sound name `Glass` by default and allows a different bounded safe name.
  Linux sound remains best-effort. Setup does not fire a real notification or claim
  audible delivery; the user must explicitly run the documented live notification test.
- Before confirmation, setup displays the durable Side Glance executable, every target
  provider, exact configuration path, create/update/unchanged action, managed hook count,
  Side Glance notification choice and sound, provider maturity, and every duplicate or
  compatibility warning. It never prints unrelated configuration contents or secrets.
- One confirmation applies the whole plan. Choosing No or receiving EOF exits `0` with no
  changes; SIGINT exits `130` with no changes before apply and attempts caught-failure
  rollback during apply; an incomplete non-TTY invocation exits `1` actionably.
  `side-glance init --help` and `side-glance setup --help` exit `0` without detection or
  TTY requirements. After application, setup re-inspects every selected provider and reports
  changed/unchanged paths, backups, integration status, warnings, and exact supervised
  launch commands such as `side-glance run --label "Claude" -- claude`.
- Setup states plainly that installed hooks provide lifecycle semantics while
  `side-glance run` supplies the stable terminal surface identity needed for reliable
  lifecycle colors. It creates no aliases or daemon. When explicitly included in the
  reviewed plan, it may add or remove one exact managed zsh startup block that resets
  an inherited Side Glance background in a fresh direct local tab; every unrelated
  shell byte is preserved. It does not claim that computer-notification clicks will
  focus the originating terminal.
- On a durable installation, `side-glance init` is an exact alias for
  `side-glance setup`. Both names share one parser, plan, prompt flow, and result shape;
  help presents `init` as the friendly onboarding command and `setup` as the explicit
  configuration command.

### Npx bootstrap contract

- An ephemeral `npx side-glance@<tag> init` may perform read-only discovery and bootstrap
  a durable installation, but it may never persist its own cache path in provider hooks.
  Ephemeral `setup` and direct `install` mutations continue to fail closed.
- The bootstrap first searches for a separate durable `side-glance` executable, rejects
  `_npx`/npm-exec/cache candidates, executes only `side-glance --version` for validation,
  and hands the approved setup plan to that executable only when its version exactly
  matches the invoking package version. This avoids delegating new setup flags or plan
  fields across an unproven version boundary.
- When no durable executable exists, interactive macOS setup offers Homebrew as the
  recommended method when a supported `brew` executable is available, global npm as the
  portable fallback, and preview-only as the no-mutation choice. Other platforms offer
  only methods whose executable and platform contract can be validated. No path uses
  `curl | sh`, silently copies the npx payload, or invents an unmanaged updater.
- During the beta, bootstrap installation is offered only on the published platform
  boundary: supported macOS and glibc Linux, with Intel macOS still labeled experimental.
  Windows, musl, and other unverified targets receive preview/manual guidance rather than
  an installer choice merely because `npm` or `brew` happens to exist.
- Before running an installer, the bootstrap displays the exact package-manager command,
  destination model, and version/channel consequence, then asks separately for approval.
  Package managers are spawned with argument vectors, never through a shell. Explicitly
  approved interactive execution may inherit stdio; JSON automation captures and bounds
  child output. Cancellation leaves provider configuration untouched.
- After installation, the bootstrap resolves the new executable independently, confirms
  it is durable and exactly version-matched, and then invokes its `init` flow. A missing,
  stale, or mismatched result fails actionably before provider configuration is changed.
- Global npm pins the exact build with `npm install --global --ignore-scripts --no-audit --no-fund side-glance@<exact-version>`, never a mutable channel tag. Homebrew distinguishes first
  install from upgrade and retains the stable Homebrew bin symlink rather than a versioned
  Cellar path. Because an npm beta can briefly precede its tap update, a mismatched formula
  fails without config changes; interactive mode may offer the exact npm method only after
  a new explicit choice, while automation never falls back silently.
- Fully specified bootstrap automation uses
  `--install <homebrew|npm|none> --providers <list> --notifications <list|none> --yes`.
  `--install none` is valid only with `--dry-run`. The chosen method must be available;
  setup never silently falls back to a different installer.
- Bootstrap output distinguishes the temporary npx runner from the durable executable
  that provider hooks will retain. JSON mode reports both paths, versions, install method,
  child exit status, and the delegated setup result without mixing decorative output into
  stdout.
- Package installation is outside the provider-configuration transaction and is not
  automatically removed if post-install validation or delegated setup fails. The result
  reports `packageInstalled` separately from `setupApplied` and gives an explicit cleanup
  command when known.
- Delegation strips inherited npm-exec markers and ephemeral PATH entries, forwards no
  bootstrap-only option, and passes the validated stable invocation path explicitly as the
  setup executable. Candidate and package-manager paths are resolved once to absolute
  validated paths, then identity-checked again before spawn/config apply. Version probes
  have bounded time/output, accept exactly one canonical version line, and never forward
  raw child output.
- Bootstrap planning and provider setup planning are two discriminated stages. If an
  exact-version durable executable exists, npx may delegate dry-run and return its exact
  `setup-plan`. Otherwise `init --dry-run` returns a versioned `bootstrap-plan` containing
  the ephemeral runner, exact proposed installer argv (or none), pending durable status,
  requested provider/notification intent, and safely derived target paths; provider
  create/update/unchanged actions, final hook commands, and launch commands remain
  explicitly deferred. After installation, the durable CLI recomputes and previews the
  authoritative setup plan. The dry-run/apply same-plan invariant begins only after the
  durable executable has been resolved.

### Automation contract

- `side-glance setup --dry-run` performs detection, validation, and planning without
  writing configuration, creating backups/directories, emitting terminal control bytes,
  or sending notifications. With no explicit provider list it previews the detected
  interactive defaults.
- `--providers <claude,codex,gemini,opencode>` fixes the selected provider set.
  `--notifications <provider-list|none>` fixes the Side Glance notification subset, and
  `--notification-sound <name>` is valid only when that subset is non-empty.
- `--yes` accepts a fully specified plan without prompts and requires `--providers` plus
  an explicit `--notifications` value. `--json` is permitted only for dry-run or fully
  specified non-interactive setup and emits one machine-readable result on stdout.
- Advanced `--home <absolute-path>` and `--executable <absolute-path>` options match the
  existing installer testability and custom-home contract. Permanent setup refuses
  `npx`/`npm exec` cache execution and points to Homebrew, a standalone release, or a
  global npm installation. Non-interactive setup without `--dry-run` or a fully
  specified `--yes` plan fails before mutation with an actionable command example.
- `--install` is accepted only by ephemeral `init`; durable `init`/`setup` reject it.
  Providers are normalized to the canonical Claude, Codex, Gemini, OpenCode order
  regardless of flag order. In `--json` mode, success and failure each emit exactly one
  versioned, redacted object on stdout and no stderr; failure uses a nonzero exit status.
  Human mode reserves stdout for progress/results and stderr for redacted errors.
- Unknown, duplicate, empty, unavailable, incompatible, or notification-only provider
  selections fail during preflight. Notification selections must be a subset of the
  provider selections. Unsafe sound names and unstable executable paths fail before any
  configuration target is changed.

### Safety and transactional behavior

- Detection and planning reuse the same typed provider inspections, notification
  readiness, executable validation, managed-entry generation, and ownership markers as
  `doctor` and `install`; setup must not grow a second interpretation of configuration.
- Once a durable executable is resolved, a pure setup plan is computed and every selected
  target is fully parsed and validated before confirmation or mutation. Durable dry-run
  and apply consume that same plan shape.
- Applying a multi-provider plan snapshots the exact pre-transaction existence, bytes,
  mode, and concurrency identity of every target, revalidates the complete approved plan
  under a shared Side Glance installer lock, then uses atomic provider writes with exact
  desired-end-state verification after the final write. Manual install/uninstall use the
  same lock and participant primitives. If a caught write or verification failure occurs,
  setup rolls back in reverse order only after proving each target still matches the state
  written by this transaction. It restores pre-transaction bytes/mode or removes a target
  that was absent before setup, then verifies the restoration. If an external writer has
  intervened, rollback does not overwrite that newer value; it returns a distinct redacted
  rollback-conflict result and never reports success.
- Snapshot, backup, apply, verification, and rollback use the same bounded no-follow read
  and parent-chain validation primitives for JSON provider files and the OpenCode plugin.
  Backups are written from captured bytes with private `0600` permissions rather than
  re-reading a live pathname. Existing target modes are restored; file identity is only a
  concurrency token and is not claimed to survive atomic rename.
- The transaction guarantee covers caught failures while the process can execute rollback.
  A power loss, `SIGKILL`, runtime crash, or terminal death between distinct file renames
  can leave a partial setup; Side Glance does not persist secret configuration snapshots
  in a transaction journal. The next `init`/`doctor` reports partial state and supports an
  idempotent repair. This boundary is stated in help/docs rather than hidden.
- Existing provider installers continue creating their ordinary timestamped backups.
  Re-running an identical setup is idempotent and produces no new backup or write.
- Symlinked, non-regular, oversized, malformed, concurrently replaced, or unsupported
  configuration fails closed. Setup preserves unrelated provider settings, native
  notification preferences, existing non-Side-Glance hooks, and custom completion
  commands byte-for-byte except for the provider file's established formatting behavior.
- Setup output contains no prompt, response, transcript, cwd, token, secret, or raw
  unrelated configuration value. Interactive rendering writes only to its owned TTY;
  JSON mode and provider hooks remain free of decorative or terminal-control bytes.
- Planning may derive redacted errors from hostile configuration but never echoes
  untrusted event keys, values, control characters, version-probe output, or config
  contents. Exact owned paths, selected safe sound, and backup paths are the only intended
  local details in setup output.

### Required proofs

- Focused RED tests precede production code for argument validation, read-only dry-run,
  interactive cancellation, smart notification recommendations, exact plan output,
  idempotent re-runs, unavailable/OpenCode-v2 refusal, ephemeral-execution refusal, and
  post-install launch guidance.
- Foundational RED tests cover parent-directory symlinks, target replacement, same-inode
  edits, absent-to-created races, Side Glance writer contention, exact desired-state
  verification, rollback conflicts, private snapshot-derived backups, and caught signal
  rollback before provider setup becomes user-reachable.
- Temp-home integration tests apply Claude, Codex, Gemini, and OpenCode selections while
  preserving unrelated settings and native notification configuration. Injected failure
  after an earlier provider write proves exact all-target rollback.
- Packaged npm and standalone smoke tests expose `setup` in help and prove that a durable
  installed executable is persisted. Npx bootstrap tests use fake package-manager and
  durable-executable fixtures to prove handoff, version validation, cancellation, child
  failure, and the absence of ephemeral hook paths. No test mutates the requester's live
  provider configuration or sends a real desktop notification.
- An automated PTY smoke against a temp home covers default selection, invalid-input
  reprompting, empty eligibility, confirmation rejection, EOF, SIGINT, no-write-before-
  confirmation, and the complete static/no-color happy path.
- The README, package README, website setup copy, CLI help, and doctor guidance converge
  on Homebrew install followed by `side-glance init`, while keeping the exact `setup` alias
  and explicit manual
  `install`, `uninstall`, and `run` commands available for advanced use and recovery.

**Always:** default to read-only discovery, distinguish provider-native from Side Glance
notifications, preview owned changes, preserve user configuration, and verify the applied
plan.

**Ask first:** mutate the requester's live provider configuration, send a real computer
notification, add a published runtime dependency, publish a package/release, or promote a
deployment.

**Never:** install permanent hooks from an ephemeral executable, silently enable duplicate
notification channels, configure an unavailable/incompatible provider, expose unrelated
configuration in a preview, rewrite shell startup content outside the exact reviewed
fresh-tab block, leave a failed multi-target plan reported as successful, or overwrite a
concurrent external edit during rollback.

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

- accepted native/wrapper-final `turn.completed`, `attention.waiting`, `turn.failed`,
  and `turn.cancelled` events each request one desktop notification; pre-final
  provider completions, session start, turn start, acknowledgement, teardown,
  duplicate event IDs, stale timestamps, generations, and turn IDs request none;
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
- provider hook stdout remains provider-specific and minimal with no raw terminal
  bytes or global state: Claude is silent, while Codex and Gemini receive `{}`;
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

## Beta Release Readiness Contract

The requester approved the complete 2026-08-24 remediation program after the thermal,
provider-runtime, user-journey, and release audits. Side Glance did not promote or
publish beta.3 until the following observable contract was true; later releases retain
these requirements.

### Lifecycle and thermal semantics

- Completed heat represents the duration of the completed turn, not the time that the
  terminal has been sitting ready. The controller converts epoch-millisecond timestamp
  differences to seconds exactly once.
- In optional Heat, turns below 10 seconds remain visually suppressed, 60 seconds maps
  to urgency 500, and the default maximum maps to 300 seconds. Status and Custom show
  quick Ready immediately because their colors communicate lifecycle state, not heat.
- The default Status theme gives lifecycle hues stable meaning: Working is cyan,
  Waiting is amber, Ready is green, Failed is red, and Inactive is neutral. Ready
  never becomes failure-red because a successful turn ran longer.
- Optional Heat preserves the completion ramp and learns separately by provider
  from the newest 12 eligible completed-turn durations. It stays at a 300-second
  cold ceiling through seven samples, then moves a bounded, rate-limited p80 with
  headroom between 60 and 7,200 seconds. The completed turn renders against the
  ceiling learned before its duration trains the profile.
- Legacy reply-latency EWMA remains readable during schema-1 to schema-2 migration
  but no longer changes completion heat. Corrupted or non-finite history is
  rejected at the persistence boundary.
- `preview`, the controller, tmux, terminal output, website models, and documentation use
  one phase-to-visual mapping. Status is the default; Heat and bounded Custom
  semantic pairs are explicit user choices through `side-glance theme`.
- Completed and failed are distinguishable without color. tmux uses different bounded
  markers, and any opt-in terminal-title fallback includes a sanitized phase marker.
- User-facing elapsed copy says `Turn ran` or `Turn duration`; it never implies a
  clock-driven repaint while ready.

### Surface ownership and recovery

- A tmux physical window is one renderable surface even when several panes report
  events. One snapshot is captured before the first Side Glance paint; releasing one
  pane/session recomputes the remaining winner and never clears another active owner.
- Moving one session to a new surface releases its lease on the previous surface before
  painting the new one. Stale generations may not reset or repaint newer owners.
- Wrapper exit ends every non-generic provider session that inherited that wrapper's
  explicit wrapper identity, even when the provider replaces its public session ID.
- Active leases carry bounded freshness metadata. Startup/update reconciliation retires
  an abandoned lease after a documented timeout, restores only Side Glance-owned state,
  and never claims deterministic cleanup after `SIGKILL` or power loss.
- The tmux ownership migration and rollback instructions require
  `side-glance reset --all --json` so pane-scoped snapshots cannot cross the boundary.

### Provider and notification safety

- Hook installation and `doctor` state plainly that lifecycle colors require a verified
  target. For the beta, `side-glance run -- <provider>` is the supported way to provide
  stable surface identity when provider hooks receive piped JSON. Targetless hooks may
  notify but may not claim color support.
- Provider hook stdout contains only the minimal provider-safe acknowledgement and never
  serializes global Side Glance sessions, surface IDs, TTY paths, or tmux identities.
  Full state remains available only through `side-glance status --json`.
- Semantically duplicate permission/wait events notify once per source, session, turn,
  and reason even when provider invocations generate different transport event IDs.
- Claude's immediate permission event and delayed permission notification are deduped.
  Codex's effective default native notification state is reported before Side Glance
  notification opt-in. A notification capability report does not claim that macOS Focus,
  per-app sound settings, or a requested sound name has been audibly verified.
- Managed hooks have explicit short timeouts appropriate to provider contracts; notifier
  or renderer failure cannot block a provider for minutes. Teardown remains best-effort
  and reconciliation repairs missed lifecycle ends.
- Completion adapters do not knowingly emit a final Ready notification while a provider
  contract still permits another hook to block or retry the turn. Where the provider
  exposes no post-acceptance event, the limitation is documented and the confidence is
  not called native-final.
- OpenCode colors-only installation is supported when the stable plugin API is detected;
  incompatible v2-beta APIs fail with an actionable capability message. Aider support is
  the documented static notification-command bridge paired with the wrapper, not an
  undocumented JSON event producer.
- Claude and Codex may be described as locally contract-audited. Gemini, OpenCode, and
  Aider remain experimental until live binary matrices pass; site/package claims use the
  same support tiers.

### Terminal capability and release truth

- Terminal background support is capability-dependent. Terminal.app receives an honest
  warning when OSC 11 has not been manually verified and may opt into a sanitized title
  fallback; title mutation remains disabled by default.
- `doctor` distinguishes binary present, provider-native notifications, Side Glance
  adapter contract, Side Glance integration installed, stable surface identity, and live
  verification. It never collapses these into one `ready` claim.
- The website, README, package README, CLI help, changelog, npm dist-tags, GitHub release,
  and deployed assets describe the version users can actually install.
- Production may use `assets.sideglance.dev` only after public DNS, TLS, and every immutable
  asset are verified. Until then, Production must use the verified R2 development origin
  and custom-domain claims must remain conditional.
- `main` requires the `require-staging-head` check in its live ruleset before promotion.
  Release publication remains an Ask First action and must originate from the exact green
  protected `main` commit.

### Required proofs

- In Heat, epoch-millisecond turns at 5, 60, and 300 seconds produce suppressed,
  urgency 500, and urgency 1000 cold-start results. Eight 400-second completed
  turns move the next provider-local ceiling from 300 to 360 seconds, while one
  high outlier cannot raise a mostly-short profile.
- Every preview phase exactly matches controller and site visuals. Adaptive Heat
  preview with `--source` reads that provider's persisted ceiling; without a source,
  JSON labels the 300-second ceiling as a cold-start hypothetical.
- Two panes in one tmux window share one lease boundary; releasing either cannot clear or
  resurrect the other. A session migration resets the old surface.
- A blocked/retried completion does not notify Ready early; an eight-second Claude
  permission wait produces exactly one alert; hook stdout cannot reveal a second session.
- Killing a waiting provider and starting another on the same surface demonstrates bounded
  reconciliation without wiping a newer generation.
- Manual Terminal.app, iTerm, Ghostty, and tmux checks record supported visible channels.
- A fresh isolated `side-glance@beta` installation exposes exactly the commands and
  behavior documented by the deployed site.

**Always:** use red-green regression tests, keep hooks/configuration reversible, preserve
unrelated provider settings, sanitize all terminal/notification text, and run every
`CLAUDE.md` gate before handoff.

**Ask first:** mutate live provider configuration, fire a real desktop notification,
change live Vercel environment variables or GitHub rulesets, configure DNS, push, merge,
tag, publish npm, create a GitHub release, or create the Homebrew tap.

**Never:** purchase a domain, publish an unreviewed build, hide an unsupported provider
behind universal wording, emit global state to provider stdout, or weaken an existing
test to preserve incorrect beta behavior.

## References

- `docs/edge-case-audit.md`
- `PLAN.md`
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Codex hooks: https://developers.openai.com/codex/hooks
- Motion reference: https://linear.app/homepage
- Lenis React README: https://github.com/darkroomengineering/lenis/blob/main/packages/react/README.md
- Agentation install guide: https://www.agentation.com/install
- Ultracite interactive initialization: https://github.com/haydenbleasel/ultracite#quick-start
- shadcn CLI initialization: https://github.com/shadcn-ui/ui/blob/main/packages/shadcn/src/commands/init.ts

## Sign-off

- [x] Author has written this spec
- [x] Assumptions confirmed by the requester’s “go ahead and fix everything” instruction
- [x] Success criteria are measurable
- [x] Boundaries agreed
- [x] Open questions resolved or explicitly deferred
- [x] Human direction approved implementation
- [x] Requester approved the guided setup amendment and npx/init extension
