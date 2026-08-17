import { MotionOrchestrator } from "./components/MotionOrchestrator";
import { SideGlancePlayground } from "./components/SideGlancePlayground";
import { TerminalStoryboard } from "./components/TerminalStoryboard";

const providers = [
  {
    name: "Claude Code",
    level: "Native lifecycle",
    detail: "Start, prompt, permission, idle, stop, failure, and session end.",
    status: "Installable",
  },
  {
    name: "Codex",
    level: "Native lifecycle",
    detail: "Turn IDs protect newer work from delayed completion hooks.",
    status: "Installable",
  },
  {
    name: "Gemini CLI",
    level: "Native lifecycle",
    detail: "Synchronous agent, permission, and session events.",
    status: "Installable",
  },
  {
    name: "OpenCode",
    level: "Plugin events",
    detail: "Top-level status, idle, error, deletion, and permission events.",
    status: "Installable",
  },
  {
    name: "Aider",
    level: "Completion + wrapper",
    detail: "Completion notification plus supervised process cleanup.",
    status: "Bridge ready",
  },
  {
    name: "Any CLI",
    level: "Universal wrapper",
    detail: "Process lifecycle, exit codes, signals, identity, and cleanup.",
    status: "Baseline",
  },
] as const;

const steps = [
  {
    number: "01",
    title: "Listen without reading",
    copy: "Provider hooks report lifecycle metadata. Prompts, transcripts, and assistant messages never enter Side Glance state.",
    code: "hook → normalized event",
  },
  {
    number: "02",
    title: "Resolve one owner",
    copy: "A serialized reducer rejects stale turns and arbitrates every session sharing the same terminal surface.",
    code: "events → lease → state",
  },
  {
    number: "03",
    title: "Render, then restore",
    copy: "Side Glance paints verified terminal and tmux channels, optionally rings a privacy-safe desktop alert, and restores only what it changed.",
    code: "state → terminal + tmux + alert",
  },
] as const;

