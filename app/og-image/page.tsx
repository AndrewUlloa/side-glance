import type { Metadata } from "next";
import Image from "next/image";

import { InteractiveClaudeTerminal } from "../components/InteractiveClaudeTerminal";
import "./og-image.css";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
  title: "Side Glance social image",
};

export default function OgImagePage() {
  return (
    <main
      aria-label="Side Glance social image preview"
      className="og-image-canvas"
    >
      <header className="og-image-brand">
        <Image
          alt=""
          aria-hidden="true"
          height={36}
          priority
          src="/side-glance-mark.svg"
          width={52}
        />
        <span>Side Glance</span>
      </header>

      <section className="og-image-main">
        <div className="og-image-copy">
          <h1>
            Long loops.
            <br />
            Short glances.
          </h1>
          <p>
            Know which loop needs judgment.
            <br />
            Let the others keep running.
          </p>
        </div>

        <div className="og-image-product-frame">
          <div className="og-image-terminal" inert>
            <InteractiveClaudeTerminal
              elapsedSeconds={1122}
              phase="completed"
              scenario="ready-long"
              terminalId="tmux_04"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
