# Adapter protocol v1

Adapters submit one JSON object on stdin to `signal event --json`, or translate a provider payload through `signal hook --provider <name> --json`.

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

`confidence` is `native`, `notification`, `wrapper`, or `heuristic`. It describes event fidelity and does not change ordering safety.

## Provider coverage

| Provider | Integration | Fidelity |
|---|---|---|
| Claude Code | JSON hooks | Session, prompt, permission/idle notification, stop/failure, end |
| Codex | JSON hooks | Session, prompt, permission, stop, synchronous end; existing legacy notify preserved |
| Gemini CLI | JSON hooks | Session, before/after agent, permission notification, end |
| OpenCode | plugin events | Session status/idle/error/delete and permission events |
| Aider | completion command + wrapper | Completion only natively; wrapper owns start/end |
| Any CLI | supervised wrapper | Process start, exit, common signals, cleanup |

Adapters must never add prompt, response, transcript, tool input, secret, or arbitrary provider payload fields to normalized events.

## Target discovery

The wrapper exports `SIGNAL_SURFACE_ID`, `SIGNAL_SESSION_ID`, and, when available, `SIGNAL_TTY` and `SIGNAL_TMUX_PANE`. Explicit verified values win; otherwise Signal invokes `tty` directly without a shell. Native hooks should inherit wrapper identity because providers do not consistently expose a controlling TTY.
