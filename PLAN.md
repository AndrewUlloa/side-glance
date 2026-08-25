# Plan: Side Glance

> Derived from: `SPEC.md`
> Status: in progress
> Last updated: 2026-08-12

## Overview

Build Side Glance in vertical red-green slices: first make one normalized event deterministically resolve to one surface state; then harden persistence and rendering; then expose that behavior through the CLI and provider adapters; finally make the landing page an interactive view of the same model and publish only after the full local and browser gates pass.

The publication-readiness extension keeps the repository private while it proves the exact artifacts that will later be released: a minimal npm workspace package, standalone macOS/Linux executables, checksums and attestations, and a Homebrew formula derived from immutable release metadata.

## Architecture Decisions

- **Decision:** The root is a private workspace containing the site and development tooling; `packages/cli` is the only publishable npm package. **Rationale:** Users must not install React, Cloudflare, database, or site tooling to run a terminal hook.
- **Decision:** Compile one dependency-free JavaScript bundle for npm and inject the same bundle into platform-native Node single-executable artifacts. **Rationale:** npm users get a conventional package while Homebrew and direct-download users get a stable runtime independent of their Node installation.
- **Decision:** `npx` may run diagnostics but may not install permanent hooks from an ephemeral npm cache. **Rationale:** Lifecycle hooks must remain executable offline and across cache cleanup.
- **Decision:** Release workflows build on native GitHub-hosted macOS/Linux runners, smoke-test each executable, and publish only from an explicit version tag plus protected release environment. **Rationale:** Native artifacts cannot be inferred from a source-only test and publication must be intentional.
- **Decision:** Use typed JSON, an atomic lock directory, and atomic rename before adding a resident daemon. **Rationale:** This satisfies serialization and crash-recovery invariants with fewer failure domains; a future daemon can reuse the same controller contract.
- **Decision:** Native hooks submit events; only the controller renders. **Rationale:** Terminal/tmux state is a shared surface requiring one ownership decision.
- **Decision:** The wrapper establishes the surface and lifecycle fallback. **Rationale:** Provider hooks often lack a stable controlling TTY and cannot cover child-process termination alone.
- **Decision:** Title mutation is opt-in and terminal background reset means configured default. **Rationale:** Exact arbitrary prior terminal state is not portably knowable.

Rejected: direct painting from each provider hook, because it preserves the current ordering and ownership races.

Rejected: publishing the current root package, because it includes unrelated site dependencies and exposes a raw TypeScript executable. Rejected: permanent `npx` hook commands, because npm cache/network resolution is not a durable runtime contract.

## Dependency Graph

```text
protocol + reducer
        │
        ├──▶ atomic store + controller ──▶ renderer leases ──▶ CLI commands/wrapper
        │                                      │
        └──▶ shared phase/palette ─────────────┴──▶ adapters/installers
                                                       │
                                                       └──▶ interactive site
```

## Task List

### Phase 1: Deterministic core

- [x] **Task 1: Reject stale events and resolve session state**
  - **Acceptance:** Normalized lifecycle transitions are typed; obsolete generations and duplicate event IDs do not alter state; prompt content is absent from the protocol.
  - **Verify:** focused reducer RED/GREEN; `npm run test:unit`.
  - **Depends on:** None
  - **Files:** `tests/unit/reducer.test.ts`, `src/core/protocol.ts`, `src/core/reducer.ts`
  - **Size:** M

- [x] **Task 2: Arbitrate multiple leases on one surface**
  - **Acceptance:** Priority is deterministic; releasing one owner recomputes from remaining owners; final release resolves inactive.
  - **Verify:** focused lease RED/GREEN; unit suite.
  - **Depends on:** Task 1
  - **Files:** `tests/unit/leases.test.ts`, `src/core/leases.ts`
  - **Size:** S

- [x] **Task 3: Preserve thermal urgency as validated policy**
  - **Acceptance:** Thresholds/palette validate; short tasks suppress; urgency is bounded/monotonic; adaptive response never changes lifecycle ordering.
  - **Verify:** policy RED/GREEN; unit suite.
  - **Depends on:** Task 1
  - **Files:** `tests/unit/policy.test.ts`, `src/core/policy.ts`, `src/core/theme.ts`
  - **Size:** S

### Checkpoint: Deterministic core

- [x] Unit tests pass on Node 24
- [x] Core coverage clears enforced 90% line, 70% branch, and 95% function thresholds
- [x] Typecheck clean
- [x] Review stale-event and lease invariants

### Phase 2: Persistence and safe rendering

- [x] **Task 4: Serialize and recover private state**
  - **Acceptance:** Concurrent writers cannot lose updates; state writes are atomic/private; corrupt/old state safely resets; stale lock can be reclaimed only after validation.
  - **Verify:** filesystem and concurrent-process RED/GREEN integration tests.
  - **Depends on:** Tasks 1–2
  - **Files:** `tests/integration/store.test.ts`, `src/core/store.ts`, `src/core/controller.ts`
  - **Size:** M

- [x] **Task 5: Render only to verified terminal surfaces**
  - **Acceptance:** Regular files, unsafe symlinks, missing/unowned devices, and control-byte labels are rejected; captured bytes contain only expected OSC sequences; reset uses OSC 111.
  - **Verify:** PTY/fixture RED/GREEN integration tests.
  - **Depends on:** Task 4
  - **Files:** `tests/integration/terminal-renderer.test.ts`, `src/renderers/terminal.ts`, `src/core/sanitize.ts`
  - **Size:** M

- [x] **Task 6: Preserve exact Side Glance-owned tmux options**
  - **Acceptance:** Existing local styles/formats are snapshotted and restored; inherited values remain inherited; shared panes do not blindly clear each other.
  - **Verify:** isolated tmux RED/GREEN tests.
  - **Depends on:** Tasks 2, 4
  - **Files:** `tests/integration/tmux-renderer.test.ts`, `src/renderers/tmux.ts`
  - **Size:** M

### Checkpoint: Safe controller

- [x] Unit and integration suites pass
- [x] No external path can become executable state or a terminal write target
- [x] Failure/recovery behavior reviewed

### Phase 3: CLI and adapters

- [x] **Task 7: Add operational CLI and supervised wrapper**
  - **Acceptance:** `event`, `run`, `status`, `doctor`, `preview`, and `reset` work; wrapper preserves child exit/signal behavior and releases only its own lease.
  - **Verify:** spawned CLI RED/GREEN integration tests.
  - **Depends on:** Safe controller checkpoint
  - **Files:** `tests/integration/cli.test.ts`, `src/cli/index.ts`, `src/cli/run.ts`, `package.json`
  - **Size:** M

- [x] **Task 8: Add provider adapters**
  - **Acceptance:** Claude, Codex, Gemini, OpenCode, Aider/generic fixtures map documented events to normalized phases; compact/resume/failure/waiting semantics are distinct.
  - **Verify:** adapter RED/GREEN fixture suite.
  - **Depends on:** Task 7
  - **Files:** `tests/unit/adapters.test.ts`, `src/adapters/*.ts`
  - **Size:** M

