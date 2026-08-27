# Vercel preview upload failure

## Observations

- Historical environment at the time of failure: macOS arm64, Vercel CLI 54.18.0,
  linked to the pre-rename Vercel project. The same project ID was later renamed and
  relinked as `andrew-243s-projects/side-glance`.
- The first preview upload attempted 267.8 MB, reached 67 MB, then failed before deployment creation with an OpenSSL `bad record mac` TLS error.
- `vercel deploy --dry` selected 222 files totaling 281,535,211 bytes.
- `work/` contributed 240,771,924 bytes and `outputs/` contributed 38,280,624 bytes.
- Vercel already ignored `.next`, `.vercel`, `node_modules`, `.git`, and `.env.local`.

## Hypotheses

### H1: Release rehearsal artifacts inflated the upload (ROOT HYPOTHESIS)

- Supports: `work/` plus `outputs/` account for 99.1% of the selected bytes and closely match the failed upload size.
- Conflicts: none.
- Test: inspect Vercel's dry-run selection and sizes.

### H2: Next.js or dependency build output inflated the upload

- Supports: `.next` is 34 MB and `node_modules` is 800 MB locally.
- Conflicts: the dry run explicitly lists both as ignored.
- Test: inspect Vercel's ignored-file list.

### H3: The failure was only a transient Vercel TLS fault

- Supports: the immediate error occurred in TLS transport.
- Conflicts: the upload included two 120 MB binaries unrelated to the website; retrying the same payload leaves the avoidable failure condition intact.
- Test: reduce selected deployment bytes, then retry once.

## Experiments

`vercel deploy --dry` confirmed H1 without changing source: `work/` and `outputs/` were selected while `.next` and `node_modules` were already ignored.

## Root Cause

Vercel CLI does not infer every generated directory from `.gitignore`; the repository lacked a `.vercelignore`, so native release rehearsal artifacts dominated the preview upload.

## Fix

Add a test-covered `.vercelignore` for non-site generated artifacts, verify the dry-run payload is bounded, and retry the preview deployment.

---

# Clean-CI rendered HTML failure after the Vercel-only migration

## Observations

- GitHub Actions run `31664448256`, job `94335901839`, failed only in `tests/rendered-html.test.mjs` after a successful standard `next build`.
- The exact error was `ERR_MODULE_NOT_FOUND` for `dist/server/index.js`.
- That path was the removed vinext Worker output; standard Next.js writes the prerendered homepage to `.next/server/app/index.html`.
- The test passed locally because an ignored, stale `dist/server/index.js` remained from the previous vinext build. The file is not tracked, so it does not exist in a clean checkout.
- Unit, integration, distribution, site-contract, Next build, npm compatibility, and native artifact checks passed.

## Hypotheses

### H1: The rendered-output test still targets vinext output, and stale local state masked it (ROOT HYPOTHESIS)

- Supports: the failing path is `dist/server/index.js`; the test imports that exact path; local `dist/server/index.js` exists but is untracked; Next produced `.next/server/app/index.html` in both local and CI builds.
- Conflicts: none.
- Test: prove the old file is untracked and the Next artifact exists after `next build`.

### H2: Next.js emits a different output layout on Linux

- Supports: the failure occurred on Linux CI and not on local macOS.
- Conflicts: the log fails before reading any Next artifact; both environments report the same static route, and the test explicitly asks for vinext's `dist` path.
- Test: inspect the CI build route output and local `.next/server/app` layout.

### H3: CI did not run the site build before the rendered-output test

- Supports: a missing generated file can mean a missing build step.
- Conflicts: the log records a successful `next build` immediately before the failing test.
- Test: inspect command ordering in the workflow log.

## Experiments

- H1 confirmed without source changes: `test -f dist/server/index.js` succeeds locally while `git ls-files dist/server/index.js` returns nothing; `.next/server/app/index.html` exists after the canonical build.
- H2 rejected: the successful CI route report matches the local build, and no platform-specific output was requested by the test.
- H3 rejected: CI completed the Next.js build directly before executing `tests/rendered-html.test.mjs`.

## Root Cause

The Vercel-only migration changed the canonical build output from vinext's ignored `dist/server` tree to Next.js's `.next/server/app` tree, but the rendered HTML test kept importing the obsolete path, and a stale local artifact hid that dependency.

## Fix

Read and assert against Next.js's generated `.next/server/app/index.html`, add a regression assertion forbidding the obsolete `dist/server/index.js` reference, and verify after removing generated output and rebuilding.

---

# Reduced-motion storyboard hydration mismatch

## Observations

- Environment: Next.js 16.3 production build, React 19.2.6, Motion 12.34.0, Vercel deployment `dpl_7ut5QyG1LJ8pgAvALoYeno8x2ECt`.
- A fresh browser with normal motion reports no page errors and hydrates the server-rendered 2×2 terminal grid normally.
- A fresh browser emulating `prefers-reduced-motion: reduce` reports minified React error `#418`, a server/client text or attribute hydration mismatch.
- The server cannot know the client media preference and renders `data-layout="grid"`; during the client’s first render, `useReducedMotion()` can return `true`, making `visibleStage` complete and requesting `data-layout="stack"` plus different terminal attributes and legend text.
- After React recovers, the reduced-motion result is visually correct: four awake terminals, static stack, zero running animations, and no overflow.

## Hypotheses

### H1: The media-query value changes first-render markup (ROOT HYPOTHESIS)

- Supports: the error occurs only with reduced motion; server markup is grid; the first client render derives stack directly from `useReducedMotion()`.
- Conflicts: none.
- Test: compare fresh normal-motion and reduced-motion browser error lists against the same immutable deployment.

