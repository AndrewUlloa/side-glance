# Side Glance

Side Glance is a local-first attention layer for coding-agent CLIs. It turns working, waiting, ready, failed, and inactive lifecycle events into a calm terminal or tmux status layer without allowing stale hooks or one session's cleanup to overwrite another.

It is the tested successor to a personal `stoplight.sh`: one typed controller, one private state store, thin provider adapters, and a universal supervised wrapper.

## What is proven

- Claude Code and Codex are locally contract-audited. Gemini, OpenCode v1, and Aider remain experimental until their live binary matrices pass. Setup previews every owned change and preserves unrelated settings.
- Claude/Codex `Stop` and Gemini `AfterAgent` are pre-final hooks: they can paint the best-known Ready state, but do not ring a misleading final Ready alert while another provider hook can still block or retry.
- OpenCode support targets the stable v1 plugin API and fails closed for the incompatible `opencode2` beta. Aider uses only its documented static notification command paired with the wrapper.
- Opt-in macOS and Linux desktop alerts follow the provider-specific event coverage below. macOS supports a requested installed sound name; Linux sound is best-effort, and neither path claims audible delivery without a live test.
- Delayed generations, older timestamps, mismatched turn IDs, and duplicate event IDs cannot repaint newer state.
- Shared surfaces have one deterministic owner. Releasing one session reveals the next owner; final release resets only Side Glance-owned state.
- TTY targets must be owned character devices. tmux options are captured and restored exactly, with phase-specific non-color markers. `--terminal-title` is an explicit, phase-only fallback for direct terminals.
- Prompt, response, and transcript content are not part of the protocol or persisted state.

## Installation status