- [x] **Task 9: Install and uninstall without clobbering configuration**
  - **Acceptance:** Temp-home installs are idempotent; existing hooks and Codex notify survive; uninstall removes only Side Glance-owned entries; generated commands use absolute executable paths.
  - **Verify:** installer RED/GREEN integration suite.
  - **Depends on:** Task 8
  - **Files:** `tests/integration/installers.test.ts`, `src/adapters/installers.ts`, `src/cli/install.ts`
  - **Size:** M

### Checkpoint: Usable product

- [x] Real Claude and Codex configuration plans pass `doctor` without live mutation
- [x] Wrapper and adapters share one controller
- [x] Package build and all non-browser gates pass

### Phase 4: Interactive site and shipping

- [x] **Task 10: Build the real state playground**
  - **Acceptance:** Page uses shared phase/theme data; visitors can use keyboard/touch to change state and renderer channel; copy/install command are product-specific.
  - **Verify:** component/model RED/GREEN, SSR test, local build.
  - **Depends on:** Task 3 and usable product checkpoint
  - **Files:** `app/page.tsx`, `app/globals.css`, `app/components/*`, `tests/site/*`
  - **Size:** M

- [x] **Task 11: Complete responsive, accessible product storytelling**
  - **Acceptance:** Original first viewport, capability/limitation story, CLI coverage, setup, FAQ, reduced motion, focus/touch/mobile behavior, bespoke metadata/social preview.
  - **Verify:** lint/type/build, real browser desktop/mobile/keyboard/reduced-motion/console/network check.
  - **Depends on:** Task 10
  - **Files:** `app/*`, `public/*`, browser evidence
  - **Size:** M

- [x] **Task 12: Review, launch, and rollback readiness**
  - **Acceptance:** Five-axis review has no required findings; all local and CI gates are green; package remains unpublished; deployment and live-install approval boundaries are documented with rollback.
  - **Verify:** full commands from `CLAUDE.md`, browser production-build smoke test, draft PR checks.
  - **Depends on:** Task 11
  - **Files:** `REVIEW.md`, `LAUNCH.md`, `README.md`
  - **Size:** M

## Parallelization

- **Safe to parallelize after contracts exist:** provider fixture research, site content structure, renderer capability documentation.
- **Must be sequential:** reducer → leases → store/controller → renderers → CLI → installers; site claims follow proven product capabilities.
- **Contract-first:** normalized protocol and phase/theme model precede all adapters and site interaction.

### Phase 5: Public distribution readiness

- [x] **Task 13: Isolate the npm CLI package**
  - **Acceptance:** Root stays private; `packages/cli` owns `side-glance`; the packed allowlist contains a compiled executable and package docs only; no site runtime dependency is installed.
  - **Verify:** focused pack-manifest RED/GREEN test; isolated `npm install --prefix` smoke test on the minimum supported Node.
  - **Depends on:** Task 12
  - **Files:** `package.json`, `packages/cli/package.json`, `scripts/build-cli.mjs`, `tests/distribution/npm-package.test.mjs`
  - **Size:** M

- [x] **Task 14: Make provider activation durable across npm symlinks**
  - **Acceptance:** Global npm bin symlinks resolve to a validated stable target; known ephemeral npm cache paths cannot be written into provider hooks; standalone execution resolves itself correctly.
  - **Verify:** installer RED/GREEN tests using an isolated global prefix and synthetic cache path.
  - **Depends on:** Task 13
  - **Files:** `src/cli/install.ts`, `src/adapters/installers.ts`, installer/distribution tests
  - **Size:** M

- [ ] **Task 15: Build standalone release artifacts**
  - **Acceptance:** The compiled CLI is injected into a native executable; local native smoke test passes with a stripped `PATH`; archive naming is deterministic and the exact content is checksummed.
  - **Verify:** artifact RED/GREEN test plus native local build; CI matrix covers macOS arm64/Intel and Linux arm64/x64.
  - **Depends on:** Task 13
  - **Files:** `scripts/release/*`, `.github/workflows/release.yml`, distribution tests
  - **Size:** M

- [ ] **Task 16: Generate and verify Homebrew packaging**
  - **Acceptance:** A formula is generated from versioned artifact URLs and SHA-256 values; it installs only `side-glance`; local syntax and Homebrew style tests pass; tap readall, audit, install, and upgrade tests run after immutable URLs exist.
  - **Verify:** formula schema RED/GREEN test and local style check; isolated tap install/upgrade smoke test after release.
  - **Depends on:** Task 15
  - **Files:** `packaging/homebrew/*`, release scripts/workflow, distribution tests
  - **Size:** M

- [ ] **Task 17: Secure and rehearse publication**
  - **Acceptance:** CI verifies pack contents and artifacts; release workflow uses least privilege, protected environment, attestations, and npm trusted-publishing shape; dry runs cannot publish; docs distinguish install, activation, update, and rollback.
  - **Verify:** workflow policy test, `npm publish --dry-run`, full gates, GitHub Actions green, five-axis release review.
  - **Depends on:** Tasks 14–16
  - **Files:** workflows, `README.md`, `LAUNCH.md`, `REVIEW.md`, distribution tests
  - **Size:** M

### Checkpoint: Publication-ready but unpublished

- [x] Exact npm tarball installed and exercised from an isolated prefix
- [x] Native artifact exercised without relying on the developer checkout
- [x] Homebrew formula generated and locally verified
- [x] No registry package, public release, visibility change, tap mutation, or live provider mutation occurred
- [x] Release review and rollback documents match the artifacts

### Phase 6: Vercel landing-page deployment

- [x] **Task 18: Add a test-covered Vercel runtime contract**
  - **Acceptance:** Standard Next.js is an explicit dependency; Vercel uses the canonical build command; deployment metadata derives from the production hostname; Cloudflare/vinext compatibility is intentionally removed.
  - **Verify:** focused RED/GREEN deployment-contract test, typecheck, and Next.js production build.
  - **Depends on:** Task 12
  - **Files:** `package.json`, `package-lock.json`, `vercel.json`, `app/layout.tsx`, `tests/site/vercel-deployment.test.ts`
  - **Size:** M

- [x] **Task 19: Verify a real Vercel candidate**
  - **Acceptance:** The linked project belongs to the authenticated owner; the candidate returns 200, renders the landing page, supports playground interaction, and has no browser console or failed-network errors.
  - **Verify:** `vercel deploy --prod --skip-domain`, authenticated `vercel curl`, deployment inspection, and real-browser desktop/mobile checks.
  - **Depends on:** Task 18
  - **Files:** `.vercel/project.json` (ignored), deployment evidence
  - **Size:** S

- [x] **Task 20: Promote the verified deployment and record rollback**
  - **Acceptance:** The exact candidate is promoted to the production alias; public verification passes; `LAUNCH.md` records the URL, deployment identity, and rollback command.
  - **Verify:** `vercel promote`, `vercel inspect`, public HTTP/browser smoke test, and clean repository status.
  - **Depends on:** Task 19
  - **Files:** `LAUNCH.md`
  - **Size:** S

### Phase 7: Vercel-only site toolchain

