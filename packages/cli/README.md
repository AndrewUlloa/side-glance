# terminal-signal

Signal is a local-first attention layer for coding-agent CLIs. It turns working, waiting, completed, failed, and inactive lifecycle events into a calm terminal or tmux signal while protecting newer work from delayed hooks.

The npm CLI requires Node.js 22 or newer. macOS and glibc-based Linux are supported during the beta; Windows and musl/Alpine are not supported yet.

```bash
# Durable installation
npm install --global terminal-signal@beta
signal doctor --json
signal run -- claude
```

Use `npx terminal-signal@beta doctor --json` or `npx terminal-signal@beta preview --phase waiting --json` for evaluation. Signal deliberately refuses permanent provider installation from `npx` because npm's ephemeral cache is not a durable lifecycle-hook location.

After a global or standalone installation, native hook setup is explicit and creates backups before changing existing configuration:

```bash
signal install claude --json
signal install codex --json
signal uninstall claude --json
signal reset --all --json
```

The generic wrapper works with any executable:

```bash
signal run -- your-coding-cli
```

Signal never stores prompts, responses, or transcripts. No software can synchronously clean up after every component is killed or power is lost; Signal reconciles owned state on the next event and provides explicit reset recovery.

See the [project repository](https://github.com/AndrewUlloa/terminal-signal) for standalone downloads, the architecture, supported providers, terminal limitations, security policy, and release attestations.
