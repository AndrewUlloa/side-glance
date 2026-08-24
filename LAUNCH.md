# Launch and rollback

Side Glance is a beta. Version `0.1.0-beta.3` is the release candidate for the
desktop-notification work integrated on `staging`. Preparing this candidate does
not create a version tag or GitHub Release, publish to npm, update a Homebrew tap,
or migrate live provider configuration.

## Production deployment status

- Current public URL: <https://side-glance.vercel.app> (HTTP 200 verified 2026-08-24)
- Custom apex status: not configured; DNS does not resolve for `sideglance.ai`
- Vercel project: `andrew-243s-projects/side-glance`
- Project ID: `prj_WAlUcwR41N6Uw93yC8kDT2mUiVQ5`
- Production deployment: `dpl_877rCZQP8w1VVbcRTPNqVMjqT9xM`
- Immutable deployment URL: <https://side-glance-llhw4t004-andrew-243s-projects.vercel.app>
- Source commit: `53cf9429a6af669063d9611b9a4b791358d066c3`
- The canonical Vercel `npm run build` path passed on Node 24 and the public URL
  returned HTTP 200 with Side Glance metadata and rendered copy.
- Vercel's Git integration creates previews for pull-request commits; the recorded
  Production deployment's source commit is the head of `main`.
- No custom apex has replaced the verified Vercel project alias yet.

The Next.js application remains on Vercel. Large site images are stored in the
`side-glance-assets-prod` Cloudflare R2 bucket and use immutable, content-addressed
keys. The verified current origin is
`https://pub-5e783841ee13416ab2ffa0db4d732b63.r2.dev`; all six manifest objects
returned HTTP 200 with the declared content type, length, and immutable cache header
on 2026-08-24. `assets.sideglance.ai` is not connected and must remain conditional.
See [the public-asset runbook](./docs/assets.md) for the cutover contract.

The prior known-good production deployment is
`dpl_12hgQd7peRczGnDuY4diahzdsbWE`. It remains Vercel rollback evidence; immutable
historical deployment identifiers are not rewritten during a product rename.

## npm beta release candidate

- Candidate: `side-glance@0.1.0-beta.3`
- Channel: `beta`
- Status: unpublished; pending protected `main` promotion and matching annotated tag
- Previously published: `side-glance@0.1.0-beta.1`
- Unpublished attempt: the protected `v0.1.0-beta.2` workflow stopped at its npm
  dry-run; no npm package or GitHub Release was published.
- Previous integrity: `sha512-xW2t4IJEwDHRgh3uMi4FhXP9zhYCEdcvefCHVrXesWMfaOlMzx+QEgLfkaaHJkGvR0boC5bZnZq0dEwDax9szw==`
- The candidate tarball must contain only `LICENSE`, `README.md`,
  `dist/side-glance.mjs`, and `package.json`.

## Local rename verification

On 2026-08-14, the renamed npm package, standalone archive, Homebrew formula,
release policy, CLI migration paths, site, and rendered output passed their focused
and aggregate tests on Node 24.18.0. A production build through Next.js's supported
webpack path passed and the local production server passed desktop and 390×844
mobile layout, keyboard focus, copy/replay interaction, reduced motion, console,
network, and overflow checks.

The beta.2 source passed the canonical Turbopack build locally and in CI on Node
24.18.0. Beta.3 retains that product source and changes the release path. The
release-readiness remediation must repeat every local gate and protected CI must
pass before tagging. Turbopack has previously reported a non-blocking missing
fallback-override warning for Alan Sans; compilation, type checking, static
generation, and rendered HTML verification still completed successfully.

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

## Notification activation preflight

1. Run `side-glance doctor --json` and inspect every capability column; configured is not live-verified.
2. Choose one notification path per provider unless duplicate alerts are intentional. Install results warn when an active native path is detected.
3. Enable a trial provider with `side-glance install <provider> --notifications --notification-sound Glass --json`; do not point hooks at `npx`.
4. In Terminal.app, iTerm, Ghostty, or another terminal, launch each session through `side-glance run --label "<private label>" -- <provider>`; add `--terminal-title` only when the phase-only fallback is wanted.
5. For Aider, use its static callback through the supervised wrapper; for arbitrary one-shot commands, use only the truthful `run --notify-on-exit` path.
6. Manually verify terminal channels plus OS delivery and sound only in an approved migration window. Focus, notification preferences, Linux servers, and tmux prevent a universal delivery or click-to-pane guarantee.

## External publication gates

Follow [docs/releasing.md](./docs/releasing.md). The repository is public, its
release and branch protections are active, private vulnerability reporting and
secret scanning are enabled, and future GitHub Releases are immutable. The
remaining beta.3 gates are:

- merge this release through protected `staging` and `main`;
- create the matching protected annotated tag only after `main` is green;
- let the workflow stage every asset, publish npm, and then expose the immutable prerelease;
- open a separate Homebrew tap pull request after the immutable artifact URLs exist.

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
side-glance uninstall gemini --json
side-glance uninstall opencode --json
```

If manual recovery is required, restore the installer's `.side-glance-backup-*` file after preserving the current file for diagnosis. OSC 111 restores the configured terminal background default. Existing tmux local and inherited options are restored by the controller; if the terminal has disappeared, start a new terminal and run reset before retrying.
