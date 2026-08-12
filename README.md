# Signal

Signal is a local-first attention layer for coding-agent CLIs. It turns lifecycle events such as working, waiting, ready, and failed into a calm terminal/tmux signal without allowing stale hooks or one session's cleanup to overwrite another.

The project is currently being built with strict red-green TDD. The specification and implementation sequence are available in [SPEC.md](./SPEC.md) and [PLAN.md](./PLAN.md).

## Product principles

- One typed controller owns shared terminal state.
- Every coding CLI can use the supervised-wrapper and event-protocol baseline.
- Claude Code, Codex, Gemini CLI, OpenCode, and Aider adapters add only the fidelity their native events support.
- Old generations cannot repaint newer work.
- Cleanup releases only Signal-owned state and never promises recovery that the operating system or terminal cannot provide.
- Prompt and transcript content remain private and are never persisted by default.

## Development

Node.js 24 or newer is required.

```bash
npm install
npm run dev
```

Before a change is accepted:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

The CLI and interactive site are developed together so the site demonstrates the same state model that ships in the package.

## Status

Pre-release. Do not install this over an existing `stoplight.sh` setup yet. Live Claude/Codex configuration mutation and public package publication remain explicit approval gates.

## License

MIT
