# side-glance

Side Glance is a local-first attention layer for coding-agent CLIs. It turns
working, waiting, ready, failed, and inactive lifecycle events into a calm terminal
or tmux status layer while protecting newer work from delayed hooks.

The npm CLI requires Node.js 22 or newer. macOS and glibc-based Linux are
supported during the beta; Windows and musl/Alpine are not supported yet.
Prereleases use npm's explicit `beta` channel; confirm the installed build with
`side-glance --version`.

```bash
# Apple Silicon macOS or glibc Linux; Intel macOS is experimental
brew install AndrewUlloa/tap/side-glance
side-glance init
```

Global npm is the durable fallback during the beta:

```bash
npm install --global side-glance@beta
side-glance init
```

For public discovery or a guided trial, use:

```bash
npx side-glance@beta init
```

Use `npx side-glance@latest init` only after the stable package owns npm's
`latest` tag. The beta npx flow performs discovery and can ask to bootstrap an
exact-version durable install. Side Glance deliberately refuses permanent provider installation from `npx` because npm's ephemeral cache is not a durable lifecycle-hook location.

`side-glance init` shows a concise read-only review of the selected providers,
notification choices, warnings, and owned configuration paths before it asks for
one confirmation, then finishes with the launch command to run next.
`side-glance setup` is its exact alias and is safe to re-run. On an interactive
terminal, **Recommended** is focused first; choose **Customize** for provider and
notification controls.

Side Glance considers a provider available only when its CLI command (`claude`,
`codex`, `gemini`, or `opencode`) is executable on the `PATH` of the shell running
setup. “Not found” refers only to that CLI command; the provider account or desktop
app may still be usable. A desktop app does not count unless it exposes its CLI to
that shell. Install or expose the command, then rerun `side-glance init`.

Use Up/Down to move, Space to toggle multiple choices, and Enter to continue. Set
`SIDE_GLANCE_ACCESSIBLE=1` for static numbered prompts; `NO_COLOR`, `TERM=dumb`,
select that same no-ANSI fallback automatically. Non-TTY input stays
non-interactive and requires explicit automation flags. Setup does not edit shell
profiles or start a daemon.

Provider hooks supply lifecycle semantics, but they do not identify which
Terminal.app, iTerm, Ghostty, or tmux surface should receive colors. Use the wrapper
for that stable surface identity:

```bash
side-glance run --label "Claude" -- claude
side-glance run --label "Codex" -- codex
```

Preview and automation modes are explicit:

```bash
side-glance setup --dry-run
side-glance setup --providers claude,codex --notifications none --yes --json
```

Advanced one-provider install, uninstall, diagnosis, and supervision remain available:

```bash
side-glance doctor --json
side-glance install claude --json
side-glance install codex --json
side-glance install gemini --json # experimental
side-glance uninstall claude --json
side-glance run -- your-coding-cli
side-glance reset --all --json
```

## Lifecycle colors

**Status** is the default: Working is cyan, Waiting is amber, Ready is green,
Failed is red, and Inactive is neutral. Short and long successful turns therefore
share the same Ready green; red has one semantic meaning. tmux also renders
distinct `●`, `!`, `✓`, and `×` markers.

Use `side-glance theme` for an Up/Down and Enter selector. Optional **Heat** keeps
the earlier green-to-amber-to-red successful-completion ramp, while **Custom**
accepts one validated wash/accent pair per state.

```bash
side-glance theme show --json
side-glance theme set status --yes --json
side-glance theme set heat --ceiling adaptive --yes --json
side-glance theme set heat --ceiling 300 --yes --json
side-glance theme reset --yes --json
```

Existing terminals apply a saved theme on their next lifecycle event.

Adaptive Heat learns separately per provider from the newest 12 eligible
completed turns from one second to eight hours. It uses a five-minute cold start
through seven samples, then recalculates the nearest-rank p80 × 1.5 after every
eligible turn within a one-minute to two-hour ceiling. Each update can rise by at
most the larger of 20% or 30 seconds, or fall by at most the larger of 10% or 15
seconds. Heat keeps Ready turns under 10 seconds visually quiet. The current turn
uses the prior ceiling, and one semantic turn trains at most once. The adaptive
profile stores only duration metadata, not provider content. `side-glance theme
show --json` reports the current sample count and learned ceiling for each
provider. Invalid color configuration falls back to Status and is reported by
`doctor --json`. `side-glance preview --phase completed --elapsed 300 --source
claude --json` previews against Claude's learned ceiling and reports its basis;
omitting `--source` makes adaptive Heat an explicit 300-second cold-start
hypothetical.