- [x] **Task 21: Replace the Cloudflare compatibility build**
  - **Acceptance:** `npm run dev`, `npm run build`, and `npm start` are standard Next.js commands; Vercel calls `npm run build`; no Cloudflare/vinext/wrangler code, dependencies, types, or D1 starter files remain.
  - **Verify:** focused RED/GREEN deployment-contract test, package lock inspection, lint, typecheck, production audit, and the full repository test/build gates.
  - **Depends on:** Task 20
  - **Files:** site build configuration, package manifests, obsolete compatibility sources, contract tests, deployment docs
  - **Size:** M

- [x] **Task 22: Deploy and verify the Vercel-only revision**
  - **Acceptance:** an unaliased production candidate built from the committed revision passes HTTP and real-browser verification; that exact candidate is promoted; rollback identity and production deployment identity are recorded.
  - **Verify:** Vercel inspection, authenticated candidate request, desktop/mobile browser checks, promotion, and public smoke test.
  - **Depends on:** Task 21
  - **Files:** `LAUNCH.md`, deployment evidence
  - **Size:** S

### Phase 8: Linear-inspired motion system

- [x] **Task 23: Add a test-covered motion contract**
  - **Acceptance:** The site defines semantic hero entrances, viewport reveal hooks, ambient visual motion, explicit-property transitions, and a reduced-motion escape hatch; simple effects remain dependency-free CSS.
  - **Verify:** focused RED/GREEN source contract plus rendered HTML test.
  - **Depends on:** Task 22
  - **Files:** `SPEC.md`, `PLAN.md`, `tests/site/motion-contract.test.ts`
  - **Size:** S

- [x] **Task 24: Implement and ship the motion system**
  - **Acceptance:** Motion matches the reference principles while preserving Side Glance’s visual identity; desktop, mobile, keyboard, and reduced-motion paths remain usable; an exact verified Vercel candidate is promoted with rollback recorded.
  - **Verify:** lint, typecheck, build, full tests, coverage, production audit, real-browser desktop/mobile/reduced-motion checks, Vercel candidate inspection, and public smoke test.
  - **Depends on:** Task 23
  - **Files:** `app/page.tsx`, `app/components/MotionOrchestrator.tsx`, `app/components/SideGlancePlayground.tsx`, `app/globals.css`, review/launch notes
  - **Size:** M

### Phase 9: Four-terminal origin storyboard

- [x] **Task 25: Specify the four-terminal visual story**
  - **Acceptance:** The contract names the opening grid, lifecycle color order, finite stacked resolution, replay, reduced-motion behavior, and preserved interactive playground.
  - **Verify:** Review the contract against the supplied four-terminal screenshot and the interface-craft storyboard rules.
  - **Depends on:** Task 24
  - **Files:** `SPEC.md`, `PLAN.md`
  - **Size:** XS

- [x] **Task 26: Build and ship the staged terminal storyboard**
  - **Acceptance:** The hero loads as a four-terminal 2×2 workspace, animates through named stages into a cool-to-urgent stack, exposes replay, and skips to the final composition for reduced motion; the playground remains available below it.
  - **Verify:** focused RED/GREEN contract test, lint, typecheck, site tests, build, full tests, coverage, production audit, real-browser desktop/mobile/reduced-motion checks, Vercel candidate inspection, and public smoke test.
  - **Depends on:** Task 25
  - **Files:** `app/page.tsx`, `app/components/TerminalStoryboard.tsx`, `app/globals.css`, `package.json`, `package-lock.json`, `tests/site/terminal-storyboard.test.ts`, review/launch notes
  - **Size:** M

### Phase 10: Lenis root scrolling

- [x] **Task 27: Specify the Lenis integration contract**
  - **Acceptance:** The contract fixes root ownership, automatic RAF, anchor behavior, reduced-motion handling, native touch, and removal of the competing CSS smooth-scroll controller.
  - **Verify:** Review against the official Lenis core and React READMEs.
  - **Depends on:** Task 26
  - **Files:** `SPEC.md`, `PLAN.md`
  - **Size:** XS

- [x] **Task 28: Integrate and verify Lenis React**
  - **Acceptance:** The pinned Lenis dependency mounts once at the app root with recommended CSS, smooth anchors, navigation inertia cleanup, and reduced-motion support; no custom RAF loop or touch smoothing is added.
  - **Verify:** Focused RED/GREEN site contract, lint, typecheck, full tests/build, and real-browser desktop/mobile/reduced-motion checks.
  - **Depends on:** Task 27
  - **Files:** `package.json`, `package-lock.json`, `app/layout.tsx`, `app/components/SmoothScroll.tsx`, `app/globals.css`, `tests/site/lenis-scroll.test.ts`
  - **Size:** M

### Phase 11: Preview-only Agentation

- [x] **Task 29: Specify the Agentation environment boundary**
  - **Acceptance:** The contract defines the exact local development, Vercel preview/development, local production, Vercel production, and unknown-environment outcomes.
  - **Verify:** Review against Agentation's official install/security guidance and Vercel environment semantics.
  - **Depends on:** Task 28
  - **Files:** `SPEC.md`, `PLAN.md`
  - **Size:** XS

- [x] **Task 30: Integrate Agentation without production exposure**
  - **Acceptance:** Agentation is a pinned development dependency; one client-only toolbar is selected by a tested server-side environment predicate; no endpoint or remote sync is configured.
  - **Verify:** Focused RED/GREEN matrix and source contract, lint, typecheck, full tests/build, local dev browser, local production browser, Vercel Preview browser/HTTP, and public production absence check.
  - **Depends on:** Task 29
  - **Files:** `package.json`, `package-lock.json`, `app/layout.tsx`, `app/components/AgentationToolbar.tsx`, `app/lib/agentation-environment.ts`, `tests/site/agentation-environment.test.ts`, `tests/rendered-html.test.mjs`
  - **Size:** M

### Phase 12: Measured Linear homepage parity

- [x] **Task 31: Capture the current Linear token and motion contract**
  - **Description:** Record the first-party font, CSS-token, component-style, and motion-bundle values served by Linear's homepage, including asset URLs and hashes, then translate the requested 1:1 direction into executable Side Glance contracts.
  - **Acceptance:** evidence separates source facts from mapping decisions; exact tests cover font, visual tokens, timing, and reduced motion; Berkeley Mono is neither copied nor hotlinked.
  - **Verify:** `npm run test:site -- --test-name-pattern="Linear homepage token parity"` must fail for observable value mismatches before production edits.
  - **Depends on:** Task 30
  - **Files:** `SPEC.md`, `PLAN.md`, `docs/linear-homepage-token-audit.md`, `tests/site/linear-design-token-contract.test.ts`
  - **Size:** M

- [x] **Task 32: Implement and preview the measured parity system**
  - **Description:** Replace hand-tuned Geist and motion values with measured Inter/type, neutral design, interaction, and animation tokens; keep Side Glance's lifecycle palette and terminal story; remove reveal-delay leakage; deploy a Vercel Preview without touching production.
  - **Acceptance:** computed styles match the contract; fresh-load, replay, and reduced-motion paths work; Agentation is visible on Preview and absent from unchanged production.
  - **Verify:** focused GREEN tests, all `CLAUDE.md` gates, browser comparisons at three viewports, and Vercel Preview checks.
  - **Depends on:** Task 31
  - **Files:** site source, token module, tests, review and launch evidence
  - **Size:** L

