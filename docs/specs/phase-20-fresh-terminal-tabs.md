# Phase 20 — Fresh terminal tabs

## Problem

Terminal.app can copy a tab's effective dynamic OSC background when Cmd-T opens
a new tab. The new shell is unrelated to the running agent, but it looks Working,
Waiting, Ready, or Failed until another lifecycle event repaints or resets it.

## Journey storyboard

1. **Before — an agent is visible:** the developer trusts the colored tab to
   represent one active agent session.
2. **During — Cmd-T:** the developer expects a blank, neutral workspace owned by
   no agent. Terminal.app may copy the prior tab's effective background instead.
3. **During — first prompt:** a fixed shell-start reset restores the configured
   profile background before the developer types anything.
4. **During — nested and remote work:** tmux, SSH, nested shells, non-interactive
   shells, and unsupported shells receive no reset bytes.
5. **After — setup or removal:** guided setup previews the exact startup file;
   disable removes only Side Glance's exact managed block and preserves all other
   shell configuration.

The largest expectation/reality gap is moment 2: a fresh tab looks as though it
belongs to an existing agent. The leverage point is moment 3, before any prompt.

## Contract

- Fresh tabs are a separately visible setup capability, recommended only when a
  supported top-level zsh startup target can be inspected safely.
- The managed block emits only OSC 111, the reset for the dynamic background
  channel Side Glance owns.
- It runs only in an interactive, direct, local, top-level shell. It skips tmux,
  SSH, nested shells, and redirected output.
- Shell startup files are captured, bounded, non-symlink regular files. Writes
  are atomic, backed up, verified, and included in setup rollback.
- Existing malformed or duplicate ownership markers block changes. Arbitrary
  user shell code is never interpreted, logged, or included in CLI output.
- Automated setup preserves the current state unless `--fresh-tabs` or
  `--no-fresh-tabs` is explicit. Interactive recommended setup enables the
  capability when eligible. Customize exposes an arrow-key clean/inherit
  choice, and both paths show the outcome in the final confirmation.
- Unsupported shells remain unchanged and receive actionable guidance.
