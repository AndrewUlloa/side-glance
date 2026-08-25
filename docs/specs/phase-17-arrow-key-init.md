# Spec: Arrow-key guided setup

> Filed by: Codex `/root`
> Status: approved
> Last updated: 2026-08-25

## One-line summary

Replace Side Glance's diagnostic-first numbered initializer with a concise,
arrow-key-driven first-run journey while preserving its exact planning,
configuration-safety, automation, and recovery contracts.

## Objective

Side Glance will provide a modern interactive setup on supported TTYs: detect
providers without executing them, offer the planner's current defaults as the
recommended path, let users move through choices with Up/Down, toggle multiple
choices with Space, confirm with Enter, show truthful progress only after final
approval, and finish with the command that starts each configured provider.

The current initializer exposes planner vocabulary such as `eligible`,
`contract-audited`, and `integration unknown` before the user can make a
decision. It also requires comma-separated numeric input. That is safe but does
not match the expectation created by create-next-app, shadcn, or the website's
"guided setup" language.

This is for a first-time Side Glance user who already has at least one supported
coding-agent CLI and expects setup to take one short, reversible terminal flow.

Success means the recommended path can be completed with Enter, arrow-key
navigation works in a real macOS or Linux PTY, customization remains available,
all writes still occur only after an exact preview and confirmation, and npm plus
standalone distributions behave identically.

## Journey contract

### Before

1. The website and README give one durable installation command followed by
   `side-glance init`, or the staged `npx side-glance@beta init` bootstrap.
2. npm may show its own download confirmation; Side Glance does not mislabel
   that third-party moment as product UI.

### During

1. Side Glance detects integrations silently and opens with a short product
   title.
2. It states which providers were found in user language and summarizes missing
   or blocked providers once.
3. It focuses **Use recommended settings** by default and names the providers
   those settings will configure. **Customize** reveals provider, computer-alert,
   and sound choices. **Exit** performs no writes.
4. Enhanced TTY choices use Up/Down, Space for multiselect, and Enter. Static or
   accessible fallback choices retain numbered/comma-separated input.
5. The user sees an exact, redacted review before a final default-yes
   confirmation. No provider configuration, backup, directory, lock, package
   installation, notification, or terminal lifecycle event occurs before that
   approval.
6. Progress begins only after approval. It may say that configuration is being
   written and verified, but it may not claim provider-level success before the
   complete transaction verifies.

### After

1. Success says configuration was verified, distinguishes changed from unchanged
   targets, states notification coverage without implying audible delivery, and
   prints launch commands.
2. Benign Exit, final No, or EOF before apply exits without writes. Ctrl-C exits
   130. A caught apply failure reports guarded rollback truthfully.
3. `side-glance doctor --json`, `--dry-run`, and `--json` retain the complete
   diagnostic detail for troubleshooting and automation.

## Assumptions

- Supported interactive platforms remain macOS and glibc Linux; Windows and
  musl/Alpine remain outside the beta contract.
- Recommended setup means the existing planner-selected eligible providers,
  deterministic provider-native versus Side Glance alert defaults, and `Glass`
  when Side Glance alerts are selected. It does not persist user preferences.
- The recommended option must name its dynamic consequences so an experimental
  integration is never selected invisibly.
- `NO_COLOR`, `TERM=dumb`, non-TTY streams, unavailable raw mode, or
  `SIDE_GLANCE_ACCESSIBLE=1` use the existing static no-escape fallback. This
  preserves beta.5's byte-level `NO_COLOR` contract.
- Enhanced input uses Node's stable `readline.emitKeypressEvents` behind a small
  raw-mode lease and pure selection reducers. It does not add a prompt runtime
  dependency or hand-parse fragmented CSI byte sequences.
- The requester's 2026-08-25 instruction granting full permission to complete
  this goal approves these assumptions unless a test or safety review forces a
  narrower behavior.

## Success criteria

