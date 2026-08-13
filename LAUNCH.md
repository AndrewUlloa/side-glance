# Launch and rollback

Signal is a release candidate. The requester approved the Vercel landing-page deployment, and that deployment is complete. No package, tag, public release, Homebrew tap, or live provider migration occurs without separate explicit approval.

## Vercel production

- Public URL: https://terminal-signal.vercel.app
- Project: `andrew-243s-projects/terminal-signal`
- Promoted deployment: `dpl_FVz7gj8T1pS26nS36XNrUbAQiC1c`
- Deployed source commit: `94af9bcb93551bbfb2bf2c64864ef02611c57e0e`
- Previous known-good deployment: `dpl_CVPTgQi8hUGfjtfTJFaZxmgDyVWp`
- Build contract: Vercel ran the repository's canonical `npm run build` command using standard Next.js 16.3; no Cloudflare/vinext compatibility build remains.
- Verification: HTTP 200, correct deployment ID/title/canonical metadata, one-time desktop scroll reveals, 390×844 mobile layout and interactive Waiting state, no overflow or browser errors, and reduced motion with all 19 reveal targets visible and zero running animations.

Rollback the promoted site to the previous known-good deployment with:

```bash
vercel rollback dpl_CVPTgQi8hUGfjtfTJFaZxmgDyVWp --yes
```

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
