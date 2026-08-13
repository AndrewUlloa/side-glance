"use client";

import { useEffect } from "react";

const revealSelector = "[data-reveal]";

export function MotionOrchestrator() {
  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(revealSelector),
    );
    const reveal = (element: HTMLElement) => {
      element.dataset.revealed = "true";
    };
    const revealAll = () => elements.forEach(reveal);

    if (!("IntersectionObserver" in window)) {
      root.dataset.motion = "reduced";
      revealAll();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal(entry.target as HTMLElement);
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );

    if (reducedMotion.matches) {
      root.dataset.motion = "reduced";
      revealAll();
    } else {
      for (const element of elements) {
        if (element.getBoundingClientRect().top < window.innerHeight * 0.92) {
          reveal(element);
        }
      }
      root.dataset.motion = "ready";
      for (const element of elements) {
        if (element.dataset.revealed !== "true") {
          observer.observe(element);
        }
      }
    }

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      if (event.matches) {
        observer.disconnect();
        root.dataset.motion = "reduced";
        revealAll();
      } else {
        root.dataset.motion = "ready";
      }
    };
    reducedMotion.addEventListener("change", handleMotionPreference);

    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener("change", handleMotionPreference);
      delete root.dataset.motion;
    };
  }, []);

  return null;
}
