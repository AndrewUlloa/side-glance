import Image from "next/image";

import { InstallButton } from "./components/InstallButton";
import { LoadingSequence } from "./components/LoadingSequence";
import { MotionOrchestrator } from "./components/MotionOrchestrator";
import { TerminalShowcase } from "./components/TerminalShowcase";

export default function Home() {
  return (
    <>
      <MotionOrchestrator />
      <LoadingSequence />
      <div className="minimal-home gap-layout-stack px-site-gutter pb-page-block">
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

            <a
              aria-label="View Side Glance on GitHub"
              className="minimal-github size-header-icon-button rounded-header-action"
              href="https://github.com/AndrewUlloa/side-glance"
              rel="noreferrer"
              target="_blank"
            >
              <svg
                aria-hidden="true"
                className="size-header-action-icon"
                viewBox="0 0 24 24"
              >
                <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.02c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.29-5.27-5.68 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A10.98 10.98 0 0 1 12 6.3c.98 0 1.95.13 2.86.39 2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.41-2.71 5.38-5.29 5.67.42.36.79 1.07.79 2.16v3.07c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
              </svg>
              <span className="sr-only">GitHub</span>
            </a>
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
      </div>
    </>
  );
}