### H2: Reduced-motion CSS mutates the DOM before React hydrates

- Supports: the reduced-motion stylesheet changes animation and transition behavior.
- Conflicts: CSS cannot change React text, attributes, or DOM structure, and React `#418` is a markup mismatch.
- Test: compare server/client data attributes rather than computed styles.

### H3: A stale CDN asset paired old HTML with new JavaScript

- Supports: cached deployment assets can theoretically be inconsistent during promotion.
- Conflicts: normal and reduced sessions load the same immutable deployment; only the media preference changes the outcome.
- Test: reproduce both paths on fresh sessions against the same deployment.

## Experiments

- Normal-motion control: a fresh 390×844 session reports `errors: []`.
- Reduced-motion variable: a fresh session on the same deployment reports React `#418` and then recovers to the static final stack.
- H1 confirmed; H2 and H3 rejected because the only changed variable is the client media preference and the differing markup is directly derived in render.

## Root Cause

The component used a client-only media-query result to choose different markup during the first hydration render, while the server always rendered the opening grid.

## Fix

Preserve the server grid through the first client render with a `hasHydrated` gate, then switch reduced-motion users to the final stack from a zero-delay post-hydration timer using zero-duration transitions. The focused regression test, lint, typecheck, production build, and original 390×844 reduced-motion browser reproduction pass with no React errors, four awake terminals, zero running animations, and no overflow.

---

# Audible attention with several Claude sessions in iTerm2

## Observations

- User feedback asks for Side Glance to be “dingable” because several Claude Code
  sessions are commonly open under iTerm2.
- The current product has terminal and tmux visual renderers but no audible renderer,
  sound preference, BEL byte, or hook `terminalSequence` response.
- Claude Code gives every hook a stable `session_id`; the adapter preserves it, and
  Side Glance keys sessions by provider plus session ID.
- Side Glance already arbitrates multiple sessions that share one surface by attention
  priority, recency, and deterministic owner key. Releasing one lease reveals the next
  owner rather than resetting the surface.
- Installed provider hooks rely on a wrapper-provided surface identity because hook
  stdin is JSON and providers do not consistently expose a controlling TTY.
- Current Claude Code documentation says command hooks run without a controlling
  terminal and should return `terminalSequence` for terminal notifications. Claude
  emits the sequence through its own terminal path; bare BEL is allowlisted and the
  documented path works through tmux and GNU screen.
- Current iTerm2 documentation says BEL (control-G) can produce an audible sound, a
  visual bell, a tab bell icon, and Notification Center alerts according to the active
  profile. “Silence bell” disables the audible sound.

## Hypotheses

### H1: Return a bare BEL from the originating Claude hook (ROOT HYPOTHESIS)

- Supports: Claude explicitly provides `terminalSequence` for this purpose, emits it
  in the originating UI, allowlists bare BEL, and handles tmux/screen routing. iTerm2
  maps BEL to user-configurable audible and visual attention. Distinct Claude
  processes therefore ding their own iTerm2 sessions without Side Glance guessing a
  foreground tab or OS process.
- Conflicts: Side Glance currently prints its full state object as hook JSON, so the
  hook response contract must be extended without weakening status/event output. BEL
  cadence and opt-in configuration are not yet defined.
- Test: submit attention-worthy Claude hook events for two distinct session IDs and
  assert each response contains exactly one top-level BEL `terminalSequence`, while
  working and teardown events do not.

### H2: Write BEL directly to the discovered TTY from the surface renderer

- Supports: the terminal renderer already validates and writes to an owned character
  TTY; a BEL byte is terminal-native and iTerm2 recognizes it.
- Conflicts: Claude hooks have no controlling terminal, wrapper identity is required,
  and direct rendering is deliberately disabled for tmux targets. This would make the
  ding less reliable precisely in the native-hook and tmux cases covered by the
  feedback.
- Test: invoke an installed-style Claude hook without wrapper target environment and
  confirm that current TTY discovery cannot identify a surface.

### H3: Send a process-global macOS sound or notification

- Supports: `afplay`, AppleScript, or a notification helper can make sound without a
  TTY.
- Conflicts: the result is not naturally attached to the originating iTerm2
  tab/session, adds platform-specific dependencies or permissions, and does not use
  iTerm2’s existing bell preferences.
- Test: compare the information available to an OS-level sound process with Claude’s
  per-hook terminal emission path; only the latter owns the correct session routing.

### H4: Existing visual lease arbitration prevents several Claude sessions from working

- Supports: a single surface can display only one visual owner at a time, so concurrent
  sessions necessarily compete for the same background/status channel.
- Conflicts: distinct session IDs are retained independently, ownership priority is
  deterministic, and tests already cover releasing one shared-surface lease without
  clearing another.
- Test: drive two Claude session IDs through completion/end on one logical surface and
  verify the resolved owner changes without losing either session.

## Experiments

- Focused existing tests for provider-native hooks, wrapper target inheritance,
  shared-surface ownership, and lease arbitration passed: 4 tests, 0 failures.
- A current `Stop` hook invocation on a logical surface returned a completed Claude
  session and visual surface state but no `terminalSequence`. This confirms the
  audible channel is absent rather than merely undocumented.
- An installed-style hook invoked with piped JSON and no wrapper target exited with
  `No controlling terminal surface was found; pass --surface or run from a TTY.`
  This confirms H2 cannot cover unwrapped native hooks.
- Two Claude IDs were driven through one logical surface. Session A completed and
  remained the owner while session B worked; B became owner when it completed; ending
  B revealed completed session A. Both records remained intact. This rejects H4.
