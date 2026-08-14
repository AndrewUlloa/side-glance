# Contributing to Side Glance

Thank you for helping improve Side Glance. Contributions should preserve its local-first, non-destructive safety model.

## Development setup

Use Node.js 24.18.0 for repository development. The published JavaScript CLI supports Node.js 22.0 or newer.

```bash
npm ci
npm run build:cli
node packages/cli/dist/side-glance.mjs doctor --json
```

## Change process

1. Open or reference an issue for behavior changes.
2. Add a focused failing test and record the failure.
3. Implement the smallest complete behavior that satisfies the test and specification.
4. Run the repository gates.
5. Explain lifecycle, configuration, compatibility, or recovery implications in the pull request.

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm test
```

Never point tests at a real home directory or mutate live Claude, Codex, Gemini, tmux, or terminal configuration. Installer tests must use a temporary home. Do not add prompt, response, transcript, or secret content to Side Glance's protocol, state, fixtures, or logs.

By participating, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Security issues follow [SECURITY.md](./SECURITY.md), not the public issue tracker.
