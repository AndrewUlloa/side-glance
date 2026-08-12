# Edge-case audit

This audit records the failure modes found in the original personal `stoplight.sh` and the corresponding Signal behavior.

| Original failure mode | Signal control | Evidence |
|---|---|---|
| Async completion repaints after a newer prompt | Generation, timestamp, turn-ID, and event-ID rejection | Reducer and controller rendering tests |
| Concurrent hooks truncate or lose shell state | Locked typed JSON plus atomic rename | Concurrent-process store test |
| State file is sourced as executable shell | JSON schema validation; malformed state quarantined | Store corruption test |
| Session IDs become filenames or traversal paths | Fixed state filename; bounded text validation | Boundary and CLI tests |
| One session clears another's display | Deterministic surface ownership and recomputation | Lease and controller tests |
| Session end has no cleanup path | Native end hooks, supervised child teardown, targeted reset, reset-all recovery | Adapter, wrapper-signal, reset tests |
| `tmux -u` erases a user override | Exact local/inherited option snapshot and restore | Fixture and live tmux tests |
| Multiple panes fight over one client background | tmux panes use status styling; terminal OSC wash is disabled in tmux | Surface channel test |
| OSC reset pretends to recover an unknown custom wash | Explicit OSC 111 configured-default contract | Terminal byte test and docs |
| Title is overwritten permanently | Title mutation is opt-in; reset bytes are validated | Terminal renderer test |
| Ancestor PID walk races or reparents | Wrapper passes explicit identity; `tty` subprocess is a fallback | Target discovery tests |
| Arbitrary paths receive escape bytes | Canonical path, symlink, device, ownership, and character-device checks | Terminal safety tests |
| A dead TTY/pane makes reset fail forever | Terminal-gone errors revoke the lease without retrying unreachable output | Surface reset test |
| Codex notifier is replaced | Hooks live in their own file; install/uninstall never touches `config.toml` notify | Installer and doctor tests |
| State/replay data grows forever | Replay IDs, inactive sessions, and inactive surfaces have tested caps; active sessions are retained | Reducer and controller compaction tests |

## Honest cleanup boundary

Lifecycle cleanup is deterministic when the provider hook, wrapper, or controller can execute. It is not possible to guarantee an exit callback after `SIGKILL`, power loss, kernel failure, or terminal-emulator death. Signal provides recovery and bounded stale state instead: the next valid event re-resolves ownership, stale store locks require proof of owner death before reclamation, and `signal reset --all --json` releases every tracked session.

## Portability boundary

OSC background support varies across terminal emulators, SSH/container layers, tmux passthrough settings, and Windows ConPTY. Signal safely degrades when no verified render channel exists. Gemini, OpenCode, and Aider contracts are fixture verified in this development environment; their binaries were not available for live provider execution.
