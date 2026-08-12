# CLAUDE.md

Signal is a local-first attention layer for coding-agent CLIs. The repository contains both the distributable `signal` CLI and its interactive product site.

## Working agreement

For any non-trivial change, state the intended behavior, the failure mode it prevents, and the test that will prove it before editing production code.

## Red-green TDD

When TDD is requested, the order is mandatory:

1. Add one focused behavior test.
2. Run that test and capture the expected failure (`RED`). A syntax error, missing test dependency, or broken fixture does not count.
3. Add the smallest production change that satisfies the behavior.
4. Run the focused test and capture the pass (`GREEN`).
5. Refactor only while the focused and full suites remain green.

Never weaken, skip, delete, or rewrite a failing test merely to make a gate pass. Tests assert observable state and terminal bytes, not private function calls.

## Required gates

Before reporting work complete, run with Node 24 or newer:

```bash
npm run test:unit
npm run test:integration
npm run test:coverage
npm run lint
npm run typecheck
npm run build
npm test
```

Browser-facing changes also require a real browser check of the desktop and mobile layouts, keyboard interaction, reduced-motion behavior, console, and network failures.

## Safety invariants

- Treat hook payloads, session IDs, paths, labels, and persisted state as untrusted data.
- Persist typed JSON; never source or evaluate state as shell code.
- Never write terminal bytes until the target has been verified as an owned character TTY.
- An event from an older generation may never repaint a newer generation.
- Releasing one session removes only that session's lease and recomputes the surface from remaining leases.
- Reset restores Signal-owned state only. OSC 111 restores the terminal's configured default, not an unknowable prior dynamic background.
- Preserve existing CLI hooks and notification commands during install/uninstall.
- Title mutation is opt-in. Prompt or transcript content is never persisted or displayed by default.

## Product claims

The site must demonstrate the same phase model and palette as the CLI package. Do not claim exact cleanup after `SIGKILL`, power loss, or terminal-emulator failure. Describe those cases as recovery and reconciliation, not guaranteed lifecycle cleanup.
