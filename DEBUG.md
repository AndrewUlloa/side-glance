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
