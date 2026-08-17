"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";

const THEME_STORAGE_KEY = "side-glance-theme";
const THEME_EVENT = "side-glance-theme-change";

const ICON_MOTION = {
  initial: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  transition: { type: "spring" as const, duration: 0.3, bounce: 0 },
  reducedTransition: { duration: 0 },
} as const;

function getTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

export function ThemeToggle() {
  const shouldReduceMotion = useReducedMotion();
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, () => "dark");

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    const root = document.documentElement;

    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The in-document theme still works when storage is unavailable.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <motion.button
      aria-label="Toggle color theme"
      aria-pressed={theme === "light"}
      className="theme-toggle"
      onClick={toggleTheme}
      title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      type="button"
      whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          animate={ICON_MOTION.animate}
          aria-hidden="true"
          className="theme-toggle-icon"
          exit={shouldReduceMotion ? undefined : ICON_MOTION.exit}
          initial={shouldReduceMotion ? false : ICON_MOTION.initial}
          key={theme}
          transition={
            shouldReduceMotion
              ? ICON_MOTION.reducedTransition
              : ICON_MOTION.transition
          }
        >
          {theme === "light" ? <MoonIcon /> : <SunIcon />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 1.75v1.5M10 16.75v1.5M1.75 10h1.5M16.75 10h1.5M4.17 4.17l1.06 1.06M14.77 14.77l1.06 1.06M15.83 4.17l-1.06 1.06M5.23 14.77l-1.06 1.06" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path d="M16.8 12.37A7.25 7.25 0 0 1 7.63 3.2 7.25 7.25 0 1 0 16.8 12.37Z" />
    </svg>
  );
}