- Claude's current hook reference documents `terminalSequence` as the race-free
  terminal emission path, explicitly allowlists bare BEL, and states that it works
  through tmux and GNU screen. Together with iTerm2's documented BEL behavior, this
  confirms H1 and makes H3 unnecessary for the reported use case.

## Root Cause

Side Glance implements visual surface ownership but never emits Claude Code's
per-origin terminal notification response, so no attention event can ring the iTerm2
session that produced it.

## Recommended Fix (superseded by the desktop-notification clarification)

Add an opt-in Claude bell setting that returns top-level
`{"terminalSequence":"\u0007"}` alongside the hook result for selected
attention-worthy events. Keep bell emission independent from visual target discovery
so an installed Claude hook can still ding when it was not launched through
`side-glance run`; targetless events may update session state without painting a
surface. Default it off, ring once on `Stop` completion and on Claude `Notification`
events that already map to waiting, and do not ring on start, prompt submit,
acknowledgement, or teardown. Do not promise a `StopFailure` ding because Claude's
documented hook contract ignores that event's output. Test two distinct Claude session
IDs to prove that each qualifying hook response contains exactly one BEL regardless of
shared visual-surface ownership. Document that iTerm2's profile controls whether BEL
is audible, visual, shown on the tab, or forwarded to Notification Center.

---

# Audible attention across every supported provider

## Observations

- The user clarified that “sound the bells” means a native computer/desktop
  notification with sound, not merely an ASCII terminal bell. Terminal BEL is now a
  fallback rather than the target behavior.
- Side Glance supports six integration shapes: installed Claude, Codex, and Gemini
  hooks; OpenCode plugin events; Aider's completion notification plus wrapper; and the
  generic supervised wrapper.
- All normalized providers share the same session/lease state model, but they do not
  share a provider output protocol. Claude's `terminalSequence` is therefore evidence
  for Claude only until each other contract is checked.
- The default surface renderer can write verified terminal bytes only when a target has
  an owned TTY, and it intentionally avoids whole-client terminal painting for tmux
  panes. The wrapper exports stable surface, TTY, pane, and fallback session identity
  to its child.
- The generic wrapper observes process start and exit, not per-turn completion or
  permission-waiting events. Provider adapters provide the finer-grained cadence.
- This host has Claude Code 2.1.228 and Codex CLI 0.147.0-alpha.6.5 available for
  read-only inspection. Gemini CLI, OpenCode, and Aider are not locally installed, so
  their live behavior cannot be claimed from this environment.

## Hypotheses

### H1: Each provider has a native, terminal-local response channel

- Supports: Claude has a verified hook response channel, and other providers expose
  lifecycle callbacks that might offer comparable output handling.
- Conflicts: Side Glance's adapters already differ in installation and fidelity, and
  callback stdout semantics are provider-specific.
- Test: inspect current primary documentation and local help/source where available
  for a BEL, escape-sequence, or terminal-notification response contract.

### H2: A verified TTY bell is the universal fallback

- Supports: every command run through `side-glance run` inherits a stable TTY target;
  BEL is a terminal-native attention signal; the renderer already enforces owned
  character-device safety.
- Conflicts: unwrapped installed hooks may lack a target, tmux routing differs from
  direct terminal painting, and process-only wrappers cannot signal per-turn completion.
- Test: classify every adapter by whether it inherits wrapper target identity and
  whether its attention-worthy callback executes while that target remains reachable.

### H3: One OS-native notification backend is the common transport (ROOT HYPOTHESIS)

- Supports: it does not depend on a provider output contract or TTY. Apple's official
  Standard Additions `display notification` command accepts title, subtitle, body, and
  a sound name, matching the clarified macOS/iTerm2 use case.
- Conflicts: it cannot focus the originating iTerm2 tab by itself, macOS users may mute
  or deny the notifying app, and Linux/Windows need separate capability-detected
  backends if the feature later becomes cross-platform.
- Test: validate a no-shell `osascript` invocation with controlled arguments, mock the
  process boundary in tests, and verify notification failures never fail provider hooks
  or lifecycle state updates.

### H4: The current adapters can all become audible by changing only the renderer

- Supports: all accepted events eventually reach `SideGlanceController.submit`.
- Conflicts: the controller currently renders only the resolved visual owner, while an
  audible event should remain session-local even when another shared-surface lease has
  higher visual priority. Targetless callbacks also return before rendering.
- Test: submit a lower-priority completion from one session while another session owns
  the same surface and determine whether renderer-driven emission would still represent
  the originating event.

## Experiments

### Provider capability matrix

| Provider | Verified computer-notification path | Attention cadence | Sound control | Current Side Glance boundary |
|---|---|---|---|---|
| Claude Code | Hook response `terminalSequence` with OSC 9/777; bare BEL is only a fallback | `Stop` completion and permission/idle `Notification`; `StopFailure` output is ignored | Terminal/macOS preferences; no hook-level sound selector | Installed hook exists, but Side Glance does not return a notification sequence today |
| Codex | Native `[tui] notifications`, `notification_method = "auto"`, and `notification_condition`; `auto` prefers OSC 9 then BEL | Agent turn complete and approval requested | Terminal/macOS preferences; no documented custom sound/title/body | Installer preserves `config.toml` and its separate top-level `notify`; doctor does not inspect native TUI notification settings |
| Gemini CLI | Native `general.enableNotifications` plus `notificationMethod = "auto"`; iTerm uses OSC 9 with tmux/screen passthrough | Action required and successful session completion, with focus suppression and cooldown | Terminal/macOS preferences; no custom sound name | Installed hooks exist, but their stdout must stay JSON and has no Claude-style terminal sequence field |
| OpenCode | Native TUI `attention` config | Questions, permissions, session errors, completion; subagent sound is distinct and desktop notification is top-level only | Built-in volume, sound packs, and per-event sound files | Side Glance has an adapter contract but no OpenCode installer or live event plumbing |
| Aider | Native `--notifications`; macOS uses `terminal-notifier` or AppleScript fallback | Once when Aider next waits for input/confirmation after an LLM cycle | Backend/OS dependent; default macOS path does not request a Side Glance-selected sound | `side-glance run -- aider --notifications` works now, but the current synthetic completion JSON adapter is not emitted by Aider |
| Generic wrapper | No native per-turn path; a future OS notification can represent process exit only | Spawn failure, exit, or signal—not turn ready/permission waiting | Would depend on a Side Glance OS backend | Accurate only as explicitly named `notify-on-exit` for one-shot commands |