Claude's managed integration also observes bounded subagent identities and
background-work snapshots. Known subagent work delays Ready, a child stop cannot
create Ready by itself, and missing registries are never treated as an empty
aggregate. Resume and compact starts preserve known work. Claude still has no
post-aggregate hook proving every parallel Stop
decision committed, so the result remains best-known.

## Computer notifications and sound

Setup treats provider-native notifications separately from Side Glance alerts.
When provider-native notifications are ready, Side Glance defaults off and warns
about duplicates. When the native notification state is unknown, Side Glance
defaults off and explains why. When native notifications are disabled or not
configured, Side Glance defaults on only when its OS backend is available. An
unavailable backend defaults off; an unsupported platform makes the choice
unselectable.

Notification coverage follows the event each provider actually exposes:

- Claude reports attention and failure; pre-final Ready remains silent.
- Codex and Gemini report attention; pre-final Ready remains silent, with no claimed
  final failure or completion bell.
- OpenCode v1 experimentally reports Ready, attention, and failure.
- Aider requires its explicit static completion bridge. Setup does not overwrite an
  existing Aider notification command and instead prints conflict-aware guidance.
- The generic wrapper reports only process exit with `--notify-on-exit`.

Side Glance defaults to the macOS installed sound name `Glass`, accepts another
bounded safe name, and treats Linux sound as best-effort. Setup does not send a real
notification, so run a live delivery test separately when you intend to enable it.

Advanced direct notification setup is available:

```bash
side-glance install claude --notifications --notification-sound Glass --json
side-glance install gemini --notifications --json
side-glance install opencode --notifications --json # stable OpenCode v1 only
side-glance run --label "API worker" -- claude
```

Claude/Codex `Stop` and Gemini `AfterAgent` are pre-final provider hooks. Known
Claude subagent/background work prevents Ready, but Side Glance still does not
ring a final Ready notification because a different parallel hook may block or
retry. Provider-native completion alerts may be kept enabled; `run
--notify-on-exit` is available when process exit is the desired boundary.

OpenCode v1 can install colors without Side Glance alerts. Its piped plugin process
needs the wrapper's stable surface identity:

```bash
side-glance install opencode --json
side-glance run -- opencode
```

For Aider, use its static callback through a supervised session:

```bash
side-glance run --label "Aider worker" -- aider --notifications \
  --notifications-command 'side-glance notify --source aider --kind completed --json'
```

The generic wrapper works with any executable:

```bash
side-glance run -- your-coding-cli
side-glance run --label "Release build" --notify-on-exit -- your-build
```

Generic supervision only knows process start and exit; it does not claim to know
when an interactive program has completed a turn. `doctor --json` reports Side
Glance binary, native-notification, adapter, integration, stable-surface, override,
and live-verification capabilities separately. Gemini readiness is scoped to its
user settings because higher-precedence configuration can override it; Codex's
default unfocused TUI alerts and arbitrary top-level `notify` command are identified
separately. Avoid enabling both paths unless duplicate alerts are intentional.
macOS Focus and Notifications settings may suppress sound, and clicking an alert
is not guaranteed to focus its originating terminal, tab, or tmux pane.

Terminal backgrounds are capability-dependent. tmux uses distinct phase markers;
for a direct terminal, `side-glance run --terminal-title -- <provider>` opts into a
sanitized phase-only title. `doctor` warns because Terminal.app OSC 11 has not yet
been manually verified.

## Smoke test and recovery

Preview and apply one provider, supervise a session, inspect it, then remove the
owned entry:

```bash
side-glance setup --providers claude --notifications none --dry-run
side-glance setup --providers claude --notifications none --yes
side-glance run --label "Side Glance smoke" -- claude
side-glance doctor --json
side-glance uninstall claude --json
side-glance reset --all --json
```

On a caught multi-provider write or verification failure, setup rolls back applied
providers in reverse order only while their files still match the setup write. A
newer external edit produces a rollback conflict and is not overwritten. A power
loss or `SIGKILL` between provider-file renames can still leave partial setup; the
next `side-glance init` or `side-glance doctor` reports the state for idempotent
repair. Side Glance does not store a secret configuration crash journal.

Side Glance never stores prompts, responses, or transcripts. Runtime state is
reconciled on the next event when synchronous cleanup is impossible, and
`side-glance reset --all --json` remains the explicit surface recovery command.

See the [project repository](https://github.com/AndrewUlloa/side-glance) for
standalone downloads, the architecture, supported providers, terminal limitations,
security policy, and release attestations.
