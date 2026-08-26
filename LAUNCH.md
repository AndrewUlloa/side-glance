# Launch and rollback

Side Glance is a beta. Version `0.1.0-beta.6` is public on npm, GitHub Releases,
and the Homebrew tap. Semantic lifecycle colors, aggregate Claude readiness,
adaptive Heat, and user theme control are merged to protected `staging` and
prepared as the still-unpublished `0.1.0-beta.7` release candidate.

## Production deployment status

- Current public URL: <https://side-glance.vercel.app> (HTTP 200 verified 2026-08-24)
- Custom apex status: aliases are configured in Vercel, but public DNS does not
  resolve for `sideglance.ai` or `www.sideglance.ai` as of 2026-08-26
- Vercel project: `andrew-243s-projects/side-glance`
- Project ID: `prj_WAlUcwR41N6Uw93yC8kDT2mUiVQ5`
- Production deployment: `dpl_7i8HYGBsNfeVPFiYNyUURpUptMRh`
- Immutable deployment URL: <https://side-glance-r5nutd8bn-andrew-243s-projects.vercel.app>
- Current protected `main`: `759d92811f38fbc0e3df15eda3257599a42cf133`
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

## npm beta status and next candidate

- Current public release: `side-glance@0.1.0-beta.6`
- Prepared candidate: `side-glance@0.1.0-beta.7` (unused; not published)
- Channel: `beta`
- Status: beta.7 is prepared for protected review; until its tag workflow
  succeeds, `beta` points to beta.6 and `latest` remains beta.1
- Previously published: `side-glance@0.1.0-beta.5`, `side-glance@0.1.0-beta.4`,
  `side-glance@0.1.0-beta.3`, and `side-glance@0.1.0-beta.1`
- Unpublished attempt: the protected `v0.1.0-beta.2` workflow stopped at its npm
  dry-run; no npm package or GitHub Release was published.
- Current beta.6 integrity: `sha512-C+S/sIve3sizGocjYPai+c3wDADIt6OQavCiFsdgr6/MalTzWJKHjqLYAjI5aepFis+NSS2lpbzR70vhVkMbQg==`
- Every candidate tarball must contain only `LICENSE`, `README.md`,
  `dist/side-glance.mjs`, and `package.json`.

## Local rename verification

On 2026-08-14, the renamed npm package, standalone archive, Homebrew formula,
release policy, CLI migration paths, site, and rendered output passed their focused
and aggregate tests on Node 24.18.0. A production build through Next.js's supported
webpack path passed and the local production server passed desktop and 390×844
mobile layout, keyboard focus, copy/replay interaction, reduced motion, console,
network, and overflow checks.

Beta.6 passed the protected tag workflow and is public on npm and GitHub Releases;
its generated formula is the current Homebrew tap version. It adds progressive
arrow-key setup with a protected static fallback. The next release preparation must
repeat every local gate and protected CI must pass before tagging. Turbopack has
previously reported a non-blocking missing
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

The canonical installed smoke path is:

```bash
brew install AndrewUlloa/tap/side-glance
side-glance init
```

During the beta, `npx side-glance@beta init` is the public bootstrap/trial path.
The npx runner may discover and install with separate consent, but only an
exact-version durable executable may write provider hooks. `side-glance setup` is
the exact durable alias for `init`.

1. Review the read-only preview before confirming it; setup must not print unrelated configuration values.
2. Run `side-glance doctor --json` and inspect every capability column; configured is not live-verified.
3. Choose one notification path per provider unless duplicate alerts are intentional. When provider-native notifications are ready, Side Glance defaults off; when the native notification state is unknown, Side Glance also defaults off. Disabled/not-configured native delivery defaults Side Glance on only when its backend is available.
4. Confirm the promised coverage: Claude attention/failure with pre-final Ready silent; Codex and Gemini attention with pre-final Ready silent; experimental OpenCode v1 Ready/attention/failure; Aider only through an explicit conflict-aware static bridge; generic wrapper process exit only.
5. For an advanced one-provider trial, use `side-glance install <provider> --notifications --notification-sound Glass --json`; never point hooks at `npx`.
6. In Terminal.app, iTerm, Ghostty, or another terminal, launch each session through `side-glance run --label "<private label>" -- <provider>`; hooks provide lifecycle semantics, while the wrapper provides the stable surface identity used for colors.
7. Manually verify terminal channels plus OS delivery and sound only in an approved migration window. Focus, notification preferences, Linux servers, and tmux prevent a universal delivery or click-to-pane guarantee.

## Guided setup smoke and rollback

Use a deliberately chosen provider and keep the initial preview read-only:

```bash
side-glance setup --providers claude --notifications none --dry-run
side-glance setup --providers claude --notifications none --yes
side-glance run --label "Side Glance smoke" -- claude
side-glance doctor --json
side-glance uninstall claude --json
side-glance reset --all --json
```

Setup rolls back caught multi-provider apply or verification failures in reverse
order only while each target still matches its setup write. A concurrent edit is a
rollback conflict and is preserved. A power loss or `SIGKILL` between distinct
provider-file renames can leave partial setup; the next `side-glance init` or
`side-glance doctor` reports it for idempotent repair. No secret configuration crash
journal is retained.

## External publication gates

Follow [docs/releasing.md](./docs/releasing.md). The repository is public, its
release and branch protections are active, private vulnerability reporting and
secret scanning are enabled, and future GitHub Releases are immutable. The
remaining beta.7 gates are:

- semantic-lifecycle feature PR #64 is merged to protected `staging`;
- merge the release preparation through protected `staging` and `main`;
- create the matching protected annotated tag only after `main` is green;
- let the workflow stage every asset, publish npm, and then expose the immutable prerelease;
- verify `beta` points to beta.7 while `latest` remains beta.1; npm rejects
  removing `latest`, so beta examples must stay explicit about `@beta`;
- open a separate Homebrew tap pull request after the immutable artifact URLs exist.

## Prepared pull request sequence

The arrow-key feature and beta.6 release are complete, and the Phase 19 feature
is merged to `staging`. This separate release branch prepares beta.7 by updating
the CLI and lockfile version, changelog, launch record, and current-version
fixtures. After this PR is green and merged, open a fresh `staging` → `main` PR
titled **Promote Side Glance 0.1.0-beta.7**. Tag only the exact green merge commit
on `main`.

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