### Results

- H1 was rejected as a universal architecture. Claude alone documents
  `terminalSequence`; Codex and Gemini require JSON-only hook output and already own
  native TUI notifications. OpenCode and Aider expose different first-party mechanisms.
- H2 remains a terminal-only fallback, not the clarified product target. It also cannot
  cover targetless hooks or guarantee desktop presentation and sound.
- H3 is confirmed if Side Glance needs consistent cross-provider title/body/session
  labels and a selected sound. Apple officially supports Notification Center title,
  subtitle, body, and `sound name`; the OS can still mute or suppress the result. Linux
  desktop notification sound is optional and daemon-dependent, so it can only be
  best-effort. Windows remains outside the current beta support claim.
- H4 is rejected. Focused lease/controller tests passed and show that visual arbitration
  may render a different, higher-priority session than the event that just arrived. A
  notifier must operate on the accepted originating event, independently of the visual
  owner and target discovery.
- Current local binaries: Claude Code 2.1.228 and Codex CLI
  0.147.0-alpha.6.5. Their inspected behavior agrees with current primary documentation.
  Gemini, OpenCode, and Aider were not installed locally, so their capabilities were
  verified from current official documentation, schemas, and upstream source rather
  than live execution.
- Read-only focused repo verification passed across adapters, installers, CLI target
  inheritance, reducer/lease ownership, and controller recomputation. No live provider
  configuration was mutated.
- Required repository verification on Node 24.18.0 passed unit 28/28, integration
  32/32 with the opt-in live-tmux case skipped, coverage at 91.06% lines / 72.13%
  branches / 98.82% functions, lint, serial typecheck, the documented webpack
  production build, and rendered HTML 2/2. The aggregate gate also passed distribution
  16/16 and site 19/19 before reaching canonical `next build`. Canonical Turbopack and
  therefore the aggregate `npm test` command remain blocked by this host's previously
  documented internal PostCSS helper port-binding error (`Operation not permitted`);
  the supported webpack production path passed before and after that attempt.

## Root Cause

Side Glance has one shared lifecycle state model but no notification policy, native OS
notification renderer, or provider-capability setup layer; meanwhile the providers'
built-in notification contracts differ and Side Glance's OpenCode/Aider adapters are
not installed end-to-end integrations.

## Recommended Product Direction (not implemented in this investigation)

1. Prefer each provider's first-party notification path and teach `doctor` to report
   readiness without silently enabling or overwriting it:
   - Claude: opt-in Side Glance OSC desktop notification through
     `terminalSequence`.
   - Codex: report `[tui]` events/method/condition separately from top-level `notify`.
   - Gemini: report effective enablement/method and project override risk.
   - OpenCode: document its native `attention` configuration rather than duplicate it.
   - Aider: document `side-glance run -- aider --notifications` and preserve any custom
     notification command.
   - Generic: state clearly that only an opt-in process-exit notification is possible.
2. Add a separate, opt-in Side Glance OS notifier only when consistent branding,
   explicit session labels, or a selected sound is required. On macOS, call
   `/usr/bin/osascript` without a shell and pass bounded, sanitized arguments. On Linux,
   capability-detect a notification daemon and describe sound as best-effort.
3. Drive any shared notifier from accepted normalized events—`turn.completed`,
   `attention.waiting`, `turn.failed`, and `turn.cancelled`—before visual lease
   arbitration. Never notify on start, acknowledgement, or teardown; never let notifier
   failure fail provider state updates.
4. Suppress duplicate and stale events and test two concurrent session IDs whose visual
   ownership differs from event arrival order. Exactly-once behavior across process
   crashes would require an outbox; otherwise document the chosen best-effort boundary.
5. Use only provider name, normalized phase, and an explicit user label or privacy-safe
   short identifier. Do not display provider-generated session titles, cwd, prompt,
   assistant output, transcript, or tool details by default.

---

# Stale-lock recovery test reuses the refusal deadline

## Observations

- Final production PR #37 produced one failed `verify` job in GitHub Actions run
  `32782443112`, job `97607213689`; the sibling compatibility, native macOS, Vercel,
  and staging-head policy jobs passed.
- The exact failure was `Timed out waiting for Side Glance state lock after 40ms.` at
  `tests/integration/store.test.ts:168`, the recovery call after the fixture replaces a
  live owner PID with a guaranteed-dead PID.
- The focused test passed 50/50 sequential local child-process runs.
- The same unchanged focused test failed in the first round when 12 isolated child
  processes ran concurrently. The failed case took 394 ms and reported the same line
  and timeout as CI. Temporary directories are created with `mkdtemp`, so the children
  do not share lock paths.
- `acquireLock()` records `startedAt` before awaiting `currentProcessIdentity()`, then
  checks the 40 ms deadline before making its first `mkdir` attempt. An OS scheduling
  pause while resuming that await can therefore exhaust the deadline without one lock
  observation or reclaim attempt.
