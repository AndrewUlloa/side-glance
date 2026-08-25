# Release review

Date: 2026-08-25

Branch: `codex/add-guided-setup`

Status: PR #52 merged into `staging`; Phase 16 passed local and hosted required gates

## Phase 16 guided onboarding review

No unresolved Critical or required source finding remains. Durable `init` and `setup`
share one planner and transaction; ephemeral `npx ... init` can preview or bootstrap a
separately validated exact-version installation without retaining an npm-cache path.
Claude, Codex, Gemini, and OpenCode plans expose eligibility, maturity, exact owned
changes, truthful notification coverage, warnings, backups, verification, launch
guidance, and recovery boundaries. Aider and arbitrary commands remain explicit
guidance-only paths.

Three independent reviewers challenged filesystem/rollback security, the human and JSON
UX contract, and packaged bootstrap/distribution behavior. Their Critical direct-install
cache-path finding and every required finding were remediated with regression tests.
The final review added strict allowlisted reconstruction for delegated setup JSON and a
bounded `SIGTERM`-to-`SIGKILL` child termination grace period with parent-cancellation
forwarding. No live provider configuration, real notification, npm publication, Homebrew
mutation, release, or deployment occurred.

| Axis | Result | Evidence |
|---|---|---|
| Correctness | Pass | Durable aliases share one plan/result contract; explicit selections remain fixed; TTY cancellation, EOF, invalid-input retry, SIGINT 130, no-eligible guidance, exact-version handoff, install/apply outcome separation, and idempotent re-runs are covered. |
| Readability and product truth | Pass | Human and JSON projections name the durable executable, target path/action/hook count, maturity, integration state, notification defaults and actual event coverage, warnings, backups, launch commands, Aider/generic guidance, and interruption repair boundary. |
| Architecture | Pass | Read-only discovery, executable identity, setup planning, prompt semantics, provider participants, multi-provider transaction, and ephemeral bootstrap remain separate typed boundaries. Direct install/uninstall and setup use the same mutation kernel and writer lock. |
| Security and privacy | Pass locally | Bounded no-follow snapshots, parent/target identity checks, private snapshot-derived backups, atomic writes, immediate pre-commit executable revalidation, exact verification, guarded rollback, owner-validated lock quarantine, output bounds, strict delegated schemas, argv-only children, sanitized environments, and hostile-value redaction are regression-tested. |
| Distribution and resilience | Pass locally | The packed npm CLI proves exact global npm argv, independent durable validation and handoff, stable persisted hooks, bootstrap help, and existing-durable dry-run. The standalone archive proves guided apply without Node on `PATH`; Homebrew planning executes no package-manager process and requires its stable bin path. |

### Phase 16 verification evidence

- Node `24.18.0`; unit `128/128`; integration `105/105` plus one expected skipped
  opt-in live tmux test; core coverage `91.03%` lines, `78.21%` branches, and `95.50%`
  functions.
- Site `37/37`; distribution `19/19`; rendered HTML `2/2`; lint, typecheck,
  `git diff --check`, the canonical Turbopack production build, and aggregate `npm test`
  all pass. The only build note is the existing non-blocking Alan Sans fallback-metrics
  warning.
- Hosted PR #52 passes the required `verify`, Node `22.14.0` and `24.18.0` npm
  compatibility, native macOS arm64, Vercel, and Vercel Preview Comments contexts.
  GitHub reports the final head mergeable with no inline review comment.
- The real PTY journey covers static no-color discovery, invalid selection retry, final
  preview/confirmation, exact apply, and verified persisted configuration. Semantic tests
  separately cover No, EOF, SIGINT, sound retry, fixed flags, and no-eligible guidance.
- Mutation fault tests cover same-inode edits, target replacements, absent/create races,
  parent symlinks, private backups, writer contention and stale recovery, post-commit
  self-restoration, exact bytes/mode rollback, rollback conflicts, executable replacement,
  and a later-provider failure restoring earlier providers.
- Bootstrap tests cover supported target classification, unsupported preview-only paths,
  custom and symlinked npm caches, PATH shadows, stable Homebrew paths, exact package-manager
  argv, tap lag, resolve-once handoff, TTY ownership, child timeout/output/cancellation,
  bounded delegated JSON, retained-package cleanup, and zero `_npx` hook paths.

### Phase 16 explicit boundary

