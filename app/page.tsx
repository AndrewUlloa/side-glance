import { AgentOverview } from "./components/AgentOverview";
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
