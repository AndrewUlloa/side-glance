# side-glance

Side Glance is a local-first attention layer for coding-agent CLIs. It turns
working, waiting, ready, failed, and inactive lifecycle events into a calm terminal
or tmux status layer while protecting newer work from delayed hooks.

The npm CLI requires Node.js 22 or newer. macOS and glibc-based Linux are supported during the beta; Windows and musl/Alpine are not supported yet. The public npm `beta` tag currently resolves to `0.1.0-beta.1`; this README describes the unreleased beta.3 candidate in the repository.

```bash
# Durable installation
npm install --global side-glance@beta
side-glance doctor --json
side-glance run -- claude
```

Use `npx side-glance@beta doctor --json` or
`npx side-glance@beta preview --phase waiting --json` for evaluation. Side Glance
deliberately refuses permanent provider installation from `npx` because npm's
ephemeral cache is not a durable lifecycle-hook location.

After a global or standalone installation, native hook setup is explicit and creates backups before changing existing configuration:

```bash
side-glance install claude --json
side-glance install codex --json
side-glance install gemini --json # experimental
side-glance uninstall claude --json
side-glance reset --all --json
```

Desktop notifications are a separate opt-in. Side Glance defaults to the macOS
`Glass` sound, accepts another installed sound name, and treats Linux sound as
best-effort:

```bash
side-glance install claude --notifications --notification-sound Glass --json
side-glance install gemini --notifications --json
side-glance install opencode --notifications --json # stable OpenCode v1 only
side-glance run --label "API worker" -- claude
```

Claude/Codex `Stop` and Gemini `AfterAgent` are pre-final provider hooks. They can
paint Ready, but Side Glance does not ring a final Ready notification because a
different hook may still block or retry. Provider-native completion alerts may be
kept enabled; `run --notify-on-exit` is available when process exit is the desired
completion boundary.

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

Side Glance never stores prompts, responses, or transcripts. No software can
synchronously clean up after every component is killed or power is lost; Side
Glance reconciles owned state on the next event and provides explicit reset recovery.

See the [project repository](https://github.com/AndrewUlloa/side-glance) for
standalone downloads, the architecture, supported providers, terminal limitations,
security policy, and release attestations.
