# Side Glance architecture

## Data flow

```text
provider hook or supervised child
              │
              ▼
      normalized event v1
              │
              ▼
  locked reducer + lease resolver
              │
              ▼
 terminal/tmux surface renderer
              │
              ▼
 atomic private JSON state
```

Provider adapters translate lifecycle metadata only. The controller holds the store lock while it reduces an event, resolves the winning session for the affected surface, renders that decision, and atomically persists the resulting session and renderer snapshot. That transaction prevents a delayed hook from painting after a newer state has already committed.

Desktop notification delivery is an event side effect, not another surface lease. After an eligible waiting, effective completed, failed, or cancelled phase commits, the controller passes that originating event to the notifier. Notification eligibility is checked against the post-reducer phase, so a parent completion that remains Working because aggregate work exists cannot alert Ready. Pre-final heuristic completions do not claim a final Ready alert. This means targetless hooks and non-owning sessions still alert, while semantic duplicates, reducer-rejected events, and stale events do not. Notification backend failure is swallowed after persistence and cannot roll back lifecycle state.

## Ordering and ownership

The reducer rejects duplicate IDs, older generations, older event timestamps, and turn-scoped follow-ups whose turn ID no longer matches. A `turn.started` event advances the generation when the provider does not supply one. The replay cache retains the newest 4,096 event IDs.

Bounded child/background identities aggregate inside their parent session rather
than creating leases. Unknown snapshots preserve known work, explicit-empty
snapshots reconcile registry work, and resume/compact session starts do not erase
known work. A `work.finished` event removes its child and then reconciles any
registry snapshot carried by that same event. At equal timestamps, activity,
waiting, failure, and work evidence outrank completion. `work.finished` never
creates Ready; a strictly later parent completion must confirm the best-known
aggregate.

Every active session is a candidate lease for its `surfaceId`. Priority is `failed`, `waiting`, `completed`, then `working`; recency and the stable provider/session key break ties. Ending one session recomputes the owner before any reset occurs.

## Rendering channels

- A verified non-tmux TTY can receive an OSC 11 background wash. OSC 111 resets it to the configured default.
- A tmux pane receives window status styling. Side Glance snapshots local and inherited values and restores them precisely.
- Side Glance does not apply a whole-client OSC background while in tmux because separate panes cannot safely own different client-wide backgrounds.
- Logical surfaces remain useful for tests and integrations but perform no terminal write.

## Persistence and recovery

State lives in a mode-0700 directory and a mode-0600 JSON file. Writers serialize through a lock directory containing the owner PID, nonce, creation time, and process-start identity. Stale locks are reclaimed only after age and owner-death checks. Writes use a private temporary file, `fsync`, and atomic rename. Valid schema-1 state migrates in memory to schema 2; malformed, oversized, or unknown-schema state is quarantined rather than evaluated.

Schema 2 keeps at most 12 eligible completion-duration samples per provider, a
bounded learned ceiling, and a bounded identity that prevents one semantic turn
from training twice. Its closed nested schema rejects extra private fields and
incoherent cold profiles. Appearance configuration is a separate private atomic
JSON file guarded across every parent directory. Missing or invalid
configuration safely resolves to semantic Status; invalid bytes are preserved
for `doctor` rather than reaching a renderer.

The newest 4,096 replay IDs, 512 inactive sessions, and 256 inactive surfaces are retained. Active sessions are never removed by compaction.

Normal hooks and the supervised wrapper release their own sessions. `side-glance reset --all --json` is the operator recovery path when normal teardown could not run. A TTY or tmux pane that disappeared before reset is treated as already unreachable, so its lease can still be revoked. `SIGKILL`, power loss, and terminal-emulator death cannot provide a reliable synchronous cleanup callback; Side Glance documents that boundary instead of claiming otherwise.

## Trust boundaries

Hook JSON, identifiers, paths, environment variables, state files, and provider configuration are untrusted. Validation is allow-list based, stdin is size bounded, shell evaluation is never used for state, terminal targets must be canonical owned character devices, and tmux arguments are executed without a shell.
