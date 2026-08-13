import { SignalPlayground } from "./components/SignalPlayground";

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
    status: "Fixture verified",
  },
  {
    name: "OpenCode",
    level: "Plugin events",
    detail: "Session status, idle, error, deletion, and permission events.",
    status: "Adapter ready",
  },
  {
    name: "Aider",
    level: "Completion + wrapper",
    detail: "Completion notification plus supervised process cleanup.",
    status: "Degraded native",
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
    copy: "Provider hooks report lifecycle metadata. Prompts, transcripts, and assistant messages never enter Signal state.",
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
    copy: "Signal verifies the TTY, snapshots its tmux options, paints the owned channels, and restores only what it changed.",
    code: "state → terminal + tmux",
  },
] as const;

export default function Home() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <nav className="nav-wrap" aria-label="Primary navigation">
          <a className="brand" href="#top" aria-label="Signal home">
            <SignalMark />
            <span>signal</span>
          </a>
          <div className="nav-links">
            <a href="#how-it-works">How it works</a>
            <a href="#coverage">Coverage</a>
            <a href="#setup">Setup</a>
          </div>
          <a
            className="nav-github"
            href="https://github.com/AndrewUlloa/terminal-signal"
            target="_blank"
            rel="noreferrer"
          >
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <main id="top">
        <section className="hero section-wrap" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="pulse-dot" aria-hidden="true" />
              Local-first attention layer
            </div>
            <h1 id="hero-title">Your terminal knows when it needs you.</h1>
            <p className="hero-lede">
              Signal turns coding-agent lifecycle events into a quiet, thermal
              status layer across terminal backgrounds and tmux—without reading
              your work.
            </p>
            <div className="hero-actions">
              <a className="primary-action" href="#playground">
                Try the signal <span aria-hidden="true">↓</span>
              </a>
              <a className="text-action" href="#setup">
                See the setup
              </a>
            </div>
            <dl className="hero-proof" aria-label="Signal guarantees">
              <div>
                <dt>0</dt>
                <dd>prompt content stored</dd>
              </div>
              <div>
                <dt>6</dt>
                <dd>agent paths covered</dd>
              </div>
              <div>
                <dt>1</dt>
                <dd>shared state model</dd>
              </div>
            </dl>
          </div>

          <div id="playground" className="hero-playground">
            <SignalPlayground />
          </div>
        </section>

        <section className="trust-strip" aria-label="Supported coding agents">
          <div className="section-wrap trust-inner">
            <span>One signal for</span>
            <div className="agent-wordmarks" aria-label="Claude Code, Codex, Gemini CLI, OpenCode, Aider, and any CLI">
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
          id="how-it-works"
          className="story-section section-wrap"
          aria-labelledby="how-title"
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

        <section id="coverage" className="coverage-section">
          <div className="section-wrap coverage-wrap">
            <div className="section-heading coverage-heading">
              <p className="section-kicker">Coverage without pretending</p>
              <h2>Every CLI gets a baseline. Native hooks add fidelity.</h2>
              <p>
                Signal calls out the difference between a documented lifecycle
                event, a notification, and a wrapper observation.
              </p>
            </div>
            <div className="coverage-table" role="table" aria-label="Coding agent coverage">
              {providers.map((provider) => (
                <div className="coverage-row" role="row" key={provider.name}>
                  <div className="provider-name" role="cell">
                    <span className="provider-mark" aria-hidden="true">
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

        <section id="setup" className="setup-section section-wrap" aria-labelledby="setup-title">
          <div className="setup-copy">
            <p className="section-kicker">Start local</p>
            <h2 id="setup-title">Wrap any agent. Add native hooks when you want them.</h2>
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
          <div className="command-panel" aria-label="Signal setup commands">
            <div className="command-panel-head">
              <span>terminal</span>
              <span className="command-beta">release candidate · v0.1</span>
            </div>
            <div className="command-block">
              <span className="command-comment"># available after the first verified beta release</span>
              <code><span>$</span> npm install -g terminal-signal@beta</code>
            </div>
            <div className="command-block">
              <span className="command-comment"># supervise any coding CLI</span>
              <code><span>$</span> signal run -- claude</code>
            </div>
            <div className="command-block">
              <span className="command-comment"># merge native hooks safely</span>
              <code><span>$</span> signal install claude --json</code>
            </div>
            <div className="command-foot">
              <span className="command-ready-dot" aria-hidden="true" />
              No account. No daemon. No telemetry.
            </div>
          </div>
        </section>

        <section className="boundary-section section-wrap" aria-labelledby="boundary-title">
          <div className="boundary-visual" aria-hidden="true">
            <div className="boundary-ring boundary-ring-one" />
            <div className="boundary-ring boundary-ring-two" />
            <div className="boundary-core">
              <SignalMark />
            </div>
          </div>
          <div className="boundary-copy">
            <p className="section-kicker">The honest boundary</p>
            <h2 id="boundary-title">Recovery, not magic.</h2>
            <p>
              Normal session end, child exit, and forwarded signals clean up
              deterministically. A killed process, power loss, or dead terminal
              cannot run an exit callback, so Signal reconciles stale ownership
              on the next live controller action.
            </p>
            <div className="boundary-facts">
              <div>
                <strong>What Signal restores</strong>
                <span>Its own terminal default and exact tmux option snapshot.</span>
              </div>
              <div>
                <strong>What no process can promise</strong>
                <span>A synchronous callback after SIGKILL or power loss.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="faq-section section-wrap" aria-labelledby="faq-title">
          <div className="section-heading faq-heading">
            <p className="section-kicker">Small print, in plain language</p>
            <h2 id="faq-title">Frequently asked questions</h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>Does Signal read my prompts or transcripts?</summary>
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
                terminal identity and a cleanup supervisor when the child process
                exits or receives a signal. They reinforce each other.
              </p>
            </details>
            <details>
              <summary>Will it overwrite my existing setup?</summary>
              <p>
                Installer updates are atomic and backed up. Existing hook groups
                and Codex notification commands remain intact; uninstall removes
                only commands carrying Signal&apos;s ownership marker.
              </p>
            </details>
            <details>
              <summary>What happens inside tmux?</summary>
              <p>
                Signal snapshots four per-window options and restores their exact
                local-or-inherited state. A whole terminal background remains
                shared by panes in the same client, so per-pane washes are not
                claimed.
              </p>
            </details>
          </div>
        </section>

        <section className="closing-section section-wrap" aria-labelledby="closing-title">
          <SignalMark />
          <h2 id="closing-title">Keep the work moving. Let the terminal ask for you.</h2>
          <div className="closing-actions">
            <a className="primary-action" href="#playground">Try the playground</a>
            <a
              className="text-action"
              href="https://github.com/AndrewUlloa/terminal-signal"
              target="_blank"
              rel="noreferrer"
            >
              Follow on GitHub ↗
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="section-wrap footer-inner">
          <a className="brand" href="#top">
            <SignalMark />
            <span>signal</span>
          </a>
          <p>Local-first attention for coding agents.</p>
          <div>
            <a href="https://github.com/AndrewUlloa/terminal-signal">GitHub</a>
            <a href="#setup">Setup</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SignalMark() {
  return (
    <svg
      className="signal-mark"
      viewBox="0 0 28 28"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5.8 6.7h9.6a6.8 6.8 0 0 1 0 13.6H6.8" />
      <path d="m11.6 2.8-5.8 3.9 5.8 3.9" />
      <circle cx="19.6" cy="13.5" r="2.2" />
    </svg>
  );
}
