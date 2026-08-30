import Image from "next/image";

import { GitHubAction } from "./GitHubAction";
import { InstallButton } from "./InstallButton";

export function SiteHeader() {
  return (
    <header className="minimal-header h-site-header px-site-gutter">
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
  );
}