export default function Home() {
  return (
    <div className="site-shell">
      <MotionOrchestrator />
      <header className="site-header">
        <nav aria-label="Primary navigation" className="nav-wrap">
          <a aria-label="Side Glance home" className="brand" href="#top">
            <SideGlanceMark />
            <span>Side Glance</span>
          </a>
          <div className="nav-links">
            <a href="#how-it-works">How it works</a>
            <a href="#coverage">Coverage</a>
            <a href="#setup">Setup</a>
          </div>
          <a
            className="nav-github"
            href="https://github.com/AndrewUlloa/side-glance"
            rel="noreferrer"
            target="_blank"
          >
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <main id="top">
        <section aria-labelledby="hero-title" className="hero section-wrap">
          <div className="hero-copy">
            <h1 id="hero-title">
              <span className="hero-enter hero-enter-line-1">
                Your terminal knows
              </span>{" "}
              <span className="hero-enter hero-enter-line-2">
                when it needs you.
              </span>
            </h1>
            <p className="hero-lede hero-enter hero-enter-description">
              Side Glance turns coding-agent lifecycle events into a quiet,
              thermal status layer across terminal backgrounds and tmux—without
              reading your work.
            </p>
            <div className="hero-actions hero-enter hero-enter-announcement">
              <a className="primary-action" href="#playground">
                Try Side Glance <span aria-hidden="true">↓</span>
              </a>
              <a className="text-action" href="#setup">
                See the setup
              </a>
            </div>
          </div>

          <div className="hero-storyboard hero-illustration-enter">
            <TerminalStoryboard />
          </div>
        </section>

        <section
          aria-labelledby="playground-section-title"
          className="playground-section section-wrap"
          id="playground"
        >
          <div className="section-heading playground-section-copy">
            <p className="section-kicker">Explore the lifecycle</p>
            <h2 id="playground-section-title">See every lifecycle state.</h2>
            <p>
              Move between working, waiting, ready, failed, and inactive. The
              same state model drives every terminal in the opening workspace.
            </p>
          </div>
          <div className="playground-section-demo">
            <SideGlancePlayground />
          </div>
        </section>

        <section aria-label="Supported coding agents" className="trust-strip">
          <div className="section-wrap trust-inner">
            <span>One lifecycle layer for</span>
            <div
              aria-label="Claude Code, Codex, Gemini CLI, OpenCode, Aider, and any CLI"
              className="agent-wordmarks"
              role="group"
            >
              <strong>Claude Code</strong>
              <strong>Codex</strong>
              <strong>Gemini CLI</strong>
              <strong>OpenCode</strong>
              <strong>Aider</strong>
              <strong>any CLI</strong>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="how-title"
          className="story-section section-wrap"
          id="how-it-works"
        >
          <div className="section-heading">
            <p className="section-kicker">One event path</p>
            <h2 id="how-title">Lifecycle in. Attention out.</h2>
            <p>
              Hooks stay thin. One controller owns ordering, persistence, and
              every shared visual surface.
            </p>
          </div>
          <div className="step-grid">
            {steps.map((step) => (
              <article className="step-card" key={step.number}>
                <div className="step-number">{step.number}</div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
                <code>{step.code}</code>
              </article>
            ))}
          </div>
        </section>

        <section className="coverage-section" id="coverage">
          <div className="section-wrap coverage-wrap">
            <div className="section-heading coverage-heading">
              <p className="section-kicker">Coverage without pretending</p>
              <h2>Every CLI gets a baseline. Native hooks add fidelity.</h2>
              <p>
                Side Glance calls out the difference between a documented
                lifecycle event, a notification, and a wrapper observation.
              </p>
            </div>
            <div
              aria-label="Coding agent coverage"
              className="coverage-table"
              role="table"
            >
              {providers.map((provider) => (
                <div className="coverage-row" key={provider.name} role="row">
                  <div className="provider-name" role="cell">
                    <span aria-hidden="true" className="provider-mark">
                      {provider.name.slice(0, 1)}
                    </span>
                    <strong>{provider.name}</strong>
                  </div>
                  <div className="provider-level" role="cell">
                    {provider.level}
                  </div>
                  <div className="provider-detail" role="cell">
                    {provider.detail}
                  </div>
                  <div className="provider-status" role="cell">
                    {provider.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="setup-title"
          className="setup-section section-wrap"
          id="setup"
        >
          <div className="setup-copy">
            <p className="section-kicker">Start local</p>
            <h2 id="setup-title">
              Wrap any agent. Add native hooks when you want them.
            </h2>
            <p>
              The wrapper establishes terminal ownership and survives provider
              gaps. Installers merge native hooks transactionally, with backups,
              and never replace an existing notifier.
            </p>
            <ul className="check-list">
              <li>Atomic, private JSON state</li>
              <li>Exact child exit and signal behavior</li>
              <li>Idempotent install and scoped uninstall</li>
              <li>Manual doctor, status, preview, and reset</li>
            </ul>
          </div>
          <div
            aria-label="Side Glance setup commands"
            className="command-panel"
            role="region"
          >
            <div className="command-panel-head">
              <span>terminal</span>
              <span className="command-beta">public beta · v0.1</span>
            </div>
            <div className="command-block">
              <span className="command-comment">
                # install the public beta from npm
              </span>
              <code>
                <span>$</span> npm install -g side-glance@beta
              </code>
            </div>
            <div className="command-block">
              <span className="command-comment">
                # supervise any coding CLI
              </span>
              <code>
                <span>$</span> side-glance run -- claude
              </code>
            </div>
            <div className="command-block">
              <span className="command-comment">
                # merge native hooks safely
              </span>
              <code>
                <span>$</span> side-glance install claude --json
              </code>
            </div>
            <div className="command-foot">
              <span aria-hidden="true" className="command-ready-dot" />
              No account. No daemon. No telemetry.
            </div>
          </div>
        </section>

        <section
          aria-labelledby="boundary-title"
          className="boundary-section section-wrap"
        >
          <div aria-hidden="true" className="boundary-visual">
            <div className="boundary-ring boundary-ring-one" />
            <div className="boundary-ring boundary-ring-two" />
            <div className="boundary-core">
              <SideGlanceMark />
            </div>
          </div>
          <div className="boundary-copy">
            <p className="section-kicker">The honest boundary</p>
            <h2 id="boundary-title">Recovery, not magic.</h2>
            <p>
              Normal session end, child exit, and forwarded signals clean up
              deterministically. A killed process, power loss, or dead terminal
              cannot run an exit callback, so Side Glance reconciles stale
              ownership on the next live controller action.
            </p>
            <div className="boundary-facts">
              <div>
                <strong>What Side Glance restores</strong>
                <span>
                  Its own terminal default and exact tmux option snapshot.
                </span>
              </div>
              <div>
                <strong>What no process can promise</strong>
                <span>A synchronous callback after SIGKILL or power loss.</span>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="faq-title"
          className="faq-section section-wrap"
        >
          <div className="section-heading faq-heading">
            <p className="section-kicker">Small print, in plain language</p>
            <h2 id="faq-title">Frequently asked questions</h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>
                Does Side Glance read my prompts or transcripts?
              </summary>
              <p>
                No. Adapters keep only provider, session, turn, lifecycle,
                confidence, timing, and terminal-target metadata. Unknown fields
                are discarded before persistence.
              </p>
            </details>
            <details>
              <summary>Why use a wrapper if my CLI has hooks?</summary>
              <p>
                Hooks provide semantic detail. The wrapper provides a stable
                terminal identity and a cleanup supervisor when the child
                process exits or receives a signal. They reinforce each other.
              </p>
            </details>
            <details>
              <summary>Will it overwrite my existing setup?</summary>
              <p>
                Installer updates are atomic and backed up. Existing hook groups
                and Codex notification commands remain intact; uninstall removes
                only commands carrying Side Glance&apos;s ownership marker.
              </p>
            </details>
            <details>
              <summary>What happens inside tmux?</summary>
              <p>
                Side Glance snapshots four per-window options and restores their
                exact local-or-inherited state. A whole terminal background
                remains shared by panes in the same client, so per-pane washes
                are not claimed.
              </p>
            </details>
            <details>
              <summary>Can it play a notification sound?</summary>
              <p>
                Yes, as an explicit opt-in. macOS supports a configurable
                installed sound; Linux sound is best-effort. Focus and system
                notification settings can still silence delivery, and a click
                cannot reliably select its originating iTerm tab or tmux pane.
              </p>
            </details>
          </div>
        </section>

        <section
          aria-labelledby="closing-title"
          className="closing-section section-wrap"
        >
          <SideGlanceMark />
          <h2 id="closing-title">
            Keep the work moving. Let the terminal ask for you.
          </h2>
          <div className="closing-actions">
            <a className="primary-action" href="#playground">
              Try the playground
            </a>
            <a
              className="text-action"
              href="https://github.com/AndrewUlloa/side-glance"
              rel="noreferrer"
              target="_blank"
            >
              Follow on GitHub ↗
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="section-wrap footer-inner">
          <a className="brand" href="#top">
            <SideGlanceMark />
            <span>Side Glance</span>
          </a>
          <p>Local-first attention for coding agents.</p>
          <div>
            <a href="https://github.com/AndrewUlloa/side-glance">GitHub</a>
            <a href="#setup">Setup</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SideGlanceMark() {
  return (
    <svg
      aria-hidden="true"
      className="side-glance-mark"
      focusable="false"
      viewBox="0 0 28 28"
    >
      <path d="M5.8 6.7h9.6a6.8 6.8 0 0 1 0 13.6H6.8" />
      <path d="m11.6 2.8-5.8 3.9 5.8 3.9" />
      <circle cx="19.6" cy="13.5" r="2.2" />
    </svg>
  );
}
