# Signal

Signal is a local-first attention layer for coding-agent CLIs. It turns working, waiting, ready, failed, and inactive lifecycle events into a calm terminal or tmux signal without allowing stale hooks or one session's cleanup to overwrite another.

It is the tested successor to a personal `stoplight.sh`: one typed controller, one private state store, thin provider adapters, and a universal supervised wrapper.

## What is proven

- Claude Code, Codex, and Gemini hook installers merge configuration transactionally and preserve unrelated handlers. Codex's existing `notify` configuration is separate and untouched.
- OpenCode and Aider have normalized adapter contracts; every executable can use `signal run -- <command>` as the baseline.
- Delayed generations, older timestamps, mismatched turn IDs, and duplicate event IDs cannot repaint newer state.
- Shared surfaces have one deterministic owner. Releasing one session reveals the next owner; final release resets only Signal-owned state.
- TTY targets must be owned character devices. tmux options are captured and restored exactly; pane sessions use tmux status instead of a whole-client background wash.
- Prompt, response, and transcript content are not part of the protocol or persisted state.

## Try it from source

Node.js 24 or newer is required. This repository is private and the package is not published.

```bash
npm install
npm link
signal doctor --json
signal run -- claude
```

The wrapper automatically discovers the controlling TTY and passes a stable surface identity to native hooks. Explicit targets remain available for automation:

```bash
signal run --surface test:demo -- your-command
```

Native setup is intentionally a separate action because it edits provider configuration:

```bash
signal install claude --json
signal install codex --json
signal uninstall claude --json
```

Do not install over the existing `stoplight.sh` setup until you have reviewed `signal doctor --json` and chosen a migration window.

## Recovery contract

Normal `SessionEnd`, child exit, `SIGINT`, `SIGTERM`, `SIGHUP`, and manual reset paths release through the serialized controller. No software can synchronously clean up after every component receives `SIGKILL`, after power loss, or after the terminal emulator disappears. Signal bounds those cases with ownership reconciliation on the next affected event and explicit recovery:

```bash
signal reset --all --json
```

OSC 111 restores the terminal's configured default background; terminals do not expose a portable way to recover an arbitrary dynamic OSC 11 value. Title mutation remains opt-in.

## Development

The CLI and interactive site share the same phase and palette model. The required gates are:

```bash
npm run test:unit
npm run test:integration
npm run test:coverage
npm run lint
npm run typecheck
npm run build
npm test
```

See [SPEC.md](./SPEC.md), [PLAN.md](./PLAN.md), [architecture](./docs/architecture.md), [adapter protocol](./docs/adapter-protocol.md), and the [edge-case audit](./docs/edge-case-audit.md).

## Status

Pre-release. The implementation and interactive site are complete locally and tracked in a draft pull request. Live provider installation, package publication, and site deployment remain explicit approval gates.

## License

MIT
