# side-glance

Side Glance is a local-first attention layer for coding-agent CLIs. It turns
working, waiting, ready, failed, and inactive lifecycle events into a calm terminal
or tmux status layer while protecting newer work from delayed hooks.

The npm CLI requires Node.js 22 or newer. macOS and glibc-based Linux are supported during the beta; Windows and musl/Alpine are not supported yet.

```bash
# Durable installation
npm install --global side-glance@beta
side-glance doctor --json
side-glance run -- claude
```

Use `npx side-glance@beta doctor --json` or
`npx side-glance@beta preview --phase waiting --json` for evaluation. Side Glance
deliberately refuses permanent provider installation from `npx` because npm's
ephemeral cache is not a durable lifecycle-hook location.

After a global or standalone installation, native hook setup is explicit and creates backups before changing existing configuration:

```bash
side-glance install claude --json
side-glance install codex --json
side-glance uninstall claude --json
side-glance reset --all --json
```

The generic wrapper works with any executable:

```bash
side-glance run -- your-coding-cli
```

Side Glance never stores prompts, responses, or transcripts. No software can
synchronously clean up after every component is killed or power is lost; Side
Glance reconciles owned state on the next event and provides explicit reset recovery.

See the [project repository](https://github.com/AndrewUlloa/side-glance) for
standalone downloads, the architecture, supported providers, terminal limitations,
security policy, and release attestations.
