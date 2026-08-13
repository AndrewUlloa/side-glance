"use client";

import { useLayoutEffect } from "react";

const animatedKeys = new Set<string>();
const heroKey = "signal-homepage-hero";

export function MotionOrchestrator() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const hasHash = window.location.hash.length > 1;
    const shouldAnimate =
      !reducedMotion.matches && !hasHash && !animatedKeys.has(heroKey);

    root.dataset.heroMotion = shouldAnimate ? "ready" : "settled";
    animatedKeys.add(heroKey);

    const settle = () => {
      root.dataset.heroMotion = "settled";
    };
    if (shouldAnimate) {
      window.addEventListener("scroll", settle, { once: true, passive: true });
    }

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      if (event.matches) {
        settle();
      }
    };
    reducedMotion.addEventListener("change", handleMotionPreference);

    return () => {
      window.removeEventListener("scroll", settle);
      reducedMotion.removeEventListener("change", handleMotionPreference);
      delete root.dataset.heroMotion;
    };
  }, []);

  return null;
}