- The production default timeout is 5 seconds; this regression uses 40 ms to prove the
  live-owner refusal without slowing the suite.

## Hypotheses

### H1: The lock deadline includes pre-attempt identity/scheduler time (REJECTED)

- Supports: the timer starts before an await, the loop can be skipped entirely, the
  failure reproduces only under parallel load, and the recovery call fails at its
  first possible attempt.
- Conflicts: none; low-load runs resume inside 40 ms and pass.
- Test: move `startedAt` immediately after the identity await, changing one line of
  placement only, then rerun the 12-way/10-round reproduction.

### H2: The supposedly dead PID is reported alive on this platform

- Supports: an alive result would prevent reclamation until timeout.
- Conflicts: 50/50 sequential runs pass on the same platform and CI passed this exact
  test in earlier runs.
- Test: directly invoke the platform PID-zero probe and repeat the unchanged focused
  test sequentially.

### H3: Rewriting `owner.json` refreshes the lock directory mtime

- Supports: a fresh directory mtime would delay the stale-lock branch.
- Conflicts: overwriting an existing child file does not add or remove a directory
  entry, the first refusal already lasts at least 40 ms, and sequential recovery passes.
- Test: capture the directory mtime before and after overwriting the existing owner.

### H4: Parallel tests collide on the same lock directory

- Supports: cross-process interference could preserve a live owner.
- Conflicts: every test uses a unique `mkdtemp` directory and the failure reproduces in
  separate child processes with no shared fixture path.
- Test: print or assert uniqueness of the generated directories in the load harness.

### H5: The 40 ms refusal budget is also too small for proved-dead recovery (ROOT HYPOTHESIS)

- Supports: the failure is the second update; reclaim must stat, read, probe the PID,
  reread the nonce, remove the directory, and then retry acquisition. If that work
  crosses 40 ms, `continue` returns to the deadline precondition and can throw before
  the post-reclaim `mkdir`. The two final CI jobs ran the identical SHA three seconds
  apart: one passed this test in 69.70 ms and the other failed in 101.41 ms.
- Conflicts: none. The production default is already 5 seconds; only the test reuses
  the intentionally tiny live-owner refusal budget for the recovery half.
- Test: leave the 40 ms store unchanged for the live-owner rejection, then use a second
  store with the default lock timeout for the dead-owner recovery. Rerun the unchanged
  12-way/10-round concurrent-load harness.

## Experiments

- Planned H1 falsification: move only the deadline initialization below the process
  identity await. If the unchanged 120-run concurrent-load reproduction passes, H1 is
  confirmed; if it still fails, revert and test H2 next.
- H1 was rejected as sufficient: moving the timer below the identity await still failed
  under concurrent load in round 5, at the same second recovery call. The diagnostic
  source change was reverted.
- Planned H5 falsification: separate the refusal and recovery timeout budgets without
  changing production code. If 120 concurrent-load runs pass, the narrow recovery
  budget—not stale-owner proof logic—is confirmed as the flake source.
- H5 confirmed: the separated recovery budget passed 120/120 concurrent-load child
  runs. The diagnostic test edit was reverted before writing the final fix.

## Root Cause

The integration test reused a deliberately tiny 40 ms live-owner refusal deadline for
the separate dead-owner proof, removal, and reacquisition path, so normal CI scheduling
and filesystem variance could exhaust the test-only budget before recovery retried.

## Fix

Keep the 40 ms store only for asserting that a live owner is never reclaimed. After the
fixture replaces that owner with a guaranteed-dead PID, construct a second store with
the normal 5-second production timeout and retain the same stale-lock and post-recovery
assertions. This changes no product timeout or lock-safety semantics and makes the test
exercise each contract with an appropriate budget.

---

# Homebrew guided init loses the stable executable identity

## Observations

- The public `v0.1.0-beta.4` Homebrew formula installs successfully, reports the expected
  version, passes `brew test side-glance`, and exposes `/opt/homebrew/bin/side-glance` as
  a symlink to `../Cellar/side-glance/0.1.0-beta.4/bin/side-glance`.
- The canonical first-run command `side-glance init --providers claude --notifications
  none --dry-run --json --home <empty-home>` returns a `planning-failed` setup error.
- `side-glance doctor --json` for the same empty home reports supported Node and eligible
  Claude/Codex binaries, with absent but valid target configuration files.
- Repeating the same init command with only `--executable
  /opt/homebrew/bin/side-glance` added succeeds and produces a safe setup plan whose
  executable path is the stable Homebrew symlink.
- The CLI currently derives the default setup executable from `process.argv[1]`, which
  for a compiled standalone can be the resolved versioned Cellar payload rather than
  the stable path used to invoke it.

## Hypotheses

### H1: Standalone startup loses the Homebrew symlink invocation path (PRIMARY)

- Supports: the stable symlink is present on `PATH`; explicit selection of that exact
  path is the only change needed for setup planning to succeed; and the default is
  derived from the compiled process rather than recovered from `PATH`.
- Conflicts: none observed yet.
- Test: invoke a standalone through a Homebrew-shaped stable symlink and assert that bare
  guided init selects the stable path without `--executable`.

### H2: The empty temporary home is rejected by setup safety checks

- Supports: the failure occurs while producing a setup plan for an empty synthetic home.
- Conflicts: the identical home succeeds when only `--executable` is supplied, and doctor
  reports its target configuration paths as valid.
- Test: hold the home, provider, notification mode, and dry-run options constant while
  changing only `--executable`.

### H3: Claude discovery or capability eligibility prevents planning

- Supports: planning validates provider eligibility before generating mutations.
- Conflicts: doctor finds Claude, and the identical Claude selection succeeds with the
  explicit stable executable.
