# Edge-case audit

This audit records the failure modes found in the original personal `stoplight.sh` and the corresponding Side Glance behavior.

| Original failure mode | Side Glance control | Evidence |
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
| A new Terminal.app tab inherits the prior tab's lifecycle wash | Reviewed, reversible zsh startup block emits only OSC 111 for a top-level direct local shell and skips tmux, SSH, nesting, and redirection | Fresh-tab installer and transaction tests |
| Title is overwritten permanently | Title mutation is opt-in; reset bytes are validated | Terminal renderer test |
| Ancestor PID walk races or reparents | Bounded discovery revalidates stable same-user process records and canonical TTY tokens; the renderer verifies the owned character device before writing; otherwise discovery fails targetless and wrapper identity remains the fallback | Target discovery and terminal safety tests |
| Arbitrary paths receive escape bytes | Canonical path, symlink, device, ownership, and character-device checks | Terminal safety tests |
| A dead TTY/pane makes reset fail forever | Terminal-gone errors revoke the lease without retrying unreachable output | Surface reset test |
| Codex notifier is replaced | Hooks live in their own file; install/uninstall never touches `config.toml` notify | Installer and doctor tests |
| Multiple agent alerts are indistinguishable | Explicit sanitized labels or privacy-safe session digests; no prompt-derived titles | Notification policy and CLI tests |
| Provider-native and Side Glance alerts duplicate | Separate readiness report and explicit Side Glance opt-in; native settings remain untouched | Doctor and installer tests |
| A notification command corrupts hook stdout | Native delivery is a controller side effect; provider acknowledgements remain minimal (Claude is silent; Codex and Gemini receive `{}`) | CLI integration tests |
| Notification backend is absent or denied | macOS/Linux capability checks and non-fatal no-op degradation | Native notifier tests |
| State/replay data grows forever | Replay IDs, inactive sessions, and inactive surfaces have tested caps; active sessions are retained | Reducer and controller compaction tests |

## Honest cleanup boundary

Lifecycle cleanup is deterministic when the provider hook, wrapper, or controller can execute. It is not possible to guarantee an exit callback after `SIGKILL`, power loss, kernel failure, or terminal-emulator death. Side Glance provides recovery and bounded stale state instead: the next valid event re-resolves ownership, stale store locks require proof of owner death before reclamation, and `side-glance reset --all --json` releases every tracked session.

## Portability boundary

OSC background support varies across terminal emulators, SSH/container layers, tmux passthrough settings, and Windows ConPTY. Side Glance safely degrades when no verified render channel exists. Plain Claude, Codex, and experimental Gemini launches can use bounded process ancestry to recover a local TTY, but that discovery is supported rather than guaranteed; desktop, detached, and remote app-server sessions can remain targetless. tmux adds phase-specific markers; direct terminals may opt into a phase-only title, while Terminal.app OSC 11 remains explicitly unverified. Desktop notifications are global OS effects: Focus or notification preferences may suppress them, Linux sound is best-effort, and clicking cannot reliably select an originating terminal, tab, or tmux pane. Claude and Codex are locally contract-audited; Gemini, OpenCode, and Aider remain experimental because their live binary matrix has not passed.