## Risks and Mitigations

### Phase 14: Desktop notifications and sound

- [x] **Task 37: Lock the event-local notification contract with failing tests**
  - **Acceptance:** focused tests require accepted completion/waiting/failure events to
    notify once independently of visual ownership while stale, duplicate, start,
    acknowledgement, and teardown events do not.
  - **Verify:** run the focused controller/notifier unit tests and capture observable
    RED failures before production edits.
  - **Depends on:** Task 36
  - **Files:** `tests/integration/controller-rendering.test.ts`, new notifier unit test
  - **Size:** S

- [x] **Task 38: Implement safe native notification backends**
  - **Acceptance:** macOS uses a static no-shell osascript program and sanitized argv;
    Linux uses a capability-detected argument vector; unsupported/missing backends are
    non-fatal; displayed content follows the privacy contract.
  - **Verify:** focused mocked-boundary tests for exact executable/arguments, controls,
    unicode, length limits, missing commands, and platform fallback.
  - **Depends on:** Task 37
  - **Files:** `src/notifications/native.ts`, `src/notifications/policy.ts`, notifier tests
  - **Size:** M

- [x] **Task 39: Integrate notification policy into accepted controller events**
  - **Acceptance:** notification side effects occur after accepted state computation,
    outside visual lease selection, and never make state updates fail.
  - **Verify:** focused GREEN controller tests plus reducer/lease regression suite.
  - **Depends on:** Task 38
  - **Files:** `src/core/controller.ts`, controller integration tests
  - **Size:** S

### Checkpoint: notification core

- [x] Focused event/policy/backend tests pass
- [x] Existing reducer, lease, renderer, store, and privacy tests pass
- [x] No shell interpolation or provider content reaches a notification

- [x] **Task 40: Expose opt-in CLI, Aider bridge, and generic exit behavior**
  - **Acceptance:** event/hook commands accept notification options; the no-stdin
    `notify` bridge uses validated source/kind/session identity; `run --notify-on-exit`
    reports process outcomes without claiming per-turn fidelity; help is accurate.
  - **Verify:** focused CLI RED/GREEN tests for targetless hooks, Aider wrapper identity,
    success/failure/signal/spawn failure, and default-off behavior.
  - **Depends on:** Task 39
  - **Files:** `src/cli/index.ts`, `src/cli/run.ts`, `tests/integration/cli.test.ts`
  - **Size:** M

- [x] **Task 41: Persist notification options in installed provider hooks**
  - **Acceptance:** Claude, Codex, and Gemini managed hook commands preserve explicit
    notification/sound options; reinstall and uninstall remain idempotent and preserve
    unrelated hooks and Codex `notify`.
  - **Verify:** installer integration and packaged distribution tests.
  - **Depends on:** Task 40
  - **Files:** `src/adapters/installers.ts`, `src/cli/install.ts`, installer tests,
    distribution test
  - **Size:** M

- [x] **Task 42: Add an owned OpenCode plugin installer**
  - **Acceptance:** install creates one bounded managed plugin using spawn argv and JSON
    stdin; uninstall removes only that file; existing OpenCode files and native Attention
    config remain untouched.
  - **Verify:** temp-home install/reinstall/uninstall tests and plugin source assertions.
  - **Depends on:** Task 41
  - **Files:** `src/adapters/opencode-installer.ts`, install routing, integration tests
  - **Size:** M

- [x] **Task 43: Report provider and OS notification readiness**
  - **Acceptance:** doctor distinguishes Side Glance backend availability from Codex,
    Gemini, OpenCode, and Aider native capability/configuration without writes or full
    provider payload exposure.
  - **Verify:** temp-home doctor fixtures for absent, configured, malformed, overridden,
    and unrelated configurations.
  - **Depends on:** Tasks 40–42
  - **Files:** notification inspection module, installer inspection, CLI doctor tests
  - **Size:** M

### Checkpoint: provider reach

- [x] Claude, Codex, Gemini, and OpenCode installs are reversible in temp homes
- [x] Aider bridge and generic exit behavior execute through the real CLI
- [x] Native provider settings are preserved and duplicate risk is reported

- [x] **Task 44: Align package docs, protocol, edge cases, and changelog**
  - **Acceptance:** commands are copy-pasteable; OpenCode/Aider plumbing claims are
    truthful; macOS/Linux/sound/click/Focus and generic-exit boundaries are explicit;
    rollback uses uninstall/default-off behavior.
  - **Verify:** public-document link/policy tests and residue scans.
  - **Depends on:** Tasks 40–43
  - **Files:** README files, protocol/edge-case docs, changelog, help tests
  - **Size:** M

- [x] **Task 45: Complete full verification and five-axis review**
  - **Acceptance:** every required gate passes or an already-documented host limitation
    has an equivalent verified path; final review has no unresolved required findings;
    no live config or real notification was triggered.
  - **Verify:** all `CLAUDE.md` commands, package/standalone smoke, diff/security review,
    and notification feature default-off rollback check.
  - **Depends on:** Task 44
  - **Files:** `REVIEW.md`, `LAUNCH.md`
  - **Size:** M

## Notification Parallelization

- **Safe to parallelize after Task 37:** Task 38 backend implementation, Task 42
  OpenCode installer design, and Task 44 documentation inventory.
- **Must be sequential:** Tasks 37 → 39 → 40 → 41; Task 43 follows the final CLI and
  installer shapes; Task 45 follows all implementation/docs.
- **Contract-first:** notifier interface, CLI option names, managed command format, and
  privacy-safe label rules are owned by Tasks 37–40 and must not be independently
  redefined.

### Phase 13: Side Glance identity migration

- [x] **Task 33: Lock the public identity with failing tests**
  - **Acceptance:** focused tests require package `side-glance`, executable
    `side-glance`, matching packed files/help text, and Side Glance site metadata.
  - **Verify:** run the focused package and rendered-site tests and capture the
    expected assertion failures before production edits.
  - **Depends on:** Task 32
  - **Files:** distribution and rendered-site tests
  - **Size:** S

- [x] **Task 34: Rename the package, CLI, runtime identity, and release pipeline**
  - **Acceptance:** source identifiers, environment variables, state names,
    installer markers, build outputs, archives, Homebrew formula, manifests, and CI
    use the new identity; migration-only cleanup recognizes owned legacy hooks.
  - **Verify:** focused unit, integration, and distribution tests plus typecheck.
  - **Depends on:** Task 33
  - **Files:** package/build/release configuration and CLI/core sources in bounded slices
  - **Size:** L

- [x] **Task 35: Rename the website, documentation, and repository policy surfaces**
  - **Acceptance:** all visible copy, components, CSS tokens, metadata, install
    examples, links, policy docs, and contributor guidance use Side Glance.
  - **Verify:** site tests, rendered HTML, build, browser checks, and residue scan.
  - **Depends on:** Task 34
  - **Files:** app, docs, root policy files, tests, and component filename
  - **Size:** L