- Test: compare doctor output and the paired bare/explicit init commands for one home.

### H4: A stale beta or shadowed executable is running

- Supports: multiple distribution channels and an earlier beta were installed during the
  release sequence.
- Conflicts: `command -v`, `side-glance --version`, `brew info`, and the formula checksum
  all identify the freshly released Homebrew beta.4 artifact.
- Test: record the resolved command, reported version, formula URL, and installed Cellar
  path before reproducing.

## Experiments

- H2/H3 falsification: ran bare and explicit init against the same empty home with the
  same Claude and notification options. Bare failed; adding only the stable executable
  succeeded. H2 and H3 are rejected.
- H4 falsification: verified `/opt/homebrew/bin/side-glance`, beta.4 version output, the
  beta.4 formula URL/checksum, and the beta.4 Cellar target. H4 is rejected.
- Planned H1 falsification: add an observable regression test around a Homebrew-shaped
  symlink invocation before changing production code. A failure that selects the Cellar
  payload or cannot plan confirms the executable-identity boundary.
- H1 confirmed with a one-line diagnostic SEA: direct symlink invocation reports the
  stable absolute path in `process.argv[1]`, but bare `PATH` invocation reports only
  `side-glance`; `process.execPath` is the resolved Cellar payload in both cases.
- The new standalone distribution regression invokes `side-glance` by bare name through
  a Homebrew-shaped `PATH`. It fails red with `planning-failed`, matching the public
  beta.4 behavior exactly.

## Root Cause

Node SEA preserves a bare shell invocation as `process.argv[1] === "side-glance"` while
`process.execPath` resolves to the versioned Homebrew Cellar payload. Guided setup always
applied `path.resolve()` to `process.argv[1]`, so a bare invocation became a nonexistent
`<cwd>/side-glance` candidate. Setup then failed durable-executable validation before it
could produce a provider plan. Direct absolute invocation happened to work and concealed
the missing `PATH` recovery path in the original standalone smoke test.

## Fix Direction

When the reported standalone invocation is a bare command name, scan `PATH` for a
non-Cellar entry whose followed file identity matches the already-running executable,
then retain that stable invocation path. Preserve absolute and explicitly relative
invocations unchanged. If no identity match exists, fail closed through the existing
durable-executable validation rather than retaining an unrelated executable.

## Fix

Added a bounded invocation-path resolver for guided setup. Absolute and explicitly
relative paths retain their prior behavior. Bare command names are recovered only from
`PATH` entries whose followed executable identity matches `process.execPath`; versioned
Homebrew Cellar entries are skipped so the stable bin symlink is retained. A changed or
unrelated `PATH` shadow is never executed during resolution, and no match falls through
to existing validation failure. The unit identity test and the full standalone
Homebrew-shaped regression now pass.

The pre-commit security review found two additional fail-closed requirements. First,
returning `<cwd>/side-glance` after a failed scan could select an unrelated decoy, so
bare resolution now returns no default unless a candidate actually matches; explicit
`--executable` remains available, and otherwise setup fails through its existing safe
planning-error path. Second, the PATH candidate now matches the full target identity
(device, inode, mode, size, timestamps, and kind), not only device/inode. Red tests for
both a current-directory decoy and an in-place identity change now pass green alongside
the standalone regression.

---

# Installed Codex hooks succeed but the terminal does not change color

## Observations

- The installed executable is Side Glance `0.1.0-beta.9` at
  `/opt/homebrew/bin/side-glance`.
- `doctor --json` reports the Codex integration as installed and verified structurally:
  all five expected managed hooks are present in `~/.codex/hooks.json`, and the Codex
  binary is available.
- The previous hook error is gone, which is consistent with beta.9's managed-hook
  fail-open behavior when no terminal target is available.
- `doctor --json` explicitly reports Codex stable-surface support as
  `wrapper-required` and recommends `side-glance run -- codex`.
- Live state contains recent Codex sessions in working, waiting, completed, and inactive
  phases, proving that the hooks are reaching Side Glance and lifecycle state is being
  updated.
- None of the live Codex session records has a `target`. The only recorded surface is a
  prior owned TTY from a wrapper/diagnostic session; no Codex session owns a terminal
  surface that Side Glance may safely repaint.

## Hypotheses

### H1: Plain Codex hooks have no stable terminal identity (ROOT HYPOTHESIS)

- Supports: live Codex events are recorded without `target`; doctor says
  `wrapper-required`; managed hooks run with piped JSON rather than a controlling TTY;
  beta.9 intentionally acknowledges targetless hooks instead of raising the former
  Stop/UserPromptSubmit errors.
- Conflicts: none.
- Test: compare live Codex session records with wrapper-created records and inspect
  whether each has a verified target.

### H2: The Codex integration was not installed or is invoking an old binary

- Supports: missing colors can result from absent hooks or a stale executable.
- Conflicts: the executable reports beta.9, all expected hooks point to that durable
  executable, and fresh Codex lifecycle events are present.
- Test: inspect version, doctor output, installed hook commands, and live state.

### H3: Codex events are not reaching Side Glance

- Supports: no visible repaint could mean no lifecycle input.
- Conflicts: live state contains multiple recent Codex sessions and current waiting and
  completed phases.
- Test: inspect `side-glance status --json` after using Codex.

### H4: The terminal rejects Side Glance's background-color escape sequence

- Supports: terminal capability differences can prevent a valid paint.
- Conflicts: no Codex paint is attempted because the sessions have no target; capability
  behavior is downstream and cannot explain the missing target.
- Test: first attach Codex through the supported wrapper; only investigate OSC support
  if a targeted session still does not repaint.

## Experiments