The verified public site is the [Vercel deployment](https://side-glance.vercel.app).
`sideglance.ai` is only a future custom-domain option and does not currently resolve.
Side Glance is available as a beta package. Prereleases are published on npm's
explicit `beta` channel. Source commits are not releases: a version becomes
installable only after its matching protected-tag workflow completes. Confirm the
resolved version from npm before installing it.

The recommended installed path is Homebrew followed by guided setup:

```bash
# Apple Silicon macOS or glibc Linux; Intel macOS is experimental
brew install AndrewUlloa/tap/side-glance
side-glance init
```

During the beta, the public discovery and bootstrap path is:

```bash
npx side-glance@beta init
```

Use `npx side-glance@latest init` only after the stable package owns npm's
`latest` tag. The temporary npx runner performs read-only discovery, then either
hands off to an exact-version durable executable or asks before installing one. It
never writes its npm-cache path into provider hooks.

Global npm remains the durable fallback. Pin the beta channel, then run the same
setup:

```bash
npm install --global side-glance@beta
side-glance init
side-glance --version
```

The Homebrew formula installs the corresponding standalone archive from the
immutable GitHub release. Direct archive downloads remain available there; verify
the matching release, provenance, and `SHA256SUMS` before using one manually.

## Guided setup

`side-glance init` detects supported providers without executing them and presents
a concise read-only review of the selected providers, notification choices,
warnings, and owned configuration paths. It writes nothing until the whole plan is
confirmed, then finishes with the launch command to run next. `side-glance setup`
is its exact alias; both are safe to re-run. On an interactive terminal,
**Recommended** is focused first; choose **Customize** to reveal provider and
computer-notification choices.

Side Glance considers a provider available only when its CLI command (`claude`,
`codex`, `gemini`, or `opencode`) is executable on the `PATH` of the shell running
setup. “Not found” refers only to that CLI command; the provider account or desktop
app may still be usable. A desktop app does not count unless it exposes its CLI to
that shell. Install or expose the command, then rerun `side-glance init`.

Use Up/Down to move, Space to toggle multiple choices, and Enter to continue.
Set `SIDE_GLANCE_ACCESSIBLE=1` for the static numbered prompt; `NO_COLOR`,
and `TERM=dumb` use that same no-ANSI fallback automatically. Non-TTY input stays
non-interactive and requires the explicit automation flags shown below.

For automation, start with:

```bash
side-glance setup --dry-run
side-glance setup --providers claude,codex --notifications none --yes --json
```

Provider hooks supply lifecycle events, but they do not identify which Terminal.app,
iTerm, Ghostty, or tmux surface should change color. Launch each interactive session
through the wrapper to supply that stable surface identity:

```bash
side-glance run --label "Claude" -- claude
side-glance run --label "Codex" -- codex
```

Advanced commands remain available for one-provider changes and diagnosis:

```bash
side-glance doctor --json
side-glance install claude --json
side-glance uninstall claude --json
side-glance run -- your-coding-cli
```

## Try it from source

Repository development uses Node.js 24.18.0.

```bash
npm ci
npm run build:cli
node packages/cli/dist/side-glance.mjs doctor --json
node packages/cli/dist/side-glance.mjs run -- claude
```

For a durable installation from a checkout, use `npm install --global ./packages/cli` after building. Provider hooks must never point at `npx` or an npm cache path.

The wrapper automatically discovers the controlling TTY and passes a stable surface identity to native hooks. Explicit targets remain available for automation:

```bash
side-glance run --surface test:demo -- your-command
side-glance run --terminal-title -- claude
```

Direct native setup is still available when a guided multi-provider plan is not wanted:

```bash
side-glance install claude --json
side-glance install codex --json
side-glance install gemini --json # experimental
side-glance uninstall claude --json
```

Do not install over the existing `stoplight.sh` setup until you have reviewed `side-glance doctor --json` and chosen a migration window.

## Desktop notifications and sound

Setup treats provider-native and Side Glance notifications as separate channels.
When provider-native notifications are ready, Side Glance defaults off and warns
about duplicate alerts. When the native notification state is unknown, Side Glance
defaults off and explains the uncertainty. When native notifications are disabled
or not configured, Side Glance defaults on only if its OS backend is available. An
unavailable backend defaults off; an unsupported platform makes the option
unselectable. Explicit automation choices that cannot be delivered fail before any
configuration changes.

Coverage is provider-specific:

- Claude reports attention and failure; its pre-final Ready event stays silent.
- Codex and Gemini report attention; their pre-final Ready events stay silent, and
  Side Glance does not claim a final failure/completion signal for those hooks.
- OpenCode v1 experimentally reports Ready, attention, and failure.
- Aider completion needs an explicit static bridge. Setup never overwrites an
  existing Aider notification command; it prints conflict-aware manual guidance.
- The generic wrapper reports only process exit when `--notify-on-exit` is selected.

macOS uses the installed sound name `Glass` by default and accepts another bounded
safe name. Linux sound is best-effort. Setup does not fire a test notification, and
configuration alone is not proof that the computer played a sound.

```bash
side-glance install claude --notifications --notification-sound Glass --json
side-glance install codex --notifications --notification-sound Glass --json
side-glance install gemini --notifications --notification-sound Glass --json
side-glance install opencode --notifications --notification-sound Glass --json
```

For OpenCode colors without Side Glance alerts, install the v1 plugin without
`--notifications`, then launch it through the wrapper so piped plugin events inherit
a stable surface:

```bash
side-glance install opencode --json
side-glance run -- opencode
```

For several sessions in macOS Terminal, iTerm, Ghostty, or another terminal, wrap
each with a private label. The label appears in the notification body; without one,
Side Glance uses a distinct, privacy-safe session digest:

```bash
side-glance run --label "API worker" -- claude
side-glance run --label "Web worker" --notification-sound Hero -- claude
```

Aider exposes a static notification callback, so pair its bridge with the wrapper:

```bash
side-glance run --label "Aider worker" -- aider --notifications \
  --notifications-command 'side-glance notify --source aider --kind completed --json'
```

Claude, Codex, and Gemini do not expose a post-aggregate completion event. Keep
provider-native completion alerts enabled, or use process exit as the truthful
boundary for a one-shot command:

```bash
side-glance run --label "Release build" --notify-on-exit -- your-command
```

`side-glance doctor --json` reports binary presence, provider-native alerts, adapter
contract, installed integration, stable-surface requirement, environment overrides,
and live-verification status separately. It never treats configuration as audible
verification. On macOS, Notifications settings and Focus can suppress delivery or
sound; notification clicks are not guaranteed to select the originating terminal,
tab, or tmux pane.

## Smoke test and recovery

Use a temporary or deliberately chosen provider first. Preview, apply, supervise one
session, inspect, then remove only the Side Glance-owned entry:

```bash
side-glance setup --providers claude --notifications none --dry-run
side-glance setup --providers claude --notifications none --yes
side-glance run --label "Side Glance smoke" -- claude
side-glance doctor --json
side-glance uninstall claude --json
side-glance reset --all --json
```

If a caught multi-provider write or verification failure occurs, setup rolls back
already-applied providers in reverse order, but only while their files still match
what that setup wrote. It reports a rollback conflict instead of overwriting a newer
external edit.

Normal `SessionEnd`, child exit, `SIGINT`, `SIGTERM`, `SIGHUP`, and manual reset paths release through the serialized controller. No software can synchronously clean up after every component receives `SIGKILL`, after power loss, or after the terminal emulator disappears. Side Glance bounds those cases with ownership reconciliation on the next affected event and explicit recovery:

```bash
side-glance reset --all --json
```

A power loss or `SIGKILL` between separate provider-file renames can leave setup
partial. The next `side-glance init` or `side-glance doctor` reports that state so
the idempotent setup can repair it; Side Glance does not retain a secret crash
journal of provider configuration.

OSC 111 restores the terminal's configured default background; terminals do not expose a portable way to recover an arbitrary dynamic OSC 11 value. Terminal.app OSC 11 remains manually unverified, so `doctor` warns and `--terminal-title` offers an opt-in phase-only fallback. Title mutation is disabled by default.

## Development

The CLI and interactive site share the same phase and palette model. The Next.js
application deploys to Vercel, while substantial public media is delivered from
Cloudflare R2 and privacy-first traffic measurement uses Cloudflare Web Analytics.
There is no Cloudflare Worker, vinext, or Wrangler compatibility build. The
required gates are:

```bash
npm run test:unit
npm run test:integration
npm run test:coverage
npm run lint
npm run typecheck
npm run build
npm test
```

See [SPEC.md](./SPEC.md), [PLAN.md](./PLAN.md), [the CI/CD runbook](./docs/cicd.md),
[the public-asset runbook](./docs/assets.md),
[architecture](./docs/architecture.md), [adapter protocol](./docs/adapter-protocol.md),
and the [edge-case audit](./docs/edge-case-audit.md).

## Status

Public beta. The GitHub repository is public and protected branch/tag rulesets
gate every release. The verified public site remains the Vercel hostname until a
custom domain is configured. Gemini, OpenCode v1, and Aider remain experimental
until their live provider matrices are signed off.

## License

Apache-2.0