Portable Node filesystem APIs do not expose a cross-platform pathname compare-and-swap,
so there remains a final guard-to-rename/unlink micro-window against an unrelated process
that ignores Side Glance's owner-validated writer lock. The implementation revalidates at
the last practical boundary and self-restores caught post-commit failures. It does not
claim crash-proof cross-file atomicity: power loss or `SIGKILL` between independent provider
writes can require the documented idempotent `side-glance init` / `side-glance doctor`
repair path. A persistent journal containing private configuration was intentionally
rejected by the approved privacy contract.

## Beta.3 release-readiness verdict (completed 2026-08-24)

No unresolved Critical or required source finding remains in the reviewed branch.
Thermal units and adaptation, physical tmux ownership, surface migration, stale-session
recovery, provider acknowledgements and timeouts, notification dedupe/finality,
capability diagnostics, OpenCode/Aider boundaries, non-color terminal markers, title
fallback, dependency advisories, and public claims all have observable regression
coverage.

The requested manual CodeRabbit review of PR #40 raised eight inline findings. Seven
were valid and now have regression coverage: minimal state-mutating command output,
rollback-safe R2 guidance, exact provider-event coverage, one-handle Aider config
inspection, lifecycle-title option parsing, OpenCode executable validation, and
server-scoped tmux ownership for linked windows. The proposed EWMA change was rejected
because the approved contract explicitly measures reply latency from completion to the
next acknowledgement or turn start, which the reducer already implements. The generic
80% docstring warning is not a repository gate or a published-TypeScript-API contract.

Before beta.3 was published, PR #40 had a verified Vercel preview, the live main
ruleset included `require-staging-head`, and one clearly labeled macOS notification
completed through the real CLI backend with the `Glass` sound. The required external
actions recorded for that release were:

1. Merge reviewed PR #40 into protected `staging`, refresh PR #37 from `staging`
   to `main`, and require new protected CI/Vercel results.
2. Visually check native Terminal.app. Exact PTY bytes, a real isolated tmux server,
   and the macOS notification subprocess pass, but a headless session cannot prove what
   Notification Center or Terminal.app displayed to the user.
3. Only from the exact green `main` commit, create the annotated beta.3 tag and allow
   the protected workflow to publish npm and the immutable GitHub prerelease. The
   Homebrew tap remains a separate post-release pull request.

The custom domain is optional for this candidate. The verified, content-addressed R2
development origin is the selected temporary asset origin; Cloudflare documents the
managed `r2.dev` endpoint as rate-limited and unsuitable for sustained production
traffic, so `assets.sideglance.ai` remains the recommended later cutover after DNS and
TLS verification.

## Five-axis review

| Axis | Result | Evidence |
|---|---|---|
| Correctness | Pass locally | Epoch-millisecond 5/60/300-second cases, EWMA alpha 0.4, 300–450-second adaptive maximum, phase parity, multi-pane ownership, migration, orphan reconciliation, provider retries, semantic dedupe, terminal bytes, and packaged execution pass. |
| Readability and simplicity | Pass | One canonical visual policy drives the controller and preview; provider capability fields are explicit; wrapper/title/notification opt-ins are named and documented; support tiers are consistent across public surfaces. |
| Architecture | Pass | Reducer, store, lease arbitration, renderers, provider adapters, notifier side effects, and site projection remain separate. Server-scoped physical tmux windows—including windows linked across sessions—own render state, and provider IDs remain distinct from wrapper ownership. |
| Security and privacy | Pass locally | Hook and state-mutating command acknowledgements cannot expose global state; Aider configuration is opened no-follow and inspected/read through one bounded handle; other configuration and TTY paths are bounded/no-follow; child processes use argv without a shell; labels/sounds/titles are sanitized; full and production-only npm audits report zero vulnerabilities. |
| Performance and resilience | Pass | Hooks are bounded to provider-specific seconds, teardown is shorter and non-fatal, replay/session/surface caches are capped, stale leases reconcile after 30 minutes, R2 assets are immutable, and reduced-motion/offline browser paths remain usable. |

The original `idle_prompt` heat escalation was reviewed and not restored. The approved
canonical contract intentionally renders every request for input as fixed amber
Waiting; adaptive thermal heat applies only to completed-turn duration. Reintroducing
an idle-specific thermal phase would be a separate product/protocol change.

## Verification evidence

