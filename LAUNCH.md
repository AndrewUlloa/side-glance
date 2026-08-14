# Launch and rollback

Side Glance is a release candidate. This change renames source and local release
contracts only; it does not rename a remote repository or Vercel project, promote a
deployment, publish a package, create a tag, update a Homebrew tap, or migrate live
provider configuration.

## Renamed deployment status

- No Side Glance deployment has been created or promoted by this change.
- The application keeps the standard Next.js/Vercel build contract.
- After the external project is renamed or recreated, deploy an unaliased candidate,
  run the browser matrix, and promote that exact verified candidate.
- Record the new public URL, deployment identity, source commit, and known-good
  rollback identity here only after those actions succeed.

Deployment rollback is intentionally unset until a renamed candidate exists.

## Local rename verification

On 2026-08-14, the renamed npm package, standalone archive, Homebrew formula,
release policy, CLI migration paths, site, and rendered output passed their focused
and aggregate tests on Node 24.18.0. A production build through Next.js's supported
webpack path passed and the local production server passed desktop and 390×844
mobile layout, keyboard focus, copy/replay interaction, reduced motion, console,
network, and overflow checks.

The current host prevents Turbopack's PostCSS helper from binding its internal local
port, so the unflagged `npm run build` attempt stops at that host restriction even
outside the filesystem sandbox. Re-run the canonical build in CI before any remote
deployment; do not treat the local webpack substitute as publication approval.

## Vercel Preview annotation tooling

Agentation remains enabled for local Next.js development and Vercel Preview or
development environments, and disabled for production or unknown environments. No
endpoint, MCP mutation, or remote sync is configured. Any future preview containing
the toolbar must remain unpromoted; discarding that preview is its rollback path.

## Technical preflight

1. Use Node 24.18.0 and run every repository gate from [CONTRIBUTING.md](./CONTRIBUTING.md).
2. Confirm the exact npm tarball installs under Node 22.14 and 24.18 CI jobs.
3. Confirm all four native runners extract and execute their final archives; Intel macOS remains experimental.
4. Confirm the release manifest, SHA-256 checksums, npm SHA-512 integrity, formula generation, and action-pin policy pass.
5. Browser-check desktop/mobile, keyboard, reduced motion, console, network behavior, and release-candidate copy against the production site build.
6. Confirm the source commit is clean, merged through protected `main`, and eligible for a protected annotated version tag.

## External publication gates

Follow [docs/releasing.md](./docs/releasing.md). Publication remains blocked until the repository owner explicitly approves and completes:

- public repository visibility plus private vulnerability reporting;
- required reviewers on the existing `github-release` and `npm-release` environments;
- first npm package ownership and trusted-publisher binding;
- an immutable GitHub prerelease from the exact tested artifacts;
- a separate Homebrew tap pull request after those artifact URLs exist.

## Controlled migration from stoplight.sh

1. Save the existing hook configuration and locate every reference to `stoplight.sh`.
2. Install Side Glance durably for one provider in a chosen terminal session.
3. Exercise working, waiting, completion, failure, normal exit, and `SIGINT` paths.
4. Confirm unrelated hooks and Codex notification behavior still run.
5. Remove old hook entries only after the Side Glance trial passes.

Side Glance's installer creates a timestamped backup before changing an existing provider hooks file. It does not remove `stoplight.sh` automatically.

## Rollback

```bash
side-glance reset --all --json
side-glance uninstall claude --json
side-glance uninstall codex --json
```

If manual recovery is required, restore the installer's `.side-glance-backup-*` file after preserving the current file for diagnosis. OSC 111 restores the configured terminal background default. Existing tmux local and inherited options are restored by the controller; if the terminal has disappeared, start a new terminal and run reset before retrying.