- H2 rejected: version, doctor, and `~/.codex/hooks.json` all identify the installed
  beta.9 executable and the complete five-hook Codex integration.
- H3 rejected: live status contains recent Codex lifecycle transitions, including
  waiting and completed sessions.
- H1 confirmed: every inspected Codex session is targetless, while wrapper-created
  sessions include an owned `tty:/dev/ttys006` target. H4 is not yet in the execution
  path because Side Glance's safety invariant forbids writing terminal bytes without a
  verified owned character TTY.

## Root Cause

Codex launches hooks as subprocesses with JSON on standard input and does not give those
processes a reliable controlling-terminal identity. Beta.9 fixed the noisy failure by
accepting and recording managed targetless hooks, but it correctly does not guess which
of several terminals to repaint. A plain `codex` launch therefore provides lifecycle
state and native Codex notification readiness, but reliable terminal colors require the
supervised wrapper to attach the session to its originating TTY.

## Resolution

Launch Codex with `side-glance run --label "Codex" -- codex` when terminal colors are
wanted. If that targeted launch also fails to repaint, investigate the terminal's OSC
11 support as a separate capability issue. Making the bare `codex` command transparently
use the wrapper would require an explicit shell integration or launcher feature; that is
a product change, not evidence of a broken beta.9 installation.

---

# Plain Claude colors while plain Codex does not

## Observations

- `~/.claude/settings.json` still contains four groups from the personal
  `~/.claude/hooks/stoplight.sh` in addition to all nine Side Glance hook groups.
- The legacy script handles Claude `SessionStart`, `UserPromptSubmit`, `Stop`, and two
  `Notification` matchers. It walks up to twelve parent processes with `ps`, accepts the
  first TTY-shaped name it sees, and writes OSC background/title bytes directly to that
  device.
- Side Glance's installer intentionally preserves hook groups it does not own. Its
  doctor output therefore reports 14 existing Claude groups but only nine Side Glance
  hooks.
- `~/.codex/hooks.json` contains only the five Side Glance hook groups; there is no
  Codex equivalent of the legacy script.
- Live Side Glance state shows Claude sessions without targets as well as Codex sessions
  without targets. The visible behavior of plain Claude therefore is not evidence that
  Side Glance itself found Claude's terminal.
- The repository's safety contract forbids terminal writes until an owned character TTY
  is verified. The old script checks only a TTY-shaped ancestor value and writability,
  and it sources per-session shell state; those shortcuts are intentionally outside the
  Side Glance safety model.

## Hypotheses

### H1: The preserved legacy stoplight is painting plain Claude (ROOT HYPOTHESIS)

- Supports: its hook commands remain active for exactly the lifecycle events that change
  color; its code performs ancestor-TTY discovery and direct OSC writes; current Side
  Glance Claude records are targetless.
- Conflicts: none.
- Test: compare installed Claude/Codex hook groups and Side Glance targets without
  mutating either configuration.

### H2: Claude passes a terminal target that Codex omits

- Supports: provider hook implementations can expose different process environments.
- Conflicts: current Side Glance state records plain Claude sessions without targets,
  just like Codex.
- Test: inspect live state for `target` on both providers.

### H3: Side Glance has a Claude-only terminal output response

- Supports: Claude supports provider-specific hook output such as
  `terminalSequence`.
- Conflicts: Side Glance's current Claude hook output is silent and does not return a
  terminal sequence; the visible legacy script writes OSC directly instead.
- Test: inspect the adapter protocol and invoke the hook contract in isolation.

### H4: Codex's terminal emulator cannot display the configured colors

- Supports: terminal capability differences can affect OSC rendering.
- Conflicts: the same terminal renders colors when Codex is launched through the Side
  Glance wrapper, proving the emulator and palette work.
- Test: hold the terminal constant and compare `codex` with
  `side-glance run -- codex`.

## Experiments

- H2 rejected: both providers have targetless native records in live Side Glance state.
- H3 rejected: the documented and implemented Claude hook response is silent; the
  preserved script independently writes terminal bytes.
- H4 rejected: the user's wrapper reproduction succeeds in the same Codex terminal.
- H1 confirmed by configuration/code inspection: plain Claude invokes
  `stoplight.sh`, which discovers an ancestor TTY and paints it, while plain Codex has no
  comparable hook.

## Root Cause

Plain `claude` appears to work because the installer preserved the user's old
`stoplight.sh`, and that script uses a permissive parent-process TTY heuristic that Side
Glance does not currently implement; plain `codex` exposes the actual targetless Side
Glance behavior because it has no legacy painter alongside it.

## Product Implication

The wrapper requirement is a real zero-config adoption gap for new users, including new
Claude users without the personal legacy script. A robust improvement should attempt
bounded parent-process TTY discovery, validate the resolved device with Side Glance's
ownership and character-device checks, and fail open when lineage is ambiguous. It must
be proven independently for each provider and terminal topology rather than copying the
legacy script's writable-device heuristic or shell-sourced state.

---

# Feasibility review: zero-wrapper native provider launches

## Observations

- Desired journey: install once, then run the provider's unchanged command (`claude` or
  `codex`) and receive per-terminal lifecycle colors without remembering a Side Glance
  wrapper.
- Current target discovery accepts explicit wrapper identity, inherited tmux identity,
  or the result of `tty` using the hook's standard input. Provider hooks receive JSON on
  standard input, so that last path cannot identify their originating terminal.
- The terminal renderer already defends the final write with an absolute `/dev` path,
  no symlinks, character-device type, current-UID ownership, `O_NOFOLLOW`, and a
  before/after device-and-inode identity check.
