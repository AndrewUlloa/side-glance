"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { useMeasure } from "../hooks/useMeasure";

const INSTALL_COMMAND =
  "brew install AndrewUlloa/tap/side-glance\nside-glance init";

const SWAP_MOTION = {
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.94, filter: "blur(2px)" },
  initial: { opacity: 0, scale: 0.94, filter: "blur(2px)" },
  spring: {
    type: "spring" as const,
    visualDuration: 0.22,
    bounce: 0.12,
  },
  reduced: { duration: 0 },
} as const;

interface InstallButtonProps {
  idleAriaLabel: string;
}

export function InstallButton({ idleAriaLabel }: InstallButtonProps) {
  const [copied, setCopied] = useState(false);
  const [measureRef, bounds] = useMeasure<HTMLSpanElement>();
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(
    () => () => {
      if (resetRef.current) {
        clearTimeout(resetRef.current);
      }
    },
    []
  );

  const copyInstallCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
    } catch {
      return;
    }

    if (resetRef.current) {
      clearTimeout(resetRef.current);
    }
    setCopied(true);
    resetRef.current = setTimeout(() => setCopied(false), 1400);
  }, []);

  const label = copied ? "Copied setup" : "Install";
  const transition = shouldReduceMotion
    ? SWAP_MOTION.reduced
    : SWAP_MOTION.spring;
  const targetWidth = bounds.width > 0 ? Math.round(bounds.width) : "auto";

  return (
    <motion.button
      animate={{ width: targetWidth }}
      aria-label={copied ? "guided setup commands copied" : idleAriaLabel}
      className="minimal-install rounded-header-action text-header-action!"
      data-copied={copied}
      onClick={copyInstallCommand}
      title={copied ? INSTALL_COMMAND : `Copy ${INSTALL_COMMAND}`}
      transition={transition}
      type="button"
    >
      <span className="minimal-install-measure" ref={measureRef}>
        <span className="minimal-install-inner px-header-action-x py-header-action-y">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              animate={SWAP_MOTION.animate}
              aria-live="polite"
              className="minimal-install-state gap-header-action-gap"
              exit={shouldReduceMotion ? undefined : SWAP_MOTION.exit}
              initial={shouldReduceMotion ? false : SWAP_MOTION.initial}
              key={copied ? "copied" : "install"}
              transition={transition}
            >
              {copied ? <CheckIcon /> : <InstallIcon />}
              <span>{label}</span>
            </motion.span>
          </AnimatePresence>
        </span>
      </span>
    </motion.button>
  );
}

function InstallIcon() {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="size-header-action-icon"
      height={16}
      src="/install-icon.svg"
      width={16}
    />
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-header-action-icon"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path d="m5 12.5 4.25 4.25L19 7" />
    </svg>
  );
}