- [x] **Task 36: Run the complete verification and review gates**
  - **Acceptance:** every required repository gate passes; desktop/mobile,
    keyboard, reduced-motion, console, and network checks pass; five-axis review
    has no unresolved required findings.
  - **Verify:** run every command in `CLAUDE.md`, inspect the final diff, and repeat
    the full case-sensitive residue scan.
  - **Depends on:** Task 35
  - **Files:** final review and launch notes
  - **Size:** M

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Node test runner TypeScript behavior differs from package build | Medium | Medium | Run tests on pinned Node 24 and typecheck separately |
| Local environment lacks some CLIs/terminals | Medium | High | Fixture contracts plus `doctor`; label live verification separately |
| Site starter dependency vulnerabilities | High | Medium | Run audit, avoid server persistence, review production dependency paths before publish |
| Installer touches personal config incorrectly | High | Low | Temp-home proof first; live mutation remains Ask First |

## Open Questions

None blocking. Public package publication and live config mutation remain explicit approval gates.

## Phase 15: Beta release-readiness remediation

- [x] **Task 46: Lock thermal units and adaptive history with regression tests**
  - **Description:** Add observable tests using real epoch-millisecond events plus EWMA
    samples before changing controller or reducer behavior.
  - **Acceptance:** 5/60/300-second events fail against the old 1,000× behavior; EWMA
    tests require alpha `0.4` and the 300–450-second maximum range.
  - **Verify:** focused policy, reducer, controller, and store tests show RED for the
    intended behavior rather than fixture or syntax failures.
  - **Depends on:** Requester approval of the Beta Release Readiness Contract
  - **Files:** `tests/unit/policy.test.ts`, `tests/unit/reducer.test.ts`,
    `tests/integration/controller-rendering.test.ts`, `tests/integration/store.test.ts`
  - **Size:** M

- [x] **Task 47: Implement typed adaptive thermal state**
  - **Description:** Convert milliseconds once, persist compatible completion/response
    timing fields, and feed the learned EWMA into completed visuals.
  - **Acceptance:** malformed history is safe; old schema-v1 files load; stale events do
    not modify history; focused thermal tests pass.
  - **Verify:** focused GREEN tests, unit suite, typecheck.
  - **Depends on:** Task 46
  - **Files:** `src/core/protocol.ts`, `src/core/reducer.ts`, `src/core/controller.ts`,
    `src/core/store.ts`, thermal tests
  - **Size:** M

- [x] **Task 48: Make preview and site phase visuals canonical**
  - **Description:** Export one pure visual policy for CLI preview/controller use and
    mirror its observable contract in the site model and copy.
  - **Acceptance:** all four preview phases match runtime; site says `Turn ran`; completed
    and failed retain distinct semantic labels.
  - **Verify:** focused CLI and site RED/GREEN tests, lint, typecheck.
  - **Depends on:** Task 47
  - **Files:** `src/core/controller.ts`, `src/cli/index.ts`,
    `app/components/playground-model.ts`, `app/components/SideGlancePlayground.tsx`, tests
  - **Size:** M

### Checkpoint: thermal correctness

- [x] Focused tests prove epoch-millisecond correctness and adaptive history
- [x] CLI preview, controller output, and website states agree
- [x] Focused unit, integration, site, lint, typecheck, and production-build gates are green

- [x] **Task 49: Model tmux by physical render ownership**
  - **Description:** Resolve a pane to its window before lease arbitration and persist one
    original snapshot for the shared physical window.
  - **Acceptance:** two panes in one window cannot wipe/resurrect each other; different
    windows remain independent; reset restores the original options once.
  - **Verify:** focused renderer/controller tests plus isolated live tmux test.
  - **Depends on:** Task 48
  - **Files:** `src/core/target.ts`, `src/core/protocol.ts`, `src/core/leases.ts`,
    `src/renderers/tmux.ts`, tmux tests
  - **Size:** M

- [x] **Task 50: Release previous surfaces on session migration**
  - **Description:** Recompute both old and new surfaces atomically when an accepted event
    changes target identity.
  - **Acceptance:** old surface restores or promotes its remaining owner before new paint;
    stale generations cannot clear either surface.
  - **Verify:** focused controller RED/GREEN tests and lease regressions.
  - **Depends on:** Task 49
  - **Files:** `src/core/controller.ts`, `src/core/leases.ts`,
    `tests/integration/controller-rendering.test.ts`, `tests/unit/leases.test.ts`
  - **Size:** M

- [x] **Task 51: Add bounded orphan reconciliation**
  - **Description:** Associate provider sessions with wrapper identity, track freshness,
    and reconcile abandoned active leases without claiming guaranteed signal cleanup.
  - **Acceptance:** wrapper exit closes inherited provider IDs; expired leases cannot
    outrank a newer owner; reconciliation is generation-safe and idempotent.
  - **Verify:** fake-clock reducer/store tests and killed-child CLI integration test.
  - **Depends on:** Task 50
  - **Files:** `src/core/protocol.ts`, `src/core/compact.ts`, `src/cli/run.ts`,
    `tests/integration/cli.test.ts`, `tests/unit/reducer.test.ts`
  - **Size:** M

### Checkpoint: ownership and recovery

- [x] Multi-pane and migration tests prove physical ownership
- [x] Orphan recovery is bounded and generation-safe
- [x] Reset remains session-scoped; rollback documentation is queued with public claims

- [x] **Task 52: Minimize provider hook stdout and semantic dedupe**
  - **Description:** Return provider-safe acknowledgements and derive stable semantic
    notification identities across repeated provider hook invocations.
  - **Acceptance:** hook stdout never contains sessions/surfaces; one Claude permission
    wait produces one alert; `status` retains full local state.
  - **Verify:** focused CLI/privacy and notifier RED/GREEN tests.
  - **Depends on:** Task 51
  - **Files:** `src/cli/index.ts`, `src/notifications/policy.ts`,
    `src/core/protocol.ts`, CLI/notification tests
  - **Size:** M

- [x] **Task 53: Encode honest provider completion and timeout contracts**
  - **Description:** Add bounded managed-hook timeouts, distinguish pre-final confidence,
    and prevent known retry/block paths from claiming native-final completion.
  - **Acceptance:** hung hooks return within the documented budget; fixture retries do not
    issue an early Ready notification; teardown remains non-fatal.
  - **Verify:** provider fixture tests and timeout integration tests.
  - **Depends on:** Task 52
  - **Files:** provider adapters, `src/adapters/installers.ts`, adapter/installer tests
  - **Size:** M per provider slice

- [x] **Task 54: Expand doctor into a truthful capability matrix**
  - **Description:** Separate binary, native alerts, adapter contract, integration,
    stable-surface, override, and live-verification status.
  - **Acceptance:** Codex defaults, OpenCode environment overrides, Aider bridge state,
    hook flags/timeouts, and wrapper requirement are reported without writes.
  - **Verify:** temp-home and environment-matrix RED/GREEN tests.
  - **Depends on:** Task 53
  - **Files:** `src/notifications/inspection.ts`, `src/cli/index.ts`,
    `src/cli/install.ts`, inspection/CLI tests
  - **Size:** M