- The old stoplight's success establishes that Claude CLI's hook remained a descendant
  of a process with a TTY in the observed macOS topology. It does not by itself prove
  the same invariant for Codex, Linux, tmux, SSH, provider updates, or detached hooks.
- A wrapper is mechanically strongest because it captures the TTY before the provider
  starts and passes an explicit identity. Shell aliases/shims can hide the wrapper but
  mutate command resolution and shell configuration. Provider-hook discovery preserves
  the original executables and normal commands but depends on process lineage.
- Codex desktop has no terminal surface to repaint; the zero-wrapper goal applies to
  provider CLIs running inside terminal emulators.

## Hypotheses

### H1: Bounded, validated parent-lineage discovery covers ordinary CLI hooks (ROOT HYPOTHESIS)

- Supports: stoplight already succeeds for Claude by this mechanism; hooks are normally
  child processes of the provider CLI; the existing renderer can validate the resulting
  device before any write.
- Conflicts: Codex has not yet been observed from inside a live hook, and providers may
  launch hooks through detached helpers whose ancestry no longer reaches the terminal.
- Test: capture PID/PPID/TTY metadata from real Claude and Codex CLI hook subprocesses
  without changing terminal state, then verify the first TTY-bearing ancestor matches
  the terminal that launched each CLI.

### H2: Inherited environment alone can identify the originating terminal

- Supports: tmux exports `TMUX`/`TMUX_PANE`; SSH commonly exports `SSH_TTY`; terminal
  emulators export session identifiers.
- Conflicts: ordinary macOS terminals do not provide a canonical `/dev` TTY path in a
  portable environment variable, and emulator session IDs are not writable devices.
- Test: compare bounded environment keys from wrapper-free native hooks across Terminal,
  iTerm2, tmux, and SSH without recording unrelated environment values.

### H3: A transparent shell shim is required for reliable normal-command behavior

- Supports: a shim captures the terminal before launching any provider and is equivalent
  to the proven supervised wrapper while preserving what the user types.
- Conflicts: installation becomes shell- and PATH-dependent, command replacement can
  surprise users, and stoplight demonstrates at least one provider can work at hook time.
- Test: enumerate supported shells/install locations and compare failure coverage with
  verified hook-time lineage discovery.

### H4: Provider-native hook output can route colors without discovering a device

- Supports: Claude supports a `terminalSequence` response emitted by its own terminal UI.
- Conflicts: Side Glance currently keeps Claude hook stdout silent; Codex expects a
  minimal JSON acknowledgement and has no established equivalent terminal-sequence
  channel, so this cannot yet provide one cross-provider design.
- Test: verify current provider contracts and safely probe whether each accepts an OSC
  background sequence without corrupting its UI protocol.

## Planned Experiments

- Run a no-source-change PTY fixture where a hook-like grandchild has all stdio piped;
  confirm whether bounded `ps` ancestry still resolves the launching PTY.
- Inspect real provider hook process contracts and local installed behavior; do not
  mutate user configuration during this review.
- Compare the candidate device against Side Glance's existing renderer validations and
  enumerate ambiguity/race cases before recommending production code.

## Experiments

- A controlled hook-shaped Node child was launched inside a real PTY with stdin, stdout,
  and stderr piped. `process.stdin.isTTY` and `process.stdout.isTTY` were both false, but
  `/bin/ps` reported the child and its parent on `ttys004`. The no-PTY control reported
  `??`. This confirms that fd-0-based `tty` can fail while process TTY metadata remains
  available, and that detached processes can fail closed.
- Read-only process inspection found four active Codex CLI processes on distinct
  `ttys000` through `ttys003`; their concrete `/dev/ttysNNN` devices are current-user
  owned character devices. Codex desktop/app-server processes reported `??`.
- A temporary additional Claude `UserPromptSubmit` diagnostic hook was run without
  changing user configuration. The hook shell reported TTY `??`, while its immediate
  parent `claude` process reported `ttys004`. This rejects a self-process-only solution
  for Claude and confirms that a bounded ancestor fallback reaches the correct terminal
  in a real plain-Claude hook.
- Current upstream Codex hook-runner source pipes all three standard streams but does not
  detach or create a new session. Current provider documentation confirms that hook JSON
  contains no terminal identity. Claude's `terminalSequence` is race-free for its
  allowlisted notifications, titles, and BEL, but rejects OSC palette/background
  sequences such as OSC 11. H2 and H4 are therefore rejected as cross-provider color
  solutions.
- H3 is not required for normal local CLI launches: process metadata supplies a viable
  target in the controlled and live provider topologies. A transparent shim remains a
  possible deterministic fallback, but its PATH/shell mutation cost is unnecessary for
  the primary journey.

## Conclusion

H1 is confirmed for the tested macOS Claude and Codex CLI topologies: ordinary commands
can support Side Glance colors by consulting bounded process TTY metadata, while the
current failure is specifically caused by consulting only fd 0 through `tty`. The
implementation must prefer explicit wrapper and tmux identities, query the current
process and then a bounded ancestor chain with an absolute non-shell `ps`, accept only a
single canonical TTY token, and retain the renderer's ownership, character-device,
nofollow, and identity-race checks. Missing, malformed, detached, desktop, or ambiguous
lineage must remain targetless and fail open.

## Rollout Constraint

This capability must not silently activate for already-installed hooks on binary upgrade.
Existing Claude users can have a preserved legacy painter; current Claude documentation
says matching hooks run in parallel, so legacy Stoplight and auto-discovering Side Glance
would race as last writers. A new install/init plan should explicitly enable direct
discovery, detect exact known Stoplight color hooks, and offer a reviewed backup-backed
migration or skip Side Glance for that provider. Existing beta.9 hook commands should
remain unchanged until the user reruns setup and accepts that plan.
