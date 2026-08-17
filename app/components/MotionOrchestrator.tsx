"use client";

import { useLayoutEffect } from "react";

import { LINEAR_MOTION } from "../lib/motion-tokens";

const PAGE_REVEAL_EVENT = "side-glance:loading-complete";
const PAGE_ACTION_LEAD =
  LINEAR_MOTION.lineTwoDelay - LINEAR_MOTION.lineOneDelay;
const PAGE_REVEAL_DURATION_MS =
  (LINEAR_MOTION.illustrationDelay -
    LINEAR_MOTION.lineOneDelay +
    PAGE_ACTION_LEAD +
    LINEAR_MOTION.illustrationDuration) *
  1000;

let hasRevealedPage = false;

export function MotionOrchestrator() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hasHash = window.location.hash.length > 1;
    const shouldAnimate = !(
      reducedMotion.matches ||
      hasHash ||
      hasRevealedPage
    );
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = () => {
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
      root.dataset.pageMotion = "settled";
      hasRevealedPage = true;
    };

    const reveal = () => {
      if (!shouldAnimate || reducedMotion.matches) {
        settle();
        return;
      }

      root.dataset.pageMotion = "ready";
      hasRevealedPage = true;
      settleTimer = setTimeout(settle, PAGE_REVEAL_DURATION_MS);
    };

    root.dataset.pageMotion = shouldAnimate ? "pending" : "settled";
    window.addEventListener(PAGE_REVEAL_EVENT, reveal, { once: true });

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      if (event.matches) {
        settle();
      }
    };
    reducedMotion.addEventListener("change", handleMotionPreference);

    return () => {
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
      window.removeEventListener(PAGE_REVEAL_EVENT, reveal);
      reducedMotion.removeEventListener("change", handleMotionPreference);
      delete root.dataset.pageMotion;
    };
  }, []);

  return null;
}
