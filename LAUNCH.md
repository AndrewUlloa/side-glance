# Launch and rollback

Signal is pre-release. The repository and draft pull request are the current distribution channel. Do not publish the package, deploy the site, or mutate live provider configuration without explicit approval.

## Preflight

1. Use Node 24 or newer and run every command in `CLAUDE.md`.
2. Run the opt-in live tmux test when tmux is installed.
3. Run `signal doctor --json` and review provider paths, existing hook counts, and Codex notifier detection.
4. Confirm `git status` is clean and GitHub CI passes.
5. Browser-check desktop/mobile, keyboard, reduced motion, console, and network behavior against the production build.

## Controlled migration from stoplight.sh

1. Save the existing hook configuration and locate every reference to `stoplight.sh`.
2. Install Signal for one provider in a chosen terminal session.
3. Exercise working, waiting, completion, failure, normal exit, and `SIGINT` paths.
4. Confirm existing unrelated hooks and Codex notify still run.
5. Remove the old hook entries only after the Signal trial passes.

Signal's installer creates a timestamped backup before changing an existing provider hooks file. It does not remove the old `stoplight.sh` automatically.

## Rollback

```bash
signal reset --all --json
signal uninstall claude --json
signal uninstall codex --json
```

If manual recovery is required, restore the installer's `.signal-backup-*` file after first preserving the current file for diagnosis. OSC 111 can restore the configured terminal background default. Existing tmux local/inherited options are restored by the controller; if the terminal has already disappeared, start a new terminal and run reset before retrying.

## Publication gates

- Package registry: blocked until the package is made publishable, its name is confirmed, and explicit approval is given.
- Site hosting: blocked until a target project is selected and explicit deployment approval is given.
- Live Claude/Codex installation: blocked until a migration window is approved.
