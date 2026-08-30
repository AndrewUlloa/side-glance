# Side Glance

Side Glance is a local-first attention layer for coding-agent CLIs. It turns working, waiting, ready, failed, and inactive lifecycle events into a calm terminal or tmux status layer without allowing stale hooks or one session's cleanup to overwrite another.

Side Glance originated at Design From, Inc. and is maintained by Andrew Ulloa as an Apache-2.0 open-source project.

It is the tested successor to a personal `stoplight.sh`: one typed controller, one private state store, thin provider adapters, and a universal supervised wrapper.

## What is proven

- Claude Code and Codex are locally contract-audited. Gemini, OpenCode v1, and Aider remain experimental until their live binary matrices pass. Setup previews every owned change and preserves unrelated settings.
- Claude tracks bounded `SubagentStart`/`SubagentStop` identities plus current background-task and session-cron snapshots. Known work keeps the parent Working; a later parent `Stop` must report no known work before Ready. Claude/Codex `Stop` and Gemini `AfterAgent` remain pre-final hooks and do not ring a misleading final Ready alert while another provider hook can still block or retry.
- OpenCode support targets the stable v1 plugin API and fails closed for the incompatible `opencode2` beta. Aider uses only its documented static notification command paired with the wrapper.
- Opt-in macOS and Linux desktop alerts follow the provider-specific event coverage below. macOS supports a requested installed sound name; Linux sound is best-effort, and neither path claims audible delivery without a live test.
- Delayed generations, older timestamps, mismatched turn IDs, and duplicate event IDs cannot repaint newer state.
- Shared surfaces have one deterministic owner. Releasing one session reveals the next owner; final release resets only Side Glance-owned state.
- TTY targets must be owned character devices. tmux options are captured and restored exactly, with phase-specific non-color markers. `--terminal-title` is an explicit, phase-only fallback for direct terminals.
- Prompt, response, and transcript content are not part of the protocol or persisted state.

## Installation status