- [x] **Task 55: Bound OpenCode and Aider support honestly**
  - **Description:** Permit colors-only stable OpenCode integration, reject incompatible
    plugin APIs actionably, and make Aider's static bridge the only documented contract.
  - **Acceptance:** install/uninstall remains reversible; unsupported versions fail
    closed; no undocumented Aider JSON producer is claimed.
  - **Verify:** installer fixtures, packaged CLI smoke, documentation contract tests.
  - **Depends on:** Task 54
  - **Files:** OpenCode/Aider adapters/installers and their tests/docs
  - **Size:** M per provider slice

### Checkpoint: provider safety

- [x] Provider hooks cannot leak global state or block for default multi-minute budgets
- [x] Semantic duplicate and native-notification warnings are proven
- [x] Support tiers match live evidence

- [x] **Task 56: Add non-color markers and Terminal.app fallback**
  - **Description:** Render distinct bounded tmux markers and expose an explicitly opt-in,
    sanitized terminal title capability with honest Terminal.app diagnostics.
  - **Acceptance:** completed and failed differ without color; default emits no title;
    reset restores only Side Glance-owned channels.
  - **Verify:** exact terminal-byte tests, tmux option tests, manual terminal matrix.
  - **Depends on:** Tasks 49 and 54
  - **Files:** renderers, CLI options/doctor, renderer tests
  - **Size:** M

- [x] **Task 57: Align public claims and release narrative**
  - **Description:** Update site, both READMEs, protocol/edge-case docs, changelog, and PR
    narrative to match the verified package and provider tiers.
  - **Acceptance:** install instructions use `@beta`; no custom-domain or live-provider
    claim exceeds evidence; beta.3 date remains unreleased until publication.
  - **Verify:** documentation scans, site/distribution tests, link checks.
  - **Depends on:** Tasks 48, 51, 55, 56
  - **Files:** documentation and site copy in bounded slices
  - **Size:** M per slice

- [x] **Task 58: Close dependency and repository-policy readiness**
  - **Description:** Land compatible development-tool security updates and prepare the
    exact live ruleset/environment changes for explicit approval.
  - **Acceptance:** production audit remains zero; no high development advisory remains
    where a compatible fix exists; policy tests require `require-staging-head`.
  - **Verify:** `npm audit`, full build/tests, distribution policy tests, live read-only
    ruleset comparison.
  - **Depends on:** Task 57
  - **Files:** package lock/manifest, policy tests/docs/workflow as required
  - **Size:** M

- [x] **Task 59: Complete full verification, browser matrix, and five-axis review**
  - **Description:** Run every repository gate, browser requirement, package/standalone
    smoke, security review, and create the final review artifact.
  - **Acceptance:** no unresolved Critical/required findings; every unsupported manual
    platform is recorded rather than inferred.
  - **Verify:** all `CLAUDE.md` commands and `REVIEW.md` evidence.
  - **Depends on:** Tasks 46–58
  - **Files:** `REVIEW.md`, verification evidence only
  - **Size:** M

- [ ] **Task 60: Prepare and execute the approved release path**
  - **Description:** Write rollback/monitoring notes, choose verified custom-domain or
    temporary R2 production origin, update the live main ruleset, refresh PR #37, merge,
    tag, publish, verify dist-tags/artifacts, and create the Homebrew tap only at the
    requester's approved external gates.
  - **Acceptance:** deployed site/assets, npm beta, GitHub release, checksums,
    attestations, and standalone binaries agree on one immutable commit/version.
  - **Verify:** `LAUNCH.md`, production HTTP/browser/package smoke, release workflow and
    first-hour observation.
  - **Depends on:** Task 59 and explicit approval for each external mutation
  - **Files:** `LAUNCH.md`, PR/release metadata
  - **Size:** M

## Phase 15 dependency graph

```text
thermal tests -> adaptive state -> preview/site parity
                                  |
                                  v
tmux ownership -> migration -> reconciliation
                                  |
                                  v
hook privacy/dedupe -> provider finality/timeouts -> doctor -> OpenCode/Aider tiers
          |                                                |
          +-----------------> markers/Terminal fallback <--+
                                                           |
                                                           v
claims -> dependencies/policy -> full review -> approved release
```

## Phase 15 sign-off

- [x] Requester approved the complete remediation scope with “work on all of this.”
- [x] Every task has observable acceptance and verification.
- [x] Tasks are ordered behind shared contracts and bounded to M-sized slices.
- [x] External publication and live configuration remain explicit Ask First gates.

## Phase 16: Guided setup and durable npx initialization

### Architecture decisions

- **Decision:** `setup` and durable `init` route to one typed workflow in
  `src/cli/setup.ts`; ephemeral `init` routes through a separate bootstrap boundary and
  delegates back to that workflow only after resolving a durable executable.
  **Rationale:** one setup contract prevents drift while keeping temporary-install risk
  isolated and testable.
- **Decision:** prompt rendering uses Node's built-in readline APIs behind an injected
  prompt interface. **Rationale:** the published CLI remains dependency-free while unit
  tests can drive cancellation, defaults, and selections without a real terminal.
- **Decision:** JSON-hook and OpenCode installers first move onto one snapshot-driven
  participant kernel: bounded no-follow reads, validated parent chains, bytes/mode and
  concurrency tokens, private snapshot-derived backups, exact desired-state verification,
  compare-before-rollback, and a shared Side Glance writer lock also used by direct
  install/uninstall. Human/JSON output receives only a redacted projection. **Rationale:**
  the existing per-file installers cannot safely be wrapped into a multi-file transaction
  while they re-read paths and overwrite without a complete interference check.
- **Decision:** a setup transaction revalidates the complete approved plan under the lock,
  applies atomically per target, verifies all selected targets after the final write, and
  rolls back caught failures in reverse order only while each target still matches the
  transaction's applied token. **Rationale:** this restores exact bytes/mode/absence without
  clobbering a concurrent external edit.
- **Decision:** transactional claims stop at caught failures. No secret configuration
  snapshot is persisted as a crash journal; interruption can be diagnosed and repaired by
  the next idempotent init. **Rationale:** cross-file crash atomicity is impossible with
  independent renames, and persisting user config creates a larger privacy risk.
- **Decision:** package-manager execution is injected, uses argument vectors without a
  shell, and is never reached during planning/dry-run. **Rationale:** bootstrap tests stay
  offline and live installation remains visibly consented.
- **Decision:** no `--force` flag is added. Re-runs replace only owned entries; malformed,
  incompatible, or unrelated targets fail closed. **Rationale:** global user configuration
  deserves stricter ownership than a disposable project scaffold.
- **Decision:** npx emits a staged `bootstrap-plan` until an exact-version durable
  executable is resolved; only the durable CLI emits an authoritative `setup-plan`.
  **Rationale:** the post-install executable realpath affects hook create/update/unchanged
  classification and cannot be guessed during a no-install preview.
- **Decision:** provider eligibility and notification coverage/defaults are explicit data,
  not prompt-only copy. **Rationale:** unsafe detected providers must not be selected, and
  enabling an alert channel must not imply a completion ding a provider cannot deliver.

### Rejected alternatives

- Rejected pointing provider hooks at the npx executable, because the npm cache is not a
  durable runtime and may disappear or change after initialization.