- Node `24.18.0`; unit `47/47`; integration `75/75` plus one opt-in live tmux test
  `1/1`; core coverage `91.03%` lines, `78.18%` branches, `95.50%` functions.
- Distribution `19/19`; site `36/36`; rendered HTML `2/2`; lint and typecheck pass.
  The full `npm test` command and canonical Turbopack build pass. The only build note
  is the known non-blocking Alan Sans fallback-metrics warning.
- The four-file dependency-free npm tarball installs and executes in an isolated
  prefix. The extracted standalone macOS arm64 archive runs without Node on `PATH`;
  release runners still own Linux and Intel-macOS artifact proof.
- The updated dependency tree is valid. Full and production-only `npm audit` both
  report zero findings after compatible Babel, brace-expansion, esbuild, and js-yaml
  fixes.
- Real Chromium on the PR #40 Vercel preview at `1440×1000` and `390×844`:
  meaningful content, zero horizontal
  overflow, no framework overlay, empty console/page-error logs, keyboard focus order,
  lifecycle selection, 16px mobile input, stable reduced-motion state, usable core UI
  during an offline R2 image failure, and a `1200×630` social preview all pass.
- All six declared R2 objects return HTTP 200 with exact type, size, and immutable
  cache control. `side-glance.vercel.app` returns HTTP 200. `sideglance.ai` and
  `assets.sideglance.ai` do not resolve and are not claimed as live.
- A real PTY discovered its owned character device, painted Working plus the opt-in
  title, emitted OSC 111 and an empty title on exit, and persisted an inactive surface.
  A real isolated tmux server round-tripped local and inherited window options.
- Terminal.app, Claude Code `2.1.228`, and Codex `0.149.0-alpha.4.3` are installed.
  iTerm, Ghostty, Gemini, OpenCode, OpenCode 2, and Aider are absent. Actual `doctor`
  reports no Side Glance hooks installed, Codex native notifications ready while
  unfocused, and Side Glance's macOS `osascript` backend available.
- Live GitHub checks confirm public visibility, active main/staging/tag
  rulesets, tag-scoped npm/GitHub-release environments, private vulnerability
  reporting, Dependabot security updates, secret scanning with push protection, and
  immutable releases. Main ruleset `20776489` now requires `require-staging-head` in
  addition to the five existing CI/Vercel contexts.
- Release provenance uses pinned `actions/attest` v4 with the required
  `artifact-metadata: write` permission. npm trusted publishing remains limited to
  publication; stale `latest` cleanup is an explicit interactive owner action.

## Unsupported or unverified boundaries

- A real, clearly labeled Side Glance notification completed through macOS `osascript`
  with the `Glass` sound, using isolated temporary state. Headless automation cannot
  confirm whether Focus or per-app preferences made it visible or audible. No live
  provider configuration was changed.
- Terminal.app OSC 11 remains visually unverified; the opt-in phase title is the
  documented fallback. iTerm and Ghostty were not installed for a visual matrix.
- Gemini, OpenCode, and Aider remain experimental fixture/contract evidence. Claude
  and Codex are contract-audited but were not mutated or run through live hooks.
- Windows, Alpine/musl, Linux notification sound, click-to-originating-pane routing,
  Developer ID signing/notarization, public release artifacts, and Homebrew install or
  upgrade remain unsupported or externally gated.
- Focus, per-app notification preferences, and installed macOS sound availability can
  suppress an otherwise valid notification request.

## Historical audits (superseded by the 2026-08-24 review)

### Desktop notification review — 2026-08-17

| Axis | Result | Evidence |
|---|---|---|
| Correctness | Pass | Accepted waiting/completed/failed/cancelled events alert once; stale/duplicate/non-attention events do not. Targetless and non-owning sessions alert independently of visual leases. Aider wrapper identities clean up, and OpenCode child sessions are filtered fail-closed. |
| Readability and simplicity | Pass | One event notifier interface sits behind the controller; CLI opt-ins use `--notifications`, `--notification-sound`, `--label`, and the deliberately narrower `--notify-on-exit`. |
| Architecture | Pass | Notification delivery occurs after accepted persistence, outside visual arbitration. Provider-native settings remain a separately inspected capability and are never silently rewritten. |
| Security and privacy | Pass | macOS and Linux launch fixed executables with argv and no shell; titles/bodies exclude prompts, transcripts, cwd, targets, raw IDs, and failure text. Labels/sounds are normalized, control-stripped, and bounded. Owned installers refuse unsafe files and preserve unrelated configuration. |
| Performance and resilience | Pass | Native failures no-op after state commit. The OpenCode plugin filters unsupported/child events before spawn, bounds ancestry cache to 1,024 entries, terminates a stuck child after two seconds, and escalates to `SIGKILL` after a bounded grace period. |