The verified public site is [sideglance.dev](https://sideglance.dev). Cloudflare
provides authoritative DNS, DNSSEC, TLS, and proxying in front of the Vercel
deployment; `www.sideglance.dev` redirects to the canonical apex. The
[Vercel deployment](https://side-glance.vercel.app) remains the fallback alias.
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

Package upgrades do not rewrite provider hooks. Existing users should rerun
`side-glance init` once after upgrading so normal provider commands receive the
latest safe integration; `side-glance doctor --json` reports `rerun-init` when an
otherwise-installed hook still needs that refresh.

The Homebrew formula installs the corresponding standalone archive from the
immutable GitHub release. Direct archive downloads remain available there; verify
the matching release, provenance, and `SHA256SUMS` before using one manually.

## Guided setup

`side-glance init` detects supported providers without executing them and presents
a concise read-only review of the selected providers, notification choices,
warnings, and owned configuration paths. It writes nothing until the whole plan is
confirmed, then tells you what to run next. `side-glance setup`
is its exact alias; both are safe to re-run. On an interactive terminal,
**Recommended** is focused first. For a new configuration, **Recommended** uses
Status without an additional theme question; rerunning setup preserves an existing
saved theme. **Customize** includes providers, notifications, and colors, using the
same Status, Heat, and Custom selector as `side-glance theme`. The selected color
behavior appears in Review and the completion summary before it applies to the next
lifecycle event. On a safely inspectable zsh setup, Recommended also adds one
reviewed managed block to `.zshrc` so a new direct local terminal tab resets an
inherited Side Glance background before its first prompt.

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
side-glance setup --providers claude,codex --notifications none --fresh-tabs --yes --json
```

After setup, just run `claude`, `codex`, or the experimental `gemini` integration
as usual and start prompting:

```bash
claude
codex
gemini
```

For supported local CLI launches, Side Glance can recover the originating terminal
from tmux identity or bounded process ancestry, then paint only after the canonical
path passes its owned character TTY checks. Direct discovery is supported, not
guaranteed. Desktop and detached sessions have no trustworthy local terminal and
remain targetless; hooks still acknowledge lifecycle events without painting the
wrong window. Use `side-glance run` as the explicit fallback when discovery is not
available, or when you want a private label or process-exit notification:

```bash
side-glance run --label "Codex" -- codex
```

### Fresh terminal tabs

Terminal.app can copy the active tab's effective dynamic background when Cmd-T
opens another tab. That new shell does not belong to the existing agent, so guided
setup recommends a reversible zsh startup reset. The final Review names `.zshrc`
and its action before anything changes. The managed block emits only OSC 111 and
only for an interactive, top-level, direct local shell; tmux, SSH, nested shells,
redirected output, and unsupported shells are skipped.

Automation preserves the existing state unless the choice is explicit. Use
`--fresh-tabs` to install or repair the exact block and `--no-fresh-tabs` to remove
only that block. Existing shell content is bounded, backed up, written atomically,
verified, and restored with the provider plan after a caught setup failure. A
malformed or duplicated ownership marker blocks the change instead of guessing.

Advanced commands remain available for one-provider changes and diagnosis:

```bash
side-glance doctor --json
side-glance install claude --json
side-glance uninstall claude --json
side-glance run -- your-coding-cli
```

## Colors and the sliding completion ceiling

**Status** is the default theme: Working is cyan, Waiting is amber, Ready is
green, Failed is red, and Inactive is neutral. A successful long turn remains
green; red means failure. tmux also keeps the distinct `●`, `!`, `✓`, and `×`
markers, so color is never the only state signal.

Run `side-glance theme` for the same Up/Down and Enter experience as setup. Choose
**Heat** only when you want successful completions to move from green through
amber to red based on duration, or choose **Custom** for one validated wash/accent
pair per lifecycle state. Automation and recovery are explicit:

```bash
side-glance theme show --json
side-glance theme set status --yes --json
side-glance theme set heat --ceiling adaptive --yes --json
side-glance theme set heat --ceiling 300 --yes --json
side-glance theme reset --yes --json
side-glance preview --phase completed --elapsed 300 --source claude --json
```

Saved colors reach an already-open terminal on its next lifecycle event; Side
Glance does not repaint a terminal merely because the config file changed.

Adaptive Heat learns separately for each provider from the newest 12 eligible
completed turns between one second and eight hours. It stays at a five-minute
cold ceiling through seven samples, then recalculates after every eligible turn
using the nearest-rank p80 × 1.5, bounded from one minute to two hours. Each update
can rise by at most the larger of 20% or 30 seconds, or fall by at most the larger
of 10% or 15 seconds. Heat keeps Ready turns under 10 seconds visually quiet. The
turn that teaches the ceiling still uses the prior value; the next turn sees the
slide. One outlier cannot set the ceiling, and a retried completion cannot train
the same semantic turn twice. The adaptive profile stores duration numbers and
a bounded turn identity only—never prompts, commands, responses, paths, or
transcripts. `doctor --json`
reports an invalid color configuration while runtime rendering safely falls back
to Status. `side-glance theme show --json` exposes each provider's current sample
count and learned ceiling so the adaptive behavior is inspectable.
`preview --source <provider>` uses that provider's learned adaptive ceiling and
reports its basis; without a source, adaptive Heat is explicitly a 300-second
cold-start hypothetical.

For Claude, known subagent work delays Ready. Side Glance stores only bounded work
kind/ID pairs and treats missing or malformed background registries as unknown,
not empty. Resume and compact session starts preserve known work; a child
stopping cannot create Ready on its own. Claude still exposes
no post-aggregate hook proving every parallel hook accepted a Stop, so Ready
remains the best-known state rather than an absolute completion guarantee.

## Try it from source

Repository development uses Node.js 24.18.0.

```bash
npm ci
npm run build:cli
node packages/cli/dist/side-glance.mjs doctor --json
node packages/cli/dist/side-glance.mjs run -- claude
```

For a durable installation from a checkout, use `npm install --global ./packages/cli` after building. Provider hooks must never point at `npx` or an npm cache path.

The wrapper fallback discovers the controlling TTY before starting the provider and
passes that stable identity to native hooks. Explicit targets remain available for
automation:

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

If recognized legacy `stoplight.sh` color hooks are active, guided init offers to
replace them or keep them and skip Claude. The replacement is explicit, creates a
backup, and preserves unrelated Claude hooks. For an automated one-provider
migration, review `side-glance doctor --json`, then run:

```bash
side-glance install claude --migrate-legacy-stoplight --json
```

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

For several sessions in macOS Terminal, iTerm, Ghostty, or another terminal, plain
provider commands remain the primary path. Use the wrapper only when you want a
private label. The label appears in the notification body; without one, Side Glance
uses a distinct, privacy-safe session digest:

```bash
side-glance run --label "API worker" -- claude
side-glance run --label "Web worker" --notification-sound Hero -- claude
```

Aider exposes a static notification callback, so pair its bridge with the wrapper:

```bash
side-glance run --label "Aider worker" -- aider --notifications \
  --notifications-command 'side-glance notify --source aider --kind completed --json'
```

Claude, Codex, and Gemini do not expose a post-aggregate hook proving every
parallel completion decision committed. Claude's known subagent/background work
now delays Ready; provider-native alerts or process exit remain the stronger
boundary when an absolute one-shot completion signal is required:

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
claude
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

A power loss or `SIGKILL` between separate configuration-file renames can leave setup
partial. The next `side-glance init` or `side-glance doctor` reports that state so
the idempotent setup can repair it; Side Glance does not retain a secret crash
journal of provider configuration.

OSC 111 restores the terminal's configured default background; terminals do not expose a portable way to recover an arbitrary dynamic OSC 11 value. Terminal.app OSC 11 remains manually unverified, so `doctor` warns and `--terminal-title` offers an opt-in phase-only fallback. Title mutation is disabled by default. The fresh-tab startup reset addresses inherited appearance only; it does not promise that every terminal emulator copies or resets dynamic colors identically.

## Development

The CLI and interactive site share the same phase and palette model. The Next.js
application deploys to Vercel, while substantial public media is delivered from
Cloudflare R2. Cloudflare supplies automatic aggregate real-user monitoring for
`sideglance.dev`; Vercel records page views and three bounded, non-content intent events.
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
gate every release. The verified public site is `https://sideglance.dev`. Gemini,
OpenCode v1, and Aider remain experimental until their live provider matrices are
signed off.

## License

Apache-2.0
