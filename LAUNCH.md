# Launch and rollback

Signal is a release candidate. The requester approved the Vercel landing-page deployment, and that deployment is complete. No package, tag, public release, Homebrew tap, or live provider migration occurs without separate explicit approval.

## Vercel production

- Public URL: https://terminal-signal.vercel.app
- Project: `andrew-243s-projects/terminal-signal`
- Promoted deployment: `dpl_GPpoXD6MML86fTWYXtHqTTWYPMcB`
- Deployed source commit: `5363ca515419b1ab4a6a6584505278ac66b74ecb`
- Previous known-good deployment: `dpl_AuxQwwaiHWE9dyycPNs3jduoy7gt`
- Build contract: Vercel ran the repository's canonical `npm run build` command using standard Next.js 16.3; no Cloudflare/vinext compatibility build remains.
- Verification: HTTP 200 and correct deployment identity; `html.lenis` root initialization; trusted anchor navigation enters `lenis-smooth` and lands on the requested section; reduced motion navigates immediately without smoothing; 1440×800 desktop and 390×844 mobile have no horizontal overflow or browser errors.

Rollback the promoted site to the previous known-good deployment with:

```bash
vercel rollback dpl_AuxQwwaiHWE9dyycPNs3jduoy7gt --yes
```

## Vercel Preview annotation tooling

- Preview URL: https://terminal-signal-hnt8cmjsb-andrew-243s-projects.vercel.app
- Preview deployment: `dpl_D8TxW8oebtacgRantEBqPgoQjqmn`
- Source commit: `a14d540`
- Environment boundary: Agentation is enabled for local Next.js development and Vercel Preview/development, and disabled for production or unknown environments.
- Data boundary: no endpoint, MCP configuration mutation, or remote sync is configured; annotations remain browser-local unless a reviewer explicitly adds a connection in their own toolbar.
- Verification: the protected Preview returns HTTP 200 through `vercel curl`, its server payload passes `enabled: true`, and the reviewed hero contains neither the eyebrow nor proof strip. Local hydrated browser verification at 1256×833 shows Agentation 3.0.2, no horizontal overflow, and no browser errors. The public production alias remains on `dpl_GPpoXD6MML86fTWYXtHqTTWYPMcB`, where a fresh browser reports zero Agentation UI roots and zero Agentation requests.
- Promotion boundary: this Preview was not promoted and must not be promoted while the Agentation toolbar is part of its preview-only review surface.

Preview rollback is isolation by default: leave the Preview unpromoted. Reverting `a14d540` removes the latest hero feedback from future previews without changing the public production alias.

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
2. Install Signal durably for one provider in a chosen terminal session.
3. Exercise working, waiting, completion, failure, normal exit, and `SIGINT` paths.
4. Confirm unrelated hooks and Codex notification behavior still run.
5. Remove old hook entries only after the Signal trial passes.

Signal's installer creates a timestamped backup before changing an existing provider hooks file. It does not remove `stoplight.sh` automatically.

## Rollback

```bash
signal reset --all --json
signal uninstall claude --json
signal uninstall codex --json
```

If manual recovery is required, restore the installer's `.signal-backup-*` file after preserving the current file for diagnosis. OSC 111 restores the configured terminal background default. Existing tmux local and inherited options are restored by the controller; if the terminal has disappeared, start a new terminal and run reset before retrying.
