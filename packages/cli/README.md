# terminal-signal

Signal is a local-first attention layer for coding-agent CLIs. It turns working, waiting, completed, failed, and inactive lifecycle events into a calm terminal or tmux signal while protecting newer work from delayed hooks.

```bash
npx terminal-signal doctor --json
npm install --global terminal-signal
signal run -- claude
```

Permanent provider hooks require a durable installation. After installing globally or through a standalone release:

```bash
signal install claude --json
signal install codex --json
```

See the [project repository](https://github.com/AndrewUlloa/terminal-signal) for the architecture, safety model, limitations, and full documentation.