| # | Criterion | Proof | Target |
|---|---|---|---|
| 1 | Recommended navigation | Real PTY sends Up/Down/Enter | Default focus and movement are correct |
| 2 | Custom multiselect | Real PTY sends Up/Down/Space/Enter | Choices toggle and preserve canonical order |
| 3 | Progressive disclosure | Human-output contract tests | Planner jargon is absent from the first decision |
| 4 | Safe approval boundary | Unit and PTY filesystem assertions | Zero writes before final confirmation |
| 5 | Cancellation cleanup | Unit plus PTY signal tests | Raw mode/cursor restored; Ctrl-C is 130 |
| 6 | Static accessibility | Non-TTY, `NO_COLOR`, `TERM=dumb`, and accessible-mode tests | No ANSI bytes; existing typed selection works |
| 7 | Automation compatibility | CLI integration tests | Help, `--yes`, `--dry-run`, and JSON schemas unchanged |
| 8 | Truthful progress/result | Failure-injection tests | No success before full verification; rollback wording bounded |
| 9 | Distribution parity | Packed npm and standalone tests on Node 22/24 and native CI | Arrow flow bundles and launches without dynamic assets |
| 10 | Public install proof | Fresh `npx ...@beta init` and Homebrew smoke | Released version completes recommended PTY path |

## Non-goals

- Changing provider detection, lifecycle semantics, hook payloads, notification
  coverage, or configuration targets.
- Claiming that a provider executed, a notification was delivered, a sound was
  audible, or clicking an alert focused the originating terminal.
- Guaranteeing cleanup after power loss, `SIGKILL`, or terminal-emulator failure.
- Adding Windows, musl/Alpine, stored setup preferences, or a website redesign.
- Removing detailed dry-run, JSON, doctor, or static fallback output.

## Technical constraints

- TypeScript, Node 22 npm bundle, Node 24 SEA bundle, macOS and glibc Linux.
- Production entry points remain bundled by esbuild with no runtime asset lookup.
- Prompt-owned text, paths, labels, and reasons remain untrusted and must have
  control, escape, and bidi formatting characters neutralized before rendering.
- Raw terminal ownership is scoped to an active prompt and must be restored on
  success, cancellation, stream termination, signal, abort, exception, and close.
- Enhanced cursor-control bytes may be emitted only after TTY capability checks.

## Testing strategy

- Unit tests cover prompt selection, sanitization, cancellation mapping, fallback
  selection, setup branching, progress ordering, and human copy.
- PTY integration tests cover the recommended Enter path, customize arrow/Space
  path, `NO_COLOR`, static fallback, and terminal cleanup.
- CLI integration tests preserve machine-only JSON and non-interactive behavior.
- Distribution tests execute the packed npm artifact and standalone SEA binary,
  not source-only substitutes.
- The repository's complete required gates run before review and again on the
  final release commit.

## Boundaries

**Always:** write RED tests before production changes; sanitize terminal text;
close or restore prompt state before writes; preserve hooks and provider config;
run all required gates; retain a static fallback.

**Ask first:** materially change provider-selection defaults, notification
semantics, configuration targets, supported platforms, or protected-branch
policy.

**Never:** approve on malformed/partial escape input; execute providers during
detection; leak raw input; write before confirmation; weaken a release gate;
promote a prerelease to npm `latest`.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Terminal left in raw mode or cursor hidden | High | Proven prompt library or bounded parser, cleanup tests, PTY `stty` checks |
| Enter accidentally approves after malformed input | High | Complete key events only; cancellation fails closed |
| Local TTY controller mishandles terminal ownership | High | Node keypress events, scoped raw lease, pure reducers, cleanup and PTY tests |
| Recommended path hides experimental support | Medium | Name included providers in the option hint and review |
| ANSI UI breaks automation or screen readers | Medium | Capability gate plus explicit static/accessibility mode |
| Progress overclaims partial work | Medium | One pending transaction state and success only after verification |

## Open questions

None are blocking. Independent security and distribution review selected Node's
built-in keypress events over either a handwritten escape parser or a new prompt
dependency.

## Sign-off

- [x] Author wrote the spec.
- [x] Assumptions are explicit and covered by the requester's full-permission directive.
- [x] Success criteria are measurable.
- [x] Boundaries are explicit.
- [x] No blocking question remains.
- [x] Requester approved end-to-end execution on 2026-08-25.
