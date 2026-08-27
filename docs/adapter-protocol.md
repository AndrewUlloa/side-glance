# Adapter protocol v1

Adapters submit one JSON object on stdin to `side-glance event --json`, or translate a provider payload through `side-glance hook --provider <name> --json`. Add `--notifications` to either Side Glance command to request the independent native notification side effect. Successful `event`, `notify`, and `reset` JSON commands emit only an empty JSON object (`{}` followed by a newline); they never serialize global state. Hook stdout remains provider-specific and minimal: Claude and OpenCode are silent, while Codex and Gemini receive the same empty JSON object. `side-glance status --json` is the only command that returns the full global Side Glance state.

```json
{
  "v": 1,
  "eventId": "provider-unique-id",
  "source": "claude",
  "sessionId": "provider-session-id",
  "kind": "turn.started",
  "occurredAt": 1786536000000,
  "generation": 2,
  "turnId": "optional-provider-turn-id",
  "confidence": "native",
  "target": {
    "surfaceId": "tty:/dev/ttys007",
    "tty": "/dev/ttys007"
  }
}
```

## Event kinds

| Event | Result | Notes |
|---|---|---|
| `session.started` | working | Establishes or resumes a session |
| `turn.started` | working | Acknowledges prior attention and advances local generation |
| `attention.waiting` | waiting | Permission or idle input is required |
| `attention.acknowledged` | working | Permission/input was answered |
| `turn.completed` | completed | Ready state; only Heat may suppress a completion under 10 seconds |
| `turn.failed` | failed | Provider-reported failure |
| `turn.cancelled` | failed | Cancellation remains attention-worthy |
| `work.started` | working | Adds one bounded child/background identity to the parent aggregate |
| `work.finished` | working | Removes one identity but never synthesizes Ready |
| `session.ended` | inactive | Releases only this session's lease |

`work.started` and `work.finished` require a bounded `{id, kind}` reference. A
provider may also send an optional `activeWork` snapshot. Missing means unknown
and preserves known work; an explicit empty array means the provider reported no
registry work. Nonempty known work prevents `turn.completed` from reducing to
Ready. A work-finish event removes its matching child and also reconciles a
valid registry snapshot on that event. Resume/compact session starts preserve
known work. Child completion alone never creates Ready, and completion must be
strictly later than the most recent work evidence.

`confidence` is `native`, `notification`, `wrapper`, or `heuristic`. It describes event fidelity and does not change ordering safety. Claude `Stop`/`SubagentStop`, Codex `Stop`, and Gemini `AfterAgent` are marked `heuristic`: each provider can still allow a separate hook to block or retry after Side Glance runs, and none exposes a post-aggregate acceptance event. Known Claude subagent/background work delays Ready, but the eventual best-known event still does not issue a final Ready desktop notification. Use `side-glance run --notify-on-exit -- <provider>` when process exit is the completion boundary you want to hear.

## Provider coverage

| Provider | Integration | Fidelity |
|---|---|---|
| Claude Code | JSON hooks | Session, prompt, permission/idle notification, subagent start/stop, bounded background snapshots, stop/failure, end |
| Codex | JSON hooks | Session, prompt, permission, stop, synchronous end; existing legacy notify preserved |
| Gemini CLI | JSON hooks | Session, before/after agent, permission notification, end |
| OpenCode v1 | managed stable plugin events (experimental) | Top-level session status/idle/error/delete and permission events; child sessions are filtered. OpenCode 2's incompatible beta plugin API is rejected. |
| Aider | static `side-glance notify` command + wrapper (experimental) | Aider invokes no JSON event producer; its documented static completion callback supplies Ready while the wrapper owns start/end. |
| Any CLI | supervised wrapper | Process start, exit, common signals, cleanup |

Adapters must never add prompt, response, transcript, tool input, secret, or arbitrary provider payload fields to normalized events.

## Target discovery

The wrapper exports `SIDE_GLANCE_SURFACE_ID`, `SIDE_GLANCE_SESSION_ID`, and, when available, `SIDE_GLANCE_TTY` and `SIDE_GLANCE_TMUX_PANE`. `--label` also exports `SIDE_GLANCE_LABEL`; `--notification-sound` exports `SIDE_GLANCE_NOTIFICATION_SOUND`; `--terminal-title` exports `SIDE_GLANCE_TERMINAL_TITLE=1`. Explicit verified values win; otherwise Side Glance invokes `tty` directly without a shell. Native hooks should inherit wrapper identity because providers do not consistently expose a controlling TTY. An installed managed hook that receives no safe target still records and acknowledges its targetless event so the provider UI is never polluted by a Side Glance surface-discovery failure; it cannot paint a terminal until a later event supplies a verified target. A manually invoked non-notification hook remains strict and requires `--surface` or a discoverable TTY.

Notification delivery occurs only after the originating event is accepted and persisted. Duplicate and stale events do not alert. Waiting, native/wrapper-final completed, failed, and cancelled events alert; pre-final heuristic completion, lifecycle start, acknowledgement, and teardown do not. A target is optional for notification-only hooks, and a session that does not own the visual surface can still alert. Titles contain only the provider and lifecycle result. Bodies contain an explicit sanitized label or a short digest of the session ID—never prompt, response, transcript, cwd, target, or failure-reason content.

OpenCode v1 can install colors without notifications. Because its managed plugin launches Side Glance with piped JSON, run OpenCode through `side-glance run -- opencode` so the plugin inherits a stable surface. Add `--notifications` to the install command only when Side Glance desktop alerts are also wanted. OpenCode 2 uses the separate `opencode2` binary and a changing default-export plugin contract; Side Glance fails closed instead of writing a v1 plugin into that runtime.
