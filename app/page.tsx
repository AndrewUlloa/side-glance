import Image from "next/image";

import { AgentOverview } from "./components/AgentOverview";
import { GitHubAction } from "./components/GitHubAction";
import { InstallButton } from "./components/InstallButton";
import { LoadingSequence } from "./components/LoadingSequence";
import { MotionOrchestrator } from "./components/MotionOrchestrator";
import { SiteFooter } from "./components/SiteFooter";
import { TerminalShowcase } from "./components/TerminalShowcase";

export default function Home() {
  return (
    <>
      <MotionOrchestrator />
      <LoadingSequence />
      <div className="minimal-home gap-layout-stack px-site-gutter">
        <header className="minimal-header h-site-header">
          <a
            aria-label="Side Glance home"
            className="minimal-brand gap-brand-gap text-brand tracking-brand"
            href="/"
          >
            <Image
              alt=""
              aria-hidden="true"
              className="h-brand-mark-height w-brand-mark-width"
              height={24}
              priority
              src="/side-glance-mark.svg"
              width={35}
            />
            <span>Side Glance</span>
          </a>

          <div className="minimal-header-actions minimal-page-enter minimal-page-enter-actions gap-header-actions-gap">
            <InstallButton idleAriaLabel="install with Homebrew and run guided setup · public beta · v0.1" />

            <GitHubAction />
          </div>
        </header>

        <main className="minimal-hero gap-layout-stack">
          <div className="minimal-copy gap-hero-copy">
            <h1>
              <span className="minimal-page-enter minimal-page-enter-line-1">
                Long loops.
              </span>
              <br />
              <span className="minimal-page-enter minimal-page-enter-line-2">
                Short glances.
              </span>
            </h1>
            <p className="minimal-page-enter minimal-page-enter-description">
              Know which loop needs judgment.
              <br />
              Let the others keep running.
            </p>
          </div>

          <div className="minimal-page-enter minimal-page-enter-terminal">
            <TerminalShowcase />
          </div>
        </main>

        <AgentOverview />

        <SiteFooter />
      </div>
    </>
  );
}
