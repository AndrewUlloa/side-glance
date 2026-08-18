# Side Glance

Side Glance is a local-first attention layer for coding-agent CLIs. It turns working, waiting, ready, failed, and inactive lifecycle events into a calm terminal or tmux status layer without allowing stale hooks or one session's cleanup to overwrite another.

It is the tested successor to a personal `stoplight.sh`: one typed controller, one private state store, thin provider adapters, and a universal supervised wrapper.

## What is proven

- Claude Code, Codex, and Gemini hook installers merge configuration transactionally and preserve unrelated handlers. Codex's existing `notify` configuration is separate and untouched.
- An owned OpenCode plugin and an Aider completion bridge add lifecycle events without changing either provider's native notification preferences.
- Opt-in macOS and Linux desktop notifications cover ready, attention, failure, and cancellation events. macOS supports a configurable installed sound; Linux sound is best-effort.
- Delayed generations, older timestamps, mismatched turn IDs, and duplicate event IDs cannot repaint newer state.
- Shared surfaces have one deterministic owner. Releasing one session reveals the next owner; final release resets only Side Glance-owned state.
- TTY targets must be owned character devices. tmux options are captured and restored exactly; pane sessions use tmux status instead of a whole-client background wash.
- Prompt, response, and transcript content are not part of the protocol or persisted state.

## Installation status

Side Glance is available as a beta package. Its canonical site is
[sideglance.ai](https://sideglance.ai); until registrar DNS activation completes,
use the [Vercel fallback](https://side-glance.vercel.app). The CLI prerelease is
published on npm's `beta` channel.

```bash
# Durable Node installation
npm install --global side-glance@beta

# Ephemeral diagnostics or preview only
npx side-glance@beta doctor --json
```

Standalone macOS and Linux archives will be attached to each GitHub Release. Homebrew is the preferred macOS path after the generated formula is accepted into the project tap.

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
```

Native setup is intentionally a separate action because it edits provider configuration:

```bash
side-glance install claude --json
side-glance install codex --json
side-glance uninstall claude --json
```

Do not install over the existing `stoplight.sh` setup until you have reviewed `side-glance doctor --json` and chosen a migration window.

## Desktop notifications and sound

Side Glance notifications are disabled by default. Enable them only on Side Glance-owned hooks, with an optional macOS sound name:

```bash
side-glance install claude --notifications --notification-sound Glass --json
side-glance install codex --notifications --notification-sound Glass --json
side-glance install gemini --notifications --notification-sound Glass --json
side-glance install opencode --notifications --notification-sound Glass --json
```

For several Claude sessions under iTerm, wrap each with a private label. The label appears in the notification body; without one, Side Glance uses a distinct, privacy-safe session digest:

```bash
side-glance run --label "API worker" -- claude
side-glance run --label "Web worker" --notification-sound Hero -- claude
```

Aider exposes a static notification callback, so pair its bridge with the wrapper:

```bash
side-glance run --label "Aider worker" -- aider --notifications \
  --notifications-command 'side-glance notify --source aider --kind completed --json'
```

For an arbitrary one-shot command, Side Glance can truthfully notify only when the process exits:

```bash
side-glance run --label "Release build" --notify-on-exit -- your-command
```

`side-glance doctor --json` reports the Side Glance OS backend separately from native Codex, OpenCode, and Aider notification readiness. Gemini readiness is explicitly scoped to the user settings file because workspace, system, environment, and CLI settings can override it. Installation also returns a warning when it detects an already-active native path; enabling both can produce duplicate alerts. A Codex top-level `notify` command is reported separately for inspection because it may perform something other than desktop notification delivery. On macOS, Notifications settings and Focus can suppress delivery or sound; notification clicks are not guaranteed to select the originating iTerm tab or tmux pane.

## Recovery contract

Normal `SessionEnd`, child exit, `SIGINT`, `SIGTERM`, `SIGHUP`, and manual reset paths release through the serialized controller. No software can synchronously clean up after every component receives `SIGKILL`, after power loss, or after the terminal emulator disappears. Side Glance bounds those cases with ownership reconciliation on the next affected event and explicit recovery:

```bash
side-glance reset --all --json
```

OSC 111 restores the terminal's configured default background; terminals do not expose a portable way to recover an arbitrary dynamic OSC 11 value. Title mutation remains opt-in.

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

Beta. The GitHub repository, Vercel project and production domain, npm package,
CLI, site, documentation, and local workspace identity use Side Glance. Public
GitHub visibility, repository security controls, immutable releases, protected
Vercel checks, and npm trusted publishing are active. The beta.2 protected-branch
promotion and tag, environment reviewers when a second release operator exists,
the Homebrew tap, and live provider migration remain explicit release gates.

## License

Apache-2.0
