# Release review

Date: 2026-08-14
Branch: `codex/core-controller`  
Status: beta package and renamed production site published; native release deferred

## Side Glance rename review

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

## Required findings

1. Complete the remaining owner-only public-repository, environment-reviewer, vulnerability-reporting, and npm trusted-publisher setup in [docs/releasing.md](./docs/releasing.md). Initial npm ownership is complete.
2. Run all native release runners and the real Homebrew tap install/upgrade path before calling those channels supported.
3. Keep macOS signing language limited to ad-hoc signing unless Developer ID signing and notarization are added.
4. Production dependencies audit clean. Four audit findings remain in development-only build/lint dependencies and are outside the deployed Vercel runtime.

## Explicit non-guarantees

- No synchronous cleanup claim after `SIGKILL`, power loss, or terminal-emulator death.
- OSC 111 restores the configured default, not an unknowable arbitrary prior OSC 11 value.
- Separate tmux panes cannot own distinct whole-client background colors; Side Glance uses tmux status there.
- Gemini, OpenCode, and Aider were contract-tested but not live-executed when their CLIs were unavailable locally.
- Windows, Alpine/musl, and other unlisted native targets are unsupported.
