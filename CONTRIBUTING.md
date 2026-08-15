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

1. Update local `staging`, then create a `feature/*` branch from it.
2. Open or reference an issue for behavior changes.
3. Add a focused failing test and record the failure.
4. Implement the smallest complete behavior that satisfies the test and specification.
5. Run the repository gates.
6. Open a pull request from the feature branch into `staging`.
7. After the staging deployment is verified, promote with a `staging` → `main` pull request.

```bash
npm run lint
npm run lint:site:fix # format/fix the landing page only
npm run typecheck
npm run test:coverage
npm test
```

Never point tests at a real home directory or mutate live Claude, Codex, Gemini, tmux, or terminal configuration. Installer tests must use a temporary home. Do not add prompt, response, transcript, or secret content to Side Glance's protocol, state, fixtures, or logs.

Direct pushes to `main` and `staging` are blocked by the installed pre-push hook and
must also be blocked by the repository ruleset. See [the CI/CD runbook](./docs/cicd.md)
for branch protections, required checks, Vercel deployment behavior, and rollback.

By participating, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Security issues follow [SECURITY.md](./SECURITY.md), not the public issue tracker.
