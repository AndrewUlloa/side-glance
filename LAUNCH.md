# Launch and rollback

Side Glance is a beta. Version `0.1.0-beta.10` is public on npm, GitHub Releases,
and the Homebrew tap. It ships semantic lifecycle colors, aggregate Claude
readiness, truly adaptive Heat, guarded user theme control, guided init theme
selection, the interactive color-model preview, secure normal-command terminal
discovery, and controlled legacy Stoplight migration. Fresh-tab background reset
is merged to protected `staging` and prepared as the still-unpublished
`0.1.0-beta.11` release candidate.

## Production deployment status

- Current public URL: <https://side-glance.vercel.app> (HTTP 200 and HSTS verified 2026-08-27)
- Custom apex status: aliases are configured in Vercel, but public DNS does not
  resolve for `sideglance.ai` or `www.sideglance.ai` as of 2026-08-26
- Vercel project: `andrew-243s-projects/side-glance`
- Project ID: `prj_WAlUcwR41N6Uw93yC8kDT2mUiVQ5`
- Tagged beta.10 production deployment: `dpl_6Md5TDwM4tbiAATK6BvePWqSxDDY`
- Tagged beta.10 immutable deployment URL: <https://side-glance-e1wymwkuf-andrew-243s-projects.vercel.app>
- Tagged beta.10 source commit: `24f9c9551df4af41c6a8b6ce9219b6ef4b9c82cd`
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
`dpl_F2sxFa81rpEymygfBDB742Xy31Rt`. It remains Vercel rollback evidence; immutable
historical deployment identifiers are not rewritten during a product rename.

## npm beta status and next candidate

- Current public release: `side-glance@0.1.0-beta.10`
- Prepared candidate: `side-glance@0.1.0-beta.11` (unused; not published)
- Channel: `beta`
- Status: beta.11 release preparation is in review; until its protected promotion
  and tag workflow succeed, `beta` points to beta.10 while `latest` deliberately
  remains beta.1
- Previously published: `side-glance@0.1.0-beta.9`, `side-glance@0.1.0-beta.8`,
  `side-glance@0.1.0-beta.7`,
  `side-glance@0.1.0-beta.6`, `side-glance@0.1.0-beta.5`,
  `side-glance@0.1.0-beta.4`, `side-glance@0.1.0-beta.3`, and
  `side-glance@0.1.0-beta.1`
- Unpublished attempt: the protected `v0.1.0-beta.2` workflow stopped at its npm
  dry-run; no npm package or GitHub Release was published.
- Current beta.10 integrity: `sha512-OhPUhoFPYwRoqCUbr3MZC6v33WurbTjAAow28/R2ZXkwLI1/6/qf7c+s9qDKXPAj9kqHHYJQ+7Tcyh90YNZzLg==`
- Every candidate tarball must contain only `LICENSE`, `README.md`,
  `dist/side-glance.mjs`, and `package.json`.

## Release verification

On 2026-08-14, the renamed npm package, standalone archive, Homebrew formula,
release policy, CLI migration paths, site, and rendered output passed their focused
and aggregate tests on Node 24.18.0. A production build through Next.js's supported
webpack path passed and the local production server passed desktop and 390×844
mobile layout, keyboard focus, copy/replay interaction, reduced motion, console,
network, and overflow checks.

Beta.10 passed every repository gate, exact-SHA-protected CI, the production Vercel
deployment, the protected tag workflow, npm trusted publishing, immutable GitHub
Release verification, checksums, and build attestations. Fresh public npx enhanced
and `NO_COLOR` preview-only flows passed under Node 24.18.0. All four native
archives passed their standalone jobs; the downloaded Apple Silicon archive was
executed again locally. Homebrew PR #8 passed Linux, Apple Silicon macOS, and
experimental Intel macOS `brew test-bot`; the public tap upgrade from beta.9 to
beta.10 and the installed formula test passed without running setup or changing
provider configuration.

## Vercel Preview annotation tooling

