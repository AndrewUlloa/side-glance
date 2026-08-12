# Release review

Date: 2026-08-12  
Branch: `codex/core-controller`  
Status: local implementation ready; draft PR open; external publication deferred

| Axis | Result | Evidence and remaining boundary |
|---|---|---|
| Correctness | Pass | Reducer, lease, controller, wrapper, adapter, installer, terminal, tmux, site, and rendered-output suites pass on Node 24. Core coverage is 91.38% lines, 73.31% branches, and 98.81% functions against enforced 90/70/95 thresholds. |
| Security and privacy | Pass | Fixed private JSON state, atomic writes, bounded stdin/state, no shell evaluation, canonical owned TTY validation, safe tmux argv, prompt/transcript exclusion, and symlink/config refusal are tested. |
| Compatibility | Pass with documented degradation | Claude and Codex real configs pass read-only doctor; installed local CLIs were fixture/live audited where available. tmux has an opt-in real-server test. Unsupported terminal channels no-op safely. |
| UX and accessibility | Pass | Desktop/mobile, keyboard, touch sizing, focus visibility, copy state, reduced motion, console, and network behavior were checked in a real browser. |
| Operability and rollback | Pass for pre-release | `doctor`, `status`, `preview`, targeted/reset-all recovery, install/uninstall, backups, wrapper exit/signal propagation, CI, and rollback steps exist. Live config mutation, package publication, and deployment still require approval. |

## Required findings

None open.

## Explicit non-guarantees

- No synchronous cleanup claim after `SIGKILL`, power loss, or terminal-emulator death.
- OSC 111 restores the configured default, not an unknowable arbitrary prior OSC 11 value.
- Separate tmux panes cannot own distinct whole-client background colors; Signal uses tmux status there.
- Gemini, OpenCode, and Aider were contract-tested but not live-executed because their CLIs were not installed locally.