Verification on Node 24.18.0: unit 40/40; integration 57/57 with the opt-in
live-tmux case skipped; distribution 16/16; site 34/34; rendered HTML 2/2;
lint and typecheck pass; core coverage is 92.57% lines / 74.80% branches /
100% functions. The dependency-free packed CLI, standalone executable, provider
install/uninstall, Aider bridge, OpenCode plugin, and notification-disabled test
backend all pass. The canonical Turbopack production build and rendered
desktop/mobile browser checks pass with no console errors or horizontal overflow.

The sandboxed build could not fetch configured Google fonts; the required
network-enabled build completed successfully with only the existing missing Alan
Sans fallback-metric warning. No live provider configuration was mutated and no
real desktop notification was fired during verification.

Explicit boundaries: macOS Focus/Notifications preferences can suppress sound;
Linux sound is best-effort; alert clicks cannot guarantee the originating iTerm
tab or tmux pane; meaningful concurrent-session names require `run --label`,
otherwise notifications use a privacy-safe session digest; Gemini readiness is
explicitly user-settings scoped because higher-precedence configuration may
override it; live Gemini, OpenCode, and Aider binaries remain outside local
contract-test evidence.

### Side Glance rename review — 2026-08-14

| Axis | Result | Evidence |
|---|---|---|
| Correctness | Pass | The npm workspace and sole bin are `side-glance`; package, CLI, runtime identifiers, standalone archives, Homebrew formula, release manifests/workflows, site, docs, and tests agree. Tested migration paths recognize pre-rename managed hooks, wrapper environment variables, and state without emitting old public names. |
| Readability and simplicity | Pass | Product prose uses “Side Glance”; machine-facing names use `side-glance`; internal TypeScript identifiers use `SideGlance*`; genuine Unix process-signal terminology remains unchanged. |
| Architecture | Pass | The rename preserves the existing controller, adapter, renderer, and shared site-theme boundaries. No compatibility alias expands the public bin surface. |
| Security and privacy | Pass | Legacy migration reads typed JSON through the existing bounded, no-follow validation path; installer cleanup remains provider-scoped; no prompt, transcript, shell evaluation, or external mutation was introduced. |
| Performance | Pass | The change adds only one bounded legacy-state lookup when new state is absent. React component structure and data flow are unchanged; the longer wordmark uses a local no-wrap safeguard. |

Verification on Node 24.18.0: unit 28/28, integration 32/32 with the existing
opt-in live-tmux case skipped, distribution 15/15, site 18/18, rendered HTML 2/2,
lint, typecheck, and coverage at 91.06% lines / 72.13% branches / 98.82%
functions. The standard Next.js webpack production path compiled, typechecked,
generated all static routes, and passed real-browser desktop/mobile, keyboard,
copy, replay, reduced-motion, console, network, and overflow checks.

The canonical `npm run build` Turbopack path was attempted both sandboxed and
escalated. This host rejects Turbopack's internal PostCSS helper port binding with
`Operation not permitted`; the supported `next build --webpack` path passed. This
is an execution-host limitation, not a source or type failure.

