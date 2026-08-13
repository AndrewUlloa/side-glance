# Release review

Date: 2026-08-12  
Branch: `codex/core-controller`  
Status: release-candidate implementation; external publication deferred

| Axis | Result | Evidence and remaining boundary |
|---|---|---|
| Correctness | Pass locally | Reducer, lease, controller, wrapper, adapter, installer, terminal, tmux, site, and rendered-output suites pass. Core coverage is enforced at 90% lines, 70% branches, and 95% functions. |
| Security and privacy | Pass locally | Fixed private JSON state, atomic writes, bounded input/state, no shell evaluation, canonical owned TTY validation, safe tmux arguments, prompt/transcript exclusion, and symlink/config refusal are tested. |
| npm distribution | Pass locally | A clean `npm pack` builds a four-file dependency-free package, isolated global installation and upgrade preserve durable hooks, and `npx` diagnostics work while activation is refused. Node 22.14/24.18 remain CI evidence after push. |
| Native distribution | Pass on local macOS arm64 | The exact extracted SEA archive runs without Node on `PATH`, has recomputed metadata, and is ad-hoc signed. Linux and Intel macOS require their release runners; Developer ID signing and notarization are not present. |
| Release security | Implemented, externally gated | Actions are commit-pinned; the workflow requires canonical public visibility, protected matching tags, `main` reachability, protected environments, exact artifacts, attestations, draft staging, npm integrity idempotency, and post-release download verification. The repository rulesets and tag-restricted environments are configured; public visibility, required environment reviewers, npm ownership, and trusted publishing remain owner gates. |
| Homebrew | Generator passes locally | Immutable URLs and digests are schema-validated and the formula passes Ruby and Homebrew style checks. Tap `readall`, audit, URL installation, and upgrade tests require a real release and tap. |
| UX and accessibility | Pass in production | The Vercel deployment was checked on desktop and 390×844 mobile, including playground interaction, overflow, console, runtime errors, and network resources. Install commands remain explicitly labeled unavailable until the beta is published. |
| Site architecture | Pass locally; deployment pending | The only site runtime is standard Next.js 16.3 on Vercel. Cloudflare Worker, vinext, Wrangler, Vite bridge, D1 starter code, Worker types, and their lockfile graph were removed. The canonical Next.js production build and a regression contract both pass. |

## Required findings

1. Complete the remaining owner-only public-repository, environment-reviewer, vulnerability-reporting, and npm trusted-publisher setup in [docs/releasing.md](./docs/releasing.md).
2. Run all native release runners and the real Homebrew tap install/upgrade path before calling those channels supported.
3. Keep macOS signing language limited to ad-hoc signing unless Developer ID signing and notarization are added.
4. Production dependencies audit clean. Four audit findings remain in development-only build/lint dependencies and are outside the deployed Vercel runtime.

## Explicit non-guarantees

- No synchronous cleanup claim after `SIGKILL`, power loss, or terminal-emulator death.
- OSC 111 restores the configured default, not an unknowable arbitrary prior OSC 11 value.
- Separate tmux panes cannot own distinct whole-client background colors; Signal uses tmux status there.
- Gemini, OpenCode, and Aider were contract-tested but not live-executed when their CLIs were unavailable locally.
- Windows, Alpine/musl, and other unlisted native targets are unsupported.
