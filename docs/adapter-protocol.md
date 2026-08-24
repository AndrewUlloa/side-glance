# Adapter protocol v1

Adapters submit one JSON object on stdin to `side-glance event --json`, or translate a provider payload through `side-glance hook --provider <name> --json`. Add `--notifications` to either Side Glance command to request the independent native notification side effect. Hook stdout is provider-specific and minimal: Claude is silent, while Codex and Gemini receive `{}`. Global Side Glance state is available only through `side-glance status --json`.

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
| `turn.completed` | completed | Ready state; short completions may suppress the visual |
| `turn.failed` | failed | Provider-reported failure |
| `turn.cancelled` | failed | Cancellation remains attention-worthy |
| `session.ended` | inactive | Releases only this session's lease |

`confidence` is `native`, `notification`, `wrapper`, or `heuristic`. It describes event fidelity and does not change ordering safety. Claude `Stop`, Codex `Stop`, and Gemini `AfterAgent` are marked `heuristic`: each provider can still allow a separate hook to block or retry after Side Glance runs, and none exposes a post-aggregate acceptance event. Those events can paint the best-known Ready state, but they do not issue a final Ready desktop notification. Use `side-glance run --notify-on-exit -- <provider>` when process exit is the completion boundary you want to hear.

## Provider coverage

| Provider | Integration | Fidelity |
|---|---|---|
| Claude Code | JSON hooks | Session, prompt, permission/idle notification, stop/failure, end |
| Codex | JSON hooks | Session, prompt, permission, stop, synchronous end; existing legacy notify preserved |
| Gemini CLI | JSON hooks | Session, before/after agent, permission notification, end |
| OpenCode | managed plugin events | Top-level session status/idle/error/delete and permission events; child sessions are filtered |
| Aider | `side-glance notify` callback + wrapper | Completion only natively; wrapper owns start/end |
| Any CLI | supervised wrapper | Process start, exit, common signals, cleanup |

Adapters must never add prompt, response, transcript, tool input, secret, or arbitrary provider payload fields to normalized events.

## Target discovery

The wrapper exports `SIDE_GLANCE_SURFACE_ID`, `SIDE_GLANCE_SESSION_ID`, and, when available, `SIDE_GLANCE_TTY` and `SIDE_GLANCE_TMUX_PANE`. `--label` also exports `SIDE_GLANCE_LABEL`; `--notification-sound` exports `SIDE_GLANCE_NOTIFICATION_SOUND`. Explicit verified values win; otherwise Side Glance invokes `tty` directly without a shell. Native hooks should inherit wrapper identity because providers do not consistently expose a controlling TTY.

Notification delivery occurs only after the originating event is accepted and persisted. Duplicate and stale events do not alert. Waiting, native/wrapper-final completed, failed, and cancelled events alert; pre-final heuristic completion, lifecycle start, acknowledgement, and teardown do not. A target is optional for notification-only hooks, and a session that does not own the visual surface can still alert. Titles contain only the provider and lifecycle result. Bodies contain an explicit sanitized label or a short digest of the session ID—never prompt, response, transcript, cwd, target, or failure-reason content.
