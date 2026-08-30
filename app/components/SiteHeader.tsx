"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { GitHubAction } from "./GitHubAction";
import { InstallButton } from "./InstallButton";

const TOP_SCROLL_BOUNDARY = 16;
const HIDE_SCROLL_DELTA = 8;
const REVEAL_SCROLL_DELTA = 4;

export function SiteHeader() {
  const [isHidden, setIsHidden] = useState(false);
  const previousScrollY = useRef(0);
  const animationFrame = useRef<number | null>(null);

  const showHeader = useCallback(() => setIsHidden(false), []);

  useEffect(() => {
    previousScrollY.current = Math.max(0, window.scrollY);

    const updateHeader = () => {
      const currentScrollY = Math.max(0, window.scrollY);
      const scrollDelta = currentScrollY - previousScrollY.current;

      if (currentScrollY <= TOP_SCROLL_BOUNDARY) {
        showHeader();
        previousScrollY.current = currentScrollY;
      } else if (scrollDelta >= HIDE_SCROLL_DELTA) {
        setIsHidden(true);
        previousScrollY.current = currentScrollY;
      } else if (scrollDelta <= -REVEAL_SCROLL_DELTA) {
        showHeader();
        previousScrollY.current = currentScrollY;
      }

      animationFrame.current = null;
    };

    const handleScroll = () => {
      if (animationFrame.current === null) {
        animationFrame.current = requestAnimationFrame(updateHeader);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [showHeader]);

  return (
    <header
      className="minimal-header h-site-header px-site-gutter"
      data-scroll-state={isHidden ? "hidden" : "visible"}
      onFocusCapture={showHeader}
    >
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
        <InstallButton idleAriaLabel="install with Homebrew and run guided setup · stable · v0.1" />

        <GitHubAction />
      </div>
    </header>
  );
}
