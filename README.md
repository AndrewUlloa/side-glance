<div align="center">

<h1>Side Glance</h1>

<p><strong>See when coding agents are working, waiting, ready, or failed—without watching every terminal.</strong></p>

<p>Turn local Claude Code, Codex, Gemini, OpenCode, and Aider lifecycle events<br>
into a calm terminal or tmux status layer.</p>

<a href="https://www.npmjs.com/package/side-glance"><img alt="npm beta version" src="https://img.shields.io/npm/v/side-glance/beta?style=flat-square"></a>
<a href="https://www.npmjs.com/package/side-glance"><img alt="npm downloads" src="https://img.shields.io/npm/dw/side-glance?style=flat-square"></a>
<a href="https://github.com/AndrewUlloa/side-glance/releases/latest"><img alt="GitHub release" src="https://img.shields.io/github/v/release/AndrewUlloa/side-glance?style=flat-square&include_prereleases"></a>
<a href="https://github.com/AndrewUlloa/side-glance/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/AndrewUlloa/side-glance?style=flat-square"></a>
<a href="https://github.com/AndrewUlloa/side-glance/blob/main/LICENSE"><img alt="Apache 2.0 license" src="https://img.shields.io/npm/l/side-glance?style=flat-square"></a>

</div>

[Quick start](#quick-start) · [Lifecycle](#lifecycle-at-a-glance) · [Providers](#providers) · [Safety](#security-privacy-and-recovery) · [Documentation](#documentation) · [Releases](https://github.com/AndrewUlloa/side-glance/releases)

Install with Homebrew, then run the guided setup:

```bash
# Apple Silicon macOS or glibc Linux; Intel macOS is experimental
brew install AndrewUlloa/tap/side-glance
side-glance init
```

Side Glance originated at Design From, Inc. and is maintained by Andrew Ulloa as
an Apache-2.0 open-source project.

## Choose your workflow

| You want to… | Preview or inspect | Run it |
|---|---|---|
| Configure detected coding agents | `side-glance setup --dry-run` | `side-glance init` |
| Check provider and terminal readiness | `side-glance doctor --json` | `side-glance doctor --json` |
| Choose lifecycle colors | `side-glance theme show --json` | `side-glance theme` |
| Preview a lifecycle state | `side-glance preview --phase completed --elapsed 300 --source claude --json` | — |
| Supervise an unusual or detached launch | — | `side-glance run --label "Codex" -- codex` |
| Recover Side Glance-owned appearance | — | `side-glance reset --all --json` |

## Requirements

- The npm CLI requires Node.js 22 or newer. The Homebrew formula installs a
  standalone build.
- macOS and glibc-based Linux are supported during the beta. Windows and
  musl/Alpine are not supported yet; Intel macOS is experimental.
- A provider is available to setup only when its CLI command is executable on
  the `PATH` of the shell running setup. Its account or desktop app may still be usable
  when that command is absent, but the app alone cannot receive terminal lifecycle
  integration.
- A local terminal with an owned character TTY is required for painting. tmux is
  optional. Desktop-only and detached sessions remain safely targetless.

## Quick start

### 1. Install the beta

Side Glance is available as a beta package. Prereleases are published on npm's
explicit `beta` channel. Source commits are not releases: a version becomes
installable only after its matching protected-tag workflow completes.

Homebrew is the recommended durable installation:

```bash
brew install AndrewUlloa/tap/side-glance
side-glance init
```

For public discovery or a guided trial, use the temporary package runner:

```bash
npx side-glance@beta init
```

The runner performs read-only discovery, then either hands off to an existing
durable executable or asks before installing the exact beta. It never writes an
npm-cache path into provider hooks. Use `npx side-glance@latest init` only after
the stable package owns npm's `latest` tag.

Global npm is the durable fallback:

```bash
npm install --global side-glance@beta
side-glance init
side-glance --version
```

The Homebrew formula installs the matching standalone archive from the immutable
GitHub release. Direct downloads are available from
[Releases](https://github.com/AndrewUlloa/side-glance/releases); verify the release,
provenance, and `SHA256SUMS` before using one manually.

### 2. Review guided setup

`side-glance init` detects providers without executing them and shows one concise,
read-only review of selected providers, notification choices, warnings, owned
configuration paths, and colors before it writes anything. `side-glance setup` is
its exact alias, and both commands are safe to rerun.

Use Up/Down to move, Space to toggle multiple choices, and Enter to continue.
Set `SIDE_GLANCE_ACCESSIBLE=1` for a static numbered prompt; `NO_COLOR` and
`TERM=dumb` select the same no-ANSI fallback. Non-TTY input is noninteractive and
requires explicit automation flags.

**Recommended** uses **Status** without an additional color question for a new
configuration. **Customize** lets you choose providers, notifications, and colors.
Rerunning setup preserves an existing saved theme.

Preview an automated setup before approving the same explicit plan:

```bash
side-glance setup --dry-run
side-glance setup --providers claude,codex --notifications none --fresh-tabs --yes --json
```

### 3. Start your coding agent normally

After setup, normally run `claude`, `codex`, or the experimental `gemini` as
usual:

```bash
claude
codex
gemini
```

For supported local launches, Side Glance recovers the originating terminal from
tmux identity or bounded process ancestry, then paints only after the canonical
path passes its owned character TTY checks. Direct discovery is supported, not
guaranteed. Desktop and detached sessions have no trustworthy local terminal and
remain targetless instead of painting the wrong window.

`side-glance run` is the explicit fallback when discovery is unavailable or when
you want a private notification label or process-exit notification:

```bash
side-glance run --label "Codex" -- codex
```

Package upgrades do not rewrite provider hooks. Rerun `side-glance init` once
after upgrading; `side-glance doctor --json` reports `rerun-init` when an installed
integration needs that refresh.

## Lifecycle at a glance

The default **Status** theme uses color and a distinct tmux marker for every phase:

Status uses Working cyan, Waiting amber, Ready green, Failed red, and Inactive
neutral.

| Phase | Default color | tmux marker | Meaning |
|---|---|---:|---|
| Inactive | neutral | — | No owned active lifecycle state |
| Working | cyan | `●` | The agent is processing |
| Waiting | amber | `!` | The agent needs attention |
| Ready | green | `✓` | The best-known work is complete |
| Failed | red | `×` | The provider or supervised process failed |

A successful long turn remains green; red means failure. Color is never the only
state signal. Saved colors reach an open terminal on its next lifecycle event;
changing configuration does not repaint a terminal by itself.

## Why Side Glance

| Capability | What it gives you |
|---|---|
| Local-first lifecycle | Hooks become terminal or tmux state without a hosted relay. |
| Direct provider launch | Keep using the normal `claude`, `codex`, or `gemini` command when safe discovery works. |
| Deterministic ownership | One session owns a shared surface at a time; releasing it reveals the next owner. |
| Stale-event protection | Older generations, timestamps, turn IDs, and duplicate event IDs cannot repaint newer work. |
| Reviewed setup | See every owned path and choice before a provider configuration changes. |
| Reversible integration | Uninstall and reset remove only Side Glance-owned state. |
| Accessible states | tmux markers and a no-ANSI setup mode keep meaning independent of color. |
| Private by design | Prompt, response, and transcript content are neither protocol fields nor persisted state. |

Side Glance is the tested successor to a personal `stoplight.sh`: one typed
controller, one private state store, thin provider adapters, and a universal
supervised wrapper.

## Providers

Claude Code and Codex are locally contract-audited. Gemini, OpenCode v1, and Aider remain experimental
until their live binary matrices pass.

| Provider | Lifecycle integration | Notification coverage | Status |
|---|---|---|---|
| Claude Code | Native hooks; known subagent and background work delays Ready | Claude reports attention and failure; its pre-final Ready event stays silent. | Contract-audited |
| Codex | Native hooks with safe terminal discovery | Codex and Gemini report attention; their pre-final Ready events stay silent. | Contract-audited |
| Gemini | Native hooks with safe terminal discovery | Codex and Gemini report attention; their pre-final Ready events stay silent. | Experimental |
| OpenCode v1 | Stable v1 plugin API; incompatible `opencode2` beta fails closed | OpenCode v1 reports Ready, attention, and failure. | Experimental |
| Aider | Documented static notification command paired with the wrapper | Completion bridge only; existing notification commands are preserved. | Experimental |
| Any CLI | Supervised wrapper | The generic wrapper reports only process exit when `--notify-on-exit` is selected. | Supported fallback |

Claude tracks bounded `SubagentStart` and `SubagentStop` identities plus current
background-task and session-cron snapshots. Known subagent work keeps the parent
Working and delays Ready. Missing or malformed registries mean unknown, not empty;
a child stopping cannot create Ready on its own.

Claude and Codex `Stop` plus Gemini `AfterAgent` remain pre-final hooks. They do
not trigger a misleading final Ready notification while another provider hook can
still block or retry. Provider-native alerts or supervised process exit remain the
stronger boundary when an absolute one-shot completion signal is required.

## Commands

| Command | Behavior |
|---|---|
| `side-glance init` | Discover providers and guide one reviewed multi-provider setup. |
| `side-glance setup` | Exact alias for `init`. |
| `side-glance doctor --json` | Inspect binaries, provider contracts, installed hooks, terminal targeting, overrides, and live-verification status. |
| `side-glance theme` | Interactively choose Status, Heat, or Custom colors. |
| `side-glance theme show --json` | Inspect the saved theme and provider-specific adaptive ceilings. |
| `side-glance preview ... --json` | Resolve a lifecycle appearance without painting a terminal. |
| `side-glance run -- <command>` | Supervise a CLI with a stable target when direct discovery is unavailable. |
| `side-glance install <provider> --json` | Install or update one provider integration directly. |
| `side-glance uninstall <provider> --json` | Remove only the owned integration for one provider. |
| `side-glance status --json` | Read the current reduced lifecycle state without painting. |
| `side-glance reset --all --json` | Release leases and restore Side Glance-owned appearance state. |
| `side-glance notify ... --json` | Run the bounded notification bridge used by integrations such as Aider. |

`event` and `hook` are managed provider entry points, not manual setup commands.

Run `side-glance --help` or a subcommand's help for the complete options.

### Command behavior

| Command | Files or terminal state | Network or process effects |
|---|---|---|
| `init` / `setup` | May update selected provider configuration and one reviewed fresh-tab `.zshrc` block after confirmation | Detects provider executables without running them |
| `setup --dry-run` | No writes | No provider process is started |
| `doctor --json` | Read-only | Inspects local commands and configuration; does not claim a live notification test |
| `theme` | Writes Side Glance's private theme configuration after confirmation | Open terminals update on their next lifecycle event |
| `preview ... --json` | Read-only | Resolves output without painting a terminal |
| `run -- <command>` | Owns and restores the verified terminal surface for the supervised session | Starts the requested command; `--notify-on-exit` can send one process-exit alert |
| `install` / `uninstall` | Changes only the selected provider's owned integration while preserving unrelated settings | Does not launch the provider |
| `reset` | Releases selected leases and restores only Side Glance-owned appearance state | Does not stop provider processes |

## Themes

Run `side-glance theme` for the same Up/Down and Enter interaction as setup:

- **Status** is the default semantic palette shown above.
- **Heat** maps successful completion duration from green through amber to red.
- **Custom** accepts one validated wash/accent pair per lifecycle state.

```bash
side-glance theme show --json
side-glance theme set status --yes --json
side-glance theme set heat --ceiling adaptive --yes --json
side-glance theme set heat --ceiling 300 --yes --json
side-glance theme reset --yes --json
side-glance preview --phase completed --elapsed 300 --source claude --json
```

Adaptive Heat learns separately for each provider from the newest 12 eligible
completed turns between one second and eight hours. It keeps a five-minute cold
ceiling through seven samples, then uses nearest-rank p80 × 1.5 within a one-minute
to two-hour bound. A rise is limited to the larger of 20% or 30 seconds; a fall is
limited to the larger of 10% or 15 seconds. Ready turns under 10 seconds stay
visually quiet.

The turn that teaches the ceiling uses the prior value. A retried semantic turn
cannot train twice. The profile stores only bounded turn identity and duration—not
prompts, commands, responses, paths, or transcripts. Invalid theme configuration
falls back to Status and remains visible in `doctor --json`.

## Setup behavior

On a safely inspectable zsh setup, Recommended reviews and installs one managed
`.zshrc` block that resets a Terminal.app background inherited by a fresh Cmd-T
tab. The block emits only OSC 111 and only for an interactive, top-level, direct
local shell. It skips tmux, SSH, nested shells, redirected output, and unsupported
shells.

Automation preserves the existing fresh-tab choice unless you pass
`--fresh-tabs` or `--no-fresh-tabs`. Existing shell content is bounded, backed up,
written atomically, verified, and included in caught-failure rollback. Malformed or
duplicated ownership markers stop the change instead of inviting a guess.

Direct one-provider setup remains available:

```bash
side-glance install claude --json
side-glance install codex --json
side-glance install gemini --json # experimental
side-glance uninstall claude --json
```

If guided setup finds a recognized legacy `stoplight.sh` hook, it offers to replace
it or keep it and skip Claude. The replacement is explicit, backup-backed, and
preserves unrelated Claude hooks. For automation:

```bash
side-glance install claude --migrate-legacy-stoplight --json
```

### Uninstall

Remove managed provider integrations before removing the executable. Run only the
provider commands that apply to your setup:

```bash
side-glance uninstall claude --json
side-glance uninstall codex --json
side-glance uninstall gemini --json
side-glance uninstall opencode --json
side-glance reset --all --json

# Then remove the package installed by one of these methods:
brew uninstall side-glance
npm uninstall --global side-glance
```

Uninstall preserves unrelated provider hooks and shell configuration. To remove
the optional managed fresh-tab block as part of a retained installation, rerun
setup with `--no-fresh-tabs` before removing the executable.

## Desktop notifications and sound

Provider-native and Side Glance notifications are separate channels. When native
notifications are ready, Side Glance defaults off and warns about duplicate alerts.
When the native notification state is unknown, Side Glance defaults off and
explains the uncertainty. It defaults on only when native alerts are disabled and
the OS backend is available. An explicit undeliverable automation choice fails
before configuration changes.

macOS uses the installed sound name `Glass` by default and accepts another bounded
installed name. Linux sound is best-effort. Setup does not fire a test notification,
and configuration alone is not proof that the computer played a sound.

```bash
side-glance install claude --notifications --notification-sound Glass --json
side-glance install codex --notifications --notification-sound Glass --json
side-glance install gemini --notifications --notification-sound Glass --json
side-glance install opencode --notifications --notification-sound Glass --json
```

For several sessions, use the normal provider commands. Add a private label only
when the wrapper is useful; without one, notifications use a distinct privacy-safe
session digest:

```bash
side-glance run --label "API worker" -- claude
side-glance run --label "Web worker" --notification-sound Hero -- claude
side-glance run --label "Release build" --notify-on-exit -- your-command
```

Aider exposes a static notification callback, so pair it with the wrapper:

```bash
side-glance run --label "Aider worker" -- aider --notifications \
  --notifications-command 'side-glance notify --source aider --kind completed --json'
```

## Security, privacy, and recovery

The Side Glance CLI does not operate a hosted service or collect telemetry. Its
protocol and state exclude prompt, response, and transcript content.

- State is typed JSON; it is never sourced or evaluated as shell code.
- Terminal bytes are written only after the target is verified as an owned
  character TTY.
- Delayed generations, older timestamps, mismatched turn IDs, and duplicate event
  IDs cannot repaint newer state.
- Releasing one session removes only its lease and recomputes the shared surface
  from the remaining leases.
- Setup preserves unrelated provider hooks and notification commands. Owned files
  are backed up, written atomically, and verified before completion.
- Title mutation is opt-in. `--terminal-title` is a phase-only fallback for direct
  terminals.

If a caught multi-provider failure occurs, setup rolls back applied providers in
reverse order only while their files still match what that setup wrote. A newer
external edit produces a rollback conflict instead of being overwritten.

Normal `SessionEnd`, child exit, `SIGINT`, `SIGTERM`, `SIGHUP`, and manual reset
paths release through the serialized controller. A power loss or `SIGKILL` between
configuration-file renames can leave setup partial; the next `side-glance init` or
`side-glance doctor` reports it so idempotent setup can repair it.

No software can synchronously clean up after every component receives `SIGKILL`,
after power loss, or after the terminal emulator disappears. Side Glance bounds
those cases with ownership reconciliation on the next affected event and explicit
recovery:

```bash
side-glance reset --all --json
```

OSC 111 restores the terminal's configured default background, not an unknowable
prior dynamic OSC 11 value. Terminal.app OSC 11 remains manually unverified, so
`doctor` warns and offers the opt-in title fallback.

Report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/AndrewUlloa/side-glance/security/advisories/new).
Read the [security policy](https://github.com/AndrewUlloa/side-glance/blob/main/SECURITY.md)
before reporting.

## Troubleshooting

- Run `side-glance doctor --json` first for redacted provider, hook, target, and
  notification diagnostics.
- If setup says a provider is not found, expose its CLI command to the current
  shell's `PATH` and rerun `side-glance init`.
- If a normal provider launch cannot discover its terminal, use
  `side-glance run -- <command>` as the explicit fallback.
- After a package upgrade, rerun `side-glance init` to refresh owned hooks.
- If appearance survives an interrupted session, run
  `side-glance reset --all --json`.
- Notification settings, Focus, and sound availability can suppress macOS alerts;
  installed configuration is not proof of audible delivery.

Use [GitHub Discussions](https://github.com/AndrewUlloa/side-glance/discussions) for
setup questions and the issue templates for reproducible bugs or feature proposals.
Never include prompts, transcripts, access tokens, or unredacted provider
configuration in a report.

## Try it from source

Repository development uses Node.js 24.18.0:

```bash
git clone https://github.com/AndrewUlloa/side-glance.git
cd side-glance
npm ci
npm run build:cli
node packages/cli/dist/side-glance.mjs doctor --json
node packages/cli/dist/side-glance.mjs run -- claude
```

For a durable installation from a checkout, build first, then run:

```bash
npm install --global ./packages/cli
```

Provider hooks must never point at `npx` or an npm cache path.

## Documentation

- [Product specification](https://github.com/AndrewUlloa/side-glance/blob/main/SPEC.md)
- [Implementation plan](https://github.com/AndrewUlloa/side-glance/blob/main/PLAN.md)
- [Architecture](https://github.com/AndrewUlloa/side-glance/blob/main/docs/architecture.md)
- [Adapter protocol](https://github.com/AndrewUlloa/side-glance/blob/main/docs/adapter-protocol.md)
- [Edge-case audit](https://github.com/AndrewUlloa/side-glance/blob/main/docs/edge-case-audit.md)
- [CI/CD runbook](https://github.com/AndrewUlloa/side-glance/blob/main/docs/cicd.md)
- [Release process](https://github.com/AndrewUlloa/side-glance/blob/main/docs/releasing.md)
- [Public-asset runbook](https://github.com/AndrewUlloa/side-glance/blob/main/docs/assets.md)
- [Changelog](https://github.com/AndrewUlloa/side-glance/blob/main/CHANGELOG.md)
- [Contributing](https://github.com/AndrewUlloa/side-glance/blob/main/CONTRIBUTING.md)
- [Support](https://github.com/AndrewUlloa/side-glance/blob/main/SUPPORT.md)
- [Security policy](https://github.com/AndrewUlloa/side-glance/blob/main/SECURITY.md)

## Development

The CLI and interactive site share the same lifecycle phases and palette. The
Next.js application deploys to Vercel; substantial public media is delivered from
Cloudflare R2, and privacy-first traffic measurement uses Cloudflare Web Analytics.

Run the repository gates with Node.js 24.18.0:

```bash
npm run test:unit
npm run test:integration
npm run test:coverage
npm run lint
npm run typecheck
npm run build
npm test
```

## Project

- [Website](https://sideglance.dev)
- [Source](https://github.com/AndrewUlloa/side-glance)
- [Issues](https://github.com/AndrewUlloa/side-glance/issues)
- [Discussions](https://github.com/AndrewUlloa/side-glance/discussions)
- [npm](https://www.npmjs.com/package/side-glance)
- [Releases](https://github.com/AndrewUlloa/side-glance/releases)
- [Apache 2.0 license](https://github.com/AndrewUlloa/side-glance/blob/main/LICENSE)

Public beta. Protected branch and tag rules gate every release. The verified public
site is [sideglance.dev](https://sideglance.dev). Gemini, OpenCode v1, and Aider
remain experimental until their live provider matrices are signed off.

## License

Apache-2.0