| Axis | Result | Evidence and remaining boundary |
|---|---|---|
| Correctness | Pass locally | Reducer, lease, controller, wrapper, adapter, installer, terminal, tmux, site, and rendered-output suites pass. Core coverage is enforced at 90% lines, 70% branches, and 95% functions. |
| Security and privacy | Pass locally | Fixed private JSON state, atomic writes, bounded input/state, no shell evaluation, canonical owned TTY validation, safe tmux arguments, prompt/transcript exclusion, and symlink/config refusal are tested. |
| npm distribution | Published beta | `side-glance@0.1.0-beta.1` is published from the validated four-file dependency-free tarball. Isolated global installation and upgrade preserve durable hooks, and `npx` diagnostics work while activation is refused. Node 22.14/24.18 remain CI evidence after push. |
| Native distribution | Pass on local macOS arm64 | The exact extracted SEA archive runs without Node on `PATH`, has recomputed metadata, and is ad-hoc signed. Linux and Intel macOS require their release runners; Developer ID signing and notarization are not present. |
| Release security | Implemented, externally gated | Actions are commit-pinned; the workflow requires canonical public visibility, protected matching tags, `main` reachability, protected environments, exact artifacts, attestations, draft staging, npm integrity idempotency, and post-release download verification. The repository rulesets and tag-restricted environments are configured; public visibility, required environment reviewers, npm ownership, and trusted publishing remain owner gates. |
| Homebrew | Generator passes locally | Immutable URLs and digests are schema-validated and the formula passes Ruby and Homebrew style checks. Tap `readall`, audit, URL installation, and upgrade tests require a real release and tap. |
| UX and accessibility | Pass locally and on Preview | The exact production build passed at 1256×833 and 390×844 with no horizontal overflow or browser errors. The hero computes to Inter 64/64/510 on desktop and 38/41.8/510 on mobile, while the equal dynamic viewport gutter resolves on all four sides. Keyboard Replay, focus visibility, hash navigation, and reduced motion pass. |
| Site architecture | Pass in production | The only site runtime is standard Next.js 16.3 on Vercel. The hero’s server HTML contains the complete four-terminal 2×2 grid before hydration; Motion is pinned only for the interruptible spatial storyboard. Vercel built the canonical `npm run build` path for renamed production deployment `dpl_877rCZQP8w1VVbcRTPNqVMjqT9xM`; a separate production build preserves the Preview-only Agentation boundary. |
| Motion and interaction | Pass locally and on Preview | The hero uses Linear's measured 1-second blurred-lift tween and .4/.5/.6-second copy delays. The terminal visual uses the measured 1.3-second illustration delay and 1.5-second ease-in-out tween, then resolves into Side Glance's canonical lifecycle stack. Fresh visits animate once; first scroll settles; hash/revisit/reduced-motion loads render the final stack immediately; explicit Replay remains keyboard-operable. |
| Linear token parity | Pass against dated primary-source evidence | Inter Variable, 400/510/590/680 weights, OpenType features, type scale, neutral colors, radii, shadows, interaction timings, and the full easing family are centralized and contract-tested. Source URLs and SHA-256 hashes are recorded in `docs/linear-homepage-token-audit.md`. Berkeley Mono is not copied or hotlinked. |
| Smooth scrolling | Pass in production | Lenis 1.3.26 is MIT-licensed with no runtime dependencies and a clean production audit. The official `lenis/react` root adapter and stylesheet use one automatic RAF loop, smooth trusted anchor clicks, stop prior navigation inertia, preserve native touch, and honor reduced motion with immediate anchor navigation. Desktop and 390×844 browser checks show `html.lenis`, no horizontal overflow, and no runtime errors. |
| Preview annotation tooling | Pass locally and on Preview | Agentation 3.0.2 remains preview-only. Protected Preview `dpl_ADsEBwQPnQuvUgNif7WeGpYsknd9` returns authenticated HTTP 200 and embeds `AgentationToolbar { enabled: true }`. The renamed production deployment `dpl_877rCZQP8w1VVbcRTPNqVMjqT9xM` has no production Agentation runtime. No endpoint, MCP mutation, or remote sync is configured. |

### Historical required findings

1. Complete the remaining owner-only public-repository, environment-reviewer, vulnerability-reporting, and npm trusted-publisher setup in [docs/releasing.md](./docs/releasing.md). Initial npm ownership is complete.
2. Run all native release runners and the real Homebrew tap install/upgrade path before calling those channels supported.
3. Keep macOS signing language limited to ad-hoc signing unless Developer ID signing and notarization are added.
4. Production dependencies audit clean. Four audit findings remain in development-only build/lint dependencies and are outside the deployed Vercel runtime.

### Historical explicit non-guarantees

- No synchronous cleanup claim after `SIGKILL`, power loss, or terminal-emulator death.
- OSC 111 restores the configured default, not an unknowable arbitrary prior OSC 11 value.
- Separate tmux panes cannot own distinct whole-client background colors; Side Glance uses tmux status there.
- Gemini, OpenCode, and Aider were contract-tested but not live-executed when their CLIs were unavailable locally.
- Windows, Alpine/musl, and other unlisted native targets are unsupported.