- Rejected a `curl | sh` bootstrap or copying the npx payload into a hidden directory,
  because that creates a second unmanaged distribution/update channel.
- Rejected separate `init` and `setup` planners, because notification recommendations,
  ownership rules, and previews would inevitably drift.
- Rejected adding Clack/Commander solely for onboarding, because the standalone/npm CLI
  currently ships as a dependency-free bundle and the required prompt surface is bounded.
- Rejected best-effort continuation after one provider fails, because success would be
  ambiguous and users could unknowingly run different notification/lifecycle policies.
- Rejected an unqualified crash-proof transaction claim or a durable secret-snapshot
  journal, because the former is false and the latter expands the privacy/security surface.

- [x] **Task 61: Lock safe mutation, setup, and bootstrap behavior with RED tests**
  - **Description:** Add focused failing contracts before production edits: safe target
    snapshots, parent/final symlink refusal, target replacement and same-inode edits,
    absent-to-created races, writer contention, private backups, exact verification,
    rollback conflicts, setup argument/TTY/JSON behavior, privacy sentinels, provider
    eligibility, notification coverage/defaults, and staged bootstrap results.
  - **Acceptance:** tests fail for missing behavior rather than fixtures; every error path
    proves no unintended write and no hostile key/value/control byte leakage; setup help
    exits before detection; canonical provider order and exit codes 0/1/130 are fixed.
  - **Verify:** focused installer, setup-unit, CLI, and packaged-test commands show the
    intended RED assertions.
  - **Depends on:** approved Guided Setup Contract
  - **Files:** `tests/integration/installers.test.ts`, `tests/unit/setup.test.ts`,
    `tests/integration/cli.test.ts`, `tests/distribution/npm-package.test.mjs`, test helpers
  - **Size:** M

- [x] **Task 62: Build the shared safe provider mutation kernel**
  - **Description:** Refactor JSON-hook and OpenCode paths onto one internal participant
    shape for bounded snapshot, parent validation, plan, revalidation, private backup,
    atomic/fsynced apply, exact verification, guarded rollback, and rollback verification;
    add one owner-validated Side Glance writer lock used by setup/install/uninstall and an
    executable-identity participant rechecked immediately before configuration writes.
  - **Acceptance:** direct install/uninstall preserve current JSON/result contracts while
    rejecting unsafe parents and interference; backup bytes come from the approved snapshot
    at mode 0600; existing target mode is preserved; rollback never overwrites an external
    edit; unchanged operations create no write or backup.
  - **Verify:** Task 61 mutation/race/backup/lock tests turn GREEN; all existing installer,
    OpenCode, CLI-install, lint, and typecheck tests remain GREEN.
  - **Depends on:** Task 61
  - **Files:** `src/adapters/config-target.ts`, `src/adapters/installers.ts`,
    `src/adapters/opencode-installer.ts`, `src/cli/install.ts`, installer/CLI tests
  - **Size:** M

- [x] **Task 63: Build the shared read-only setup planner**
  - **Description:** Centralize durable executable validation, safe provider discovery and
    eligibility, exact owned hook/plugin plan generation, action classification,
    notification readiness/defaults/coverage, Aider/custom-notifier guidance, duplicate
    warnings, stable launch guidance, argument parsing, and redacted/versioned projections.
  - **Acceptance:** only eligible providers default selected; blocked/unavailable/guidance
    states are explicit; no provider binary executes; OpenCode claims only the detected
    v1-command contract; Claude/Codex/Gemini pre-final Ready silence is visible; dry-run and
    future apply share the exact desired provider transforms once a durable path exists.
  - **Verify:** planner/argument/privacy tests turn GREEN; existing doctor and notification
    inspection suites remain GREEN; typecheck passes.
  - **Depends on:** Task 62
  - **Files:** `src/cli/setup.ts`, `src/cli/doctor.ts`, `src/cli/executable.ts`, provider
    participants, `tests/unit/setup.test.ts`, `tests/integration/cli.test.ts`
  - **Size:** M

### Checkpoint: safe planning and mutation kernel

- [x] Direct install/uninstall use snapshot-driven interference checks and one writer lock
- [x] Dry-run is a redacted projection of exact provider transforms and performs no writes
- [x] Eligibility and notification messaging match actual provider contracts
- [x] Focused unit, integration, lint, and typecheck gates are GREEN

- [x] **Task 64: Add caught-failure multi-provider transaction orchestration**
  - **Description:** Revalidate the complete approved plan under the shared lock, apply
    participants in canonical order, verify every exact desired state after the final
    write, and on caught failure roll back in reverse order using applied-state tokens;
    remove transaction-created empty directories only when still empty and unchanged.
  - **Acceptance:** a four-provider plan applies/verifies as one command; injected failure
    after any write restores exact bytes/mode/absence; a concurrent edit yields a distinct
    redacted rollback conflict without clobbering it; JSON failure is one versioned stdout
    object with nonzero exit; interruption limitations remain explicit.
  - **Verify:** full apply/verify/failure/signal/conflict matrix, including directory and
    permission failures, turns GREEN; idempotent re-run creates no backup or write.
  - **Depends on:** Task 63
  - **Files:** `src/cli/setup-transaction.ts`, `src/cli/setup.ts`, `src/cli/entry.ts`,
    provider participants, setup/installer integration tests
  - **Size:** M

- [x] **Task 65: Add the dependency-free interactive init/setup experience**
  - **Description:** Implement semantic prompt and renderer interfaces over built-in
    readline; present eligible/default provider choices, separate notification choices and
    honest coverage, safe sound input, redacted plan, confirmation, progress, caught-signal
    handling, verification/rollback results, and conditional Aider/generic guidance.
  - **Acceptance:** `init` and `setup` are exact durable aliases; No/EOF exits 0, SIGINT 130,
    incomplete non-TTY 1, help 0; no writes precede final confirmation; invalid input
    reprompts; no-eligible state exits read-only; static/no-color output remains legible;
    JSON contains no decoration and human output contains no raw config/probe values.
  - **Verify:** semantic prompt unit tests, spawned non-TTY/signal tests, and automated PTY
    temp-home smoke cover cancellation, defaults, reprompting, empty eligibility, and the
    complete happy path.
  - **Depends on:** Task 64
  - **Files:** `src/cli/prompts.ts`, `src/cli/setup.ts`, `src/cli/index.ts`, setup/CLI/PTY tests
  - **Size:** M

