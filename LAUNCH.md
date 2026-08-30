# Launch and rollback

Side Glance `0.1.0` is the current stable release on npm `latest`, GitHub Latest,
and the public Homebrew tap. It promotes the verified beta lifecycle, guided
setup, secure terminal discovery, theme control, and fresh-tab behavior without
changing runtime semantics. The immutable beta.12 release and npm `beta` tag
remain available; provider and platform evidence labels remain unchanged.

## Production deployment status

- Current public URL: <https://sideglance.dev> (HTTP 200, HSTS, and Cloudflare TLS verified 2026-08-27)
- Vercel fallback URL: <https://side-glance.vercel.app> (HTTP 200 verified 2026-08-27)
- Custom-domain status: `sideglance.dev` uses Cloudflare authoritative DNS and
  DNSSEC in front of Vercel; `www.sideglance.dev` redirects to the apex, and both
  hostnames are attached to production
- Asset-domain status: `assets.sideglance.dev` is attached directly to the
  `side-glance-assets-prod` R2 bucket with minimum TLS 1.2
- Vercel project: `andrew-243s-projects/side-glance`
- Project ID: `prj_WAlUcwR41N6Uw93yC8kDT2mUiVQ5`
- Verified beta.11 deployment: `dpl_4xtEVYmKpyPesTsH5KswrUEd5zCU`
- Verified beta.11 immutable URL: <https://side-glance-6whi8mebx-andrew-243s-projects.vercel.app>
- Verified v0.1.0 production commit: `6124bb24591ff51906591e4abbe8e65e1c065889`
- Verified v0.1.0 Vercel deployment: `EoRJW4c2EUh7THswZPfJ9JVzgufP`
- The canonical Vercel `npm run build` path passed on Node 24 and the public URL
  returned HTTP 200 with Side Glance metadata and rendered copy.
- Vercel's Git integration creates previews for pull-request commits; the recorded
  Production deployment's source commit is the head of `main`.
- The custom apex and Vercel fallback alias resolve to the same verified project;
  the custom apex is the canonical public identity.

The Next.js application remains on Vercel. Large site images are stored in the
`side-glance-assets-prod` Cloudflare R2 bucket and use immutable, content-addressed
keys. The verified current origin is `https://assets.sideglance.dev`; the custom
domain was connected directly to R2 with minimum TLS 1.2 on 2026-08-30. All six
manifest objects must return HTTP 200 with their declared content type, length, and
immutable cache header. See [the public-asset runbook](./docs/assets.md) for the
verification and rollback contract.

The prior known-good production deployment is
`dpl_6Md5TDwM4tbiAATK6BvePWqSxDDY`. It remains Vercel rollback evidence; immutable
historical deployment identifiers are not rewritten during a product rename.

## npm and GitHub release status

- Current stable release: `side-glance@0.1.0`
- Current live dist-tags: `latest` points to `0.1.0`; `beta` remains on immutable
  `0.1.0-beta.12`
- GitHub Latest resolves to the non-prerelease immutable `v0.1.0` release.
- Stable npm integrity: `sha512-dR3ZIH8558SrqFfqrrYfU/5CKSJBlHlkLr3nCgjiji1TCVJo1n2zIDaAvclT/JiuIM7k3buK0eH2ogUmii/smg==`
- Release source commit: `6124bb24591ff51906591e4abbe8e65e1c065889`
- Unpublished attempt: the protected `v0.1.0-beta.2` workflow stopped at its npm
  dry-run; no npm package or GitHub Release was published.
- Rollback beta.12 integrity: `sha512-yZINagw7cux3mx0NXnRKZraD+0w9t9NsMUCv91RVXACy2WQfdW0izWFev8MxGVrEyFbSsLmz33RH0YwziIdQnw==`
- Every candidate tarball must contain only `LICENSE`, `README.md`,
  `dist/side-glance.mjs`, and `package.json`.

## Release verification

On 2026-08-14, the renamed npm package, standalone archive, Homebrew formula,
release policy, CLI migration paths, site, and rendered output passed their focused
and aggregate tests on Node 24.18.0. A production build through Next.js's supported
webpack path passed and the local production server passed desktop and 390×844
mobile layout, keyboard focus, copy/replay interaction, reduced motion, console,
network, and overflow checks.

Beta.12 published on 2026-08-27 through the protected workflow as an immutable
GitHub prerelease and Apache-2.0 npm package. Its public release has the npm
tarball, release manifest, `SHA256SUMS`, generated formula, three supported native
archives, and the experimental Intel macOS archive. Stable v0.1.0 published on
2026-08-30 through release run `33291865041`; all tag-level jobs, public checksum
and integrity checks, five provenance attestations, fresh npm/native smokes, and
the separate three-platform Homebrew tap path passed.

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

`npx side-glance@latest init` is the stable public bootstrap/trial path after
stable publication. Before publication, validate only the exact staged tarball
or release artifact rather than the live `latest` tag.
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
secret scanning are enabled, and GitHub Releases are immutable. Beta.12 is the
verified rollback baseline. Stable v0.1.0 completed the checklist in
[`docs/launch/v0.1.0-stable-release.md`](./docs/launch/v0.1.0-stable-release.md).

## Completed pull request sequence

Release-preparation PR `#113` merged to protected `staging` as `a791ad3`; literal
`staging` promotion PR `#114` merged to protected `main` as `6124bb2`. The
protected annotated `v0.1.0` tag published the immutable release, and Homebrew tap
PR `AndrewUlloa/homebrew-tap#11` merged as `3a69f70` after Linux, Apple Silicon,
and experimental Intel macOS test-bot checks passed.

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