Agentation remains enabled for local Next.js development and Vercel Preview or
development environments, and disabled for production or unknown environments. No
endpoint, MCP mutation, or remote sync is configured. Previews may contain the
toolbar; promotion is allowed only when the production-environment build excludes
it. If Agentation appears in production, roll back to the recorded prior deployment
and fix forward through the protected release path.

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
6. In Terminal.app, iTerm, Ghostty, or another terminal, normally run `claude`, `codex`, or experimental `gemini`; supported local hooks discover and verify their originating TTY. Direct discovery is not guaranteed, so use `side-glance run --label "<private label>" -- <provider>` as the fallback for detached or unusual launch paths, or when a private label is useful.
7. Manually verify terminal channels plus OS delivery and sound only in an approved migration window. Focus, notification preferences, Linux servers, and tmux prevent a universal delivery or click-to-pane guarantee.

## Guided setup smoke and rollback

Use a deliberately chosen provider and keep the initial preview read-only:

```bash
side-glance setup --providers claude --notifications none --dry-run
side-glance setup --providers claude --notifications none --yes
claude
side-glance doctor --json
side-glance uninstall claude --json
side-glance reset --all --json
```

Setup rolls back caught multi-provider apply or verification failures in reverse
order only while each target still matches its setup write. A concurrent edit is a
rollback conflict and is preserved. A power loss or `SIGKILL` between distinct
configuration-file renames can leave partial setup; the next `side-glance init` or
`side-glance doctor` reports it for idempotent repair. No secret configuration crash
journal is retained.

## External publication gates

Follow [docs/releasing.md](./docs/releasing.md). The repository is public, its
release and branch protections are active, private vulnerability reporting and
secret scanning are enabled, and future GitHub Releases are immutable. The
beta.10 gates are complete:

- normal-command terminal discovery feature PR #81 and release preparation PR #82 merged to
  protected `staging` with full checks;
- literal `staging` → `main` promotion PR #83 preserved exact staging ancestry;
- protected `main` CI and the production Vercel deployment passed at the tagged SHA;
- annotated tag `v0.1.0-beta.10` produced the verified npm and immutable GitHub prerelease;
- npm `beta` points to beta.10 while `latest` remains beta.1, so beta examples stay explicit about `@beta`;
- generated-formula Homebrew PR #8 passed every platform and merged only after
  immutable artifact URLs and hashes existed; public upgrade and formula smokes passed.

## Prepared pull request sequence

Normal-command terminal discovery PR #81, beta.10 release preparation PR #82,
protected promotion PR #83, annotated beta.10 publication, and Homebrew tap PR #8
are complete. Fresh terminal tab reset PR #85 is complete on protected `staging`;
beta.11 release preparation and the literal `staging` → `main` promotion remain.
Only the exact green `main` merge commit may receive the `v0.1.0-beta.11` tag.

## Controlled migration from stoplight.sh

1. Run `side-glance doctor --json` and review every recognized legacy Stoplight hook.
2. Run guided init and choose Replace, or use
   `side-glance install claude --migrate-legacy-stoplight --json` for automation.
3. Confirm the timestamped backup exists and unrelated Claude hooks remain.
4. Exercise working, waiting, completion, failure, normal exit, and `SIGINT` paths.
5. Restore the backup if the controlled migration does not pass.

Side Glance never enables a second direct color writer beside recognized legacy
Stoplight hooks. Migration removes only exact historical Stoplight commands;
arbitrary hooks that merely mention `stoplight.sh` are preserved.

## Rollback

```bash
side-glance reset --all --json
side-glance uninstall claude --json
side-glance uninstall codex --json
side-glance uninstall gemini --json
side-glance uninstall opencode --json
```

If manual recovery is required, restore the installer's `.side-glance-backup-*` file after preserving the current file for diagnosis. OSC 111 restores the configured terminal background default. Existing tmux local and inherited options are restored by the controller; if the terminal has disappeared, start a new terminal and run reset before retrying.
