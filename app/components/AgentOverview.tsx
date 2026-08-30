"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";

import { HOME_PAGE_CONTENT } from "../lib/agent-content";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 * Read top-to-bottom. Each value is ms after entering view.
 *
 *    0ms   overview introduction rises 24px → 0 and fades in
 *  160ms   detail columns rise 20px → 0 (staggered 90ms)
 * reduced  all overview content remains visible without motion
 * ───────────────────────────────────────────────────────── */

const STAGE = {
  waiting: 0,
  introduction: 1,
  details: 2,
} as const;

const TIMING = {
  introduction: 0, // reveal the overview heading and lead copy
  details: 160, // follow with the two supporting columns
} as const;

const INTRODUCTION = {
  offsetY: 24, // px before the introduction settles
  spring: {
    type: "spring" as const,
    stiffness: 260,
    damping: 28,
    mass: 0.85,
  },
} as const;

const DETAILS = {
  offsetY: 20, // px before each supporting column settles
  stagger: 0.09, // seconds between supporting columns
  spring: {
    type: "spring" as const,
    stiffness: 280,
    damping: 30,
    mass: 0.82,
  },
  items: [
    {
      title: "When Side Glance helps",
      paragraphs: HOME_PAGE_CONTENT.sections[1].paragraphs,
    },
    {
      title: "How it fits your workflow",
      paragraphs: HOME_PAGE_CONTENT.sections[2].paragraphs,
    },
  ],
} as const;

const NO_MOTION = { duration: 0 } as const;

export function AgentOverview() {
  const rootRef = useRef<HTMLElement>(null);
  const isInView = useInView(rootRef, {
    once: true,
    margin: "0px 0px -12% 0px",
  });
  const shouldReduceMotion = useReducedMotion();
  const [stage, setStage] = useState<number>(STAGE.details);

  useLayoutEffect(() => {
    if (shouldReduceMotion) {
      setStage(STAGE.details);
      return;
    }

    if (!isInView) {
      setStage(STAGE.waiting);
      return;
    }

    const introductionTimer = setTimeout(
      () => setStage(STAGE.introduction),
      TIMING.introduction
    );
    const detailsTimer = setTimeout(
      () => setStage(STAGE.details),
      TIMING.details
    );

    return () => {
      clearTimeout(introductionTimer);
      clearTimeout(detailsTimer);
    };
  }, [isInView, shouldReduceMotion]);

  const introductionTransition =
    shouldReduceMotion || stage === STAGE.waiting
      ? NO_MOTION
      : INTRODUCTION.spring;
  const detailsTransition =
    shouldReduceMotion || stage === STAGE.waiting ? NO_MOTION : DETAILS.spring;

  return (
    <motion.section
      aria-labelledby="side-glance-overview"
      className="agent-overview"
      initial={false}
      ref={rootRef}
    >
      <motion.div
        animate={{
          opacity: stage >= STAGE.introduction ? 1 : 0,
          y: stage >= STAGE.introduction ? 0 : INTRODUCTION.offsetY,
        }}
        className="agent-overview-introduction"
        initial={false}
        transition={introductionTransition}
      >
        <h2 id="side-glance-overview">What Side Glance does</h2>
        {HOME_PAGE_CONTENT.sections[0].paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </motion.div>

      <div className="agent-overview-grid">
        {DETAILS.items.map((item, index) => (
          <motion.section
            animate={{
              opacity: stage >= STAGE.details ? 1 : 0,
              y: stage >= STAGE.details ? 0 : DETAILS.offsetY,
            }}
            initial={false}
            key={item.title}
            transition={{
              ...detailsTransition,
              delay:
                stage >= STAGE.details && !shouldReduceMotion
                  ? index * DETAILS.stagger
                  : 0,
            }}
          >
            <h2>{item.title}</h2>
            {item.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </motion.section>
        ))}
      </div>
    </motion.section>
  );
}