- [x] **Task 66: Add the staged safe npx-to-durable init bootstrap**
  - **Description:** Detect ephemeral invocation; scan past shadowing npx candidates;
    realpath/inode/cache-check and bounded-time/version-check a separate durable executable;
    otherwise emit a non-authoritative bootstrap plan, offer Homebrew/npm/preview, display
    and confirm exact absolute-path argv, run the chosen installer without a shell, require
    an exact-version durable result, sanitize inherited npm-exec state, then delegate
    authoritative planning/apply using the stable invocation path.
  - **Acceptance:** no ephemeral/cache/same-inode path enters hooks; raw or malicious
    version output is bounded and never forwarded; custom npm caches and PATH shadowing are
    covered; package managers resolve once to validated absolute paths; npm pins the exact
    version with ignore-scripts/audit/fund disabled; Homebrew distinguishes install/upgrade,
    preserves its stable bin symlink, and fails safely during tap-version lag; only supported
    macOS/glibc-Linux targets offer installation; `--install` is ephemeral-init-only; no
    unavailable-method fallback occurs; a no-install dry-run marks provider actions/launch
    commands deferred; package-installed and setup-applied outcomes remain distinct.
  - **Verify:** fake PATH/cache/package-manager/durable-binary matrix plus packed npm smoke
    proves exact-version existing handoff, bootstrap-plan JSON, exact-version npm argv,
    Homebrew install/upgrade argv and lag, inherited-env sanitization, platform refusal,
    timeout/oversized/malformed version output, post-install missing/mismatch, child failure,
    package-retained cleanup guidance, stable symlink persistence, and zero `_npx` hook paths.
  - **Depends on:** Tasks 63–65
  - **Files:** `src/cli/bootstrap.ts`, `src/cli/executable.ts`, `src/cli/index.ts`,
    `tests/integration/cli.test.ts`, `tests/distribution/npm-package.test.mjs`,
    `tests/distribution/standalone.test.mjs`, `tests/distribution/homebrew.test.mjs`
  - **Size:** M

### Checkpoint: complete onboarding runtime

- [x] `npx side-glance@<channel> init --dry-run` performs no writes or installer calls
- [x] An approved bootstrap delegates only to a separately validated exact-version binary
- [x] Durable init applies only the exact plan the user previewed and approved
- [x] Caught failures roll back safely; interruption and repair boundaries are explicit
- [x] Packaged source, npm, and standalone CLIs expose identical durable setup behavior

- [x] **Task 67: Converge installation, notification, and recovery guidance**
  - **Description:** Make root/package READMEs, landing page, CLI help, changelog, launch
    notes, and recovery guidance present Homebrew + `side-glance init` as the canonical
    installed path and npx `init` as the bootstrap/trial path, while preserving advanced
    install/uninstall/doctor/run instructions and the exact `setup` alias.
  - **Acceptance:** beta copy uses `@beta`; stable copy is conditional on the latest tag;
    hook semantics versus wrapper surface identity, per-provider notification coverage,
    native-duplicate defaults, Aider conflict-aware bridge, OpenCode experimental status,
    caught-failure rollback, interruption repair, and one smoke/rollback sequence are clear.
  - **Verify:** documentation/source-contract tests, links, site tests, lint, typecheck,
    production build, and copy scans for overclaims.
  - **Depends on:** Tasks 65–66
  - **Files:** `README.md`, `packages/cli/README.md`, `src/cli/index.ts`, site setup copy,
    `CHANGELOG.md`, `LAUNCH.md`, documentation/site/distribution tests
  - **Size:** M

- [x] **Task 68: Complete release-grade verification and independent review**
  - **Description:** Run every repository gate, packed npm/global-prefix and standalone
    smoke, automated PTY and automation journeys, race/rollback fault matrix, security and
    privacy scans, documentation consistency scan, and independent five-axis review;
    remediate all Critical/required findings and record evidence.
  - **Acceptance:** no unresolved Critical/required finding; no live provider config, real
    notification, npm publish, Homebrew mutation, deployment, or release occurs; REVIEW
    records exact commands/results and the PR narrative explains durability and failure
    boundaries without exposing configuration.
  - **Verify:** `npm run test:unit`, `npm run test:integration`, `npm run test:coverage`,
    `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, packed/standalone smoke,
    automated PTY smoke, `git diff --check`, and independent code/documentation review.
  - **Depends on:** Task 67
  - **Files:** `REVIEW.md`, verification evidence, remediation files as required
  - **Size:** M

- [x] **Task 69: Commit, push, and open the staging PR**
  - **Description:** Commit the approved spec/plan and reviewed implementation in coherent
    slices, push `codex/add-guided-setup`, open a complete PR to protected `staging`, and
    inspect CI/review state until it is merge-ready.
  - **Acceptance:** the PR references the approved contract, lists observable setup/init
    and rollback journeys, contains no unrelated changes, and every required check is green.
  - **Verify:** clean worktree, remote commit equality, `gh pr view`, and `gh pr checks`.
  - **Depends on:** Task 68
  - **Files:** git/PR metadata only
  - **Size:** S

## Phase 16 dependency graph

```text
RED safety/setup contracts -> safe provider mutation kernel -> read-only planner
                                      |                            |
                                      +------> transaction <-------+
                                                   |
                                                   v
                                         interactive init/setup
                                                   |
                                                   v
                                           staged npx bootstrap
                                                   |
                                                   v
                                          docs/help/site parity
                                                   |
                                                   v
                                    full review -> staging PR
```

## Phase 16 risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| Npx cache path reaches a provider hook | Low | Critical | Central durable-path validator, exact packaged smoke, transaction preflight |
| Caught failure leaves partial provider setup | Low | High | Plan-all-first, shared lock, applied tokens, exact verify, guarded reverse rollback |
| Crash interrupts distinct file renames | Low | High | Honest boundary, partial-state doctor output, idempotent repair; no secret snapshot journal |
| Duplicate native and Side Glance alerts | Medium | Medium | Separate selection, readiness-derived defaults, explicit warning and summary |
| Bootstrap runs an unintended command | Low | Critical | Bounded method enum, validated executable, argv spawn, exact preview/consent, no shell |
| Interactive UI is hard to test | Medium | Medium | Injected semantic prompt/renderer interfaces plus automated temp-home PTY smoke |
| Public copy implies hooks alone color Terminal.app | Medium | High | Contract test wrapper/surface wording across CLI, READMEs, and site |

## Phase 16 rollback and observability

- Before apply, retain exact in-memory target snapshots and private ordinary backups; on a
  caught failure, restore in reverse order only while applied-state tokens still match,
  verify each result, and report conflicts/outcomes without printing contents.
- A successful Homebrew/npm bootstrap may remain installed if later validation or setup
  fails; it is outside provider rollback and the result provides known cleanup guidance.
- Feature rollback is source-only before release: remove `init`/`setup` routing and docs;
  existing advanced install/uninstall behavior remains unchanged.
- User rollback after a successful setup remains `side-glance uninstall <provider> --json`
  per provider, followed by `side-glance doctor --json`; setup reports every backup path.
- Observe only local command exit status, redacted provider integration state, and test/CI
  evidence. No telemetry, transcripts, prompts, or live notification delivery is added.

## Phase 16 sign-off

- [x] Requester approved the Guided Setup Contract and npx/init direction.
- [x] Transaction, UX/privacy, and npx/distribution reviewers independently challenged the
  plan; required findings are incorporated before production code.
- [x] Every task has observable acceptance and verification.
- [x] Tasks are ordered behind shared contracts and bounded to M-sized slices.
- [x] External publication, live configuration, and real notifications remain Ask First.
- [x] Requester approved this implementation plan on 2026-08-24.

## Sign-off

- [x] Every task has acceptance + verify
- [x] Tasks ordered by dependency
- [x] No XL tasks remain
- [x] Checkpoints between phases
- [x] Requester approved implementation with red-green TDD
