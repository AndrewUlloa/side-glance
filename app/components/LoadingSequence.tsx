"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { LINEAR_MOTION } from "../lib/motion-tokens";
import { SITE_ASSETS } from "../lib/site-assets";

const LIFE_SCENES = SITE_ASSETS.loadingLife;

const SECOND_IN_MS = 1000;
const PAGE_REVEAL_EVENT = "side-glance:loading-complete";
const LOADER_IMAGE_DELAY =
  LINEAR_MOTION.interactionDuration + LINEAR_MOTION.shineDuration;

const LOADER_VARIANTS = {
  exit: {
    opacity: 0,
    transition: {
      duration: LINEAR_MOTION.loaderImageDuration,
      ease: LINEAR_MOTION.illustrationEase,
      when: "afterChildren" as const,
    },
  },
  visible: { opacity: 1 },
} as const;

const GRID_VARIANTS = {
  exit: {
    transition: {
      staggerChildren: LINEAR_MOTION.loaderImageStagger / 2,
      staggerDirection: -1,
    },
  },
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: LOADER_IMAGE_DELAY,
      staggerChildren: LINEAR_MOTION.loaderImageStagger,
    },
  },
} as const;

const IMAGE_VARIANTS = {
  exit: {
    filter: "blur(4px)",
    opacity: 0,
    scale: 0.985,
    y: -16,
    transition: {
      duration: LINEAR_MOTION.loaderImageDuration,
      ease: LINEAR_MOTION.illustrationEase,
    },
  },
  hidden: {
    filter: "blur(4px)",
    opacity: 0,
    scale: 0.985,
    y: LINEAR_MOTION.loaderImageLift,
  },
  visible: {
    filter: "blur(0px)",
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: LINEAR_MOTION.loaderImageDuration,
      ease: LINEAR_MOTION.illustrationEase,
    },
  },
} as const;

const BRAND_VARIANTS = {
  exit: {
    filter: "blur(3px)",
    opacity: 0,
    scale: 0.985,
    transition: {
      duration: LINEAR_MOTION.interactionDuration,
      ease: LINEAR_MOTION.interactionEase,
    },
  },
  hidden: { filter: "blur(3px)", opacity: 0, scale: 0.985 },
  visible: {
    filter: "blur(0px)",
    opacity: 1,
    scale: 1,
    transition: {
      duration: LINEAR_MOTION.shineDuration,
      ease: LINEAR_MOTION.copyEase,
    },
  },
} as const;

let hasPlayedLoadingSequence = false;

export function LoadingSequence() {
  const rootRef = useRef<HTMLDivElement>(null);
  const previousOverflowRef = useRef("");
  const [stage, setStage] = useState<"brand" | "images">("brand");
  const [isVisible, setIsVisible] = useState(true);
  const shouldReduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.loadingStage = stage;

    return () => {
      if (root.dataset.loadingStage === stage) {
        delete root.dataset.loadingStage;
      }
    };
  }, [stage]);

  const restorePageScroll = useCallback(() => {
    document.body.style.overflow = previousOverflowRef.current;
  }, []);

  useEffect(() => {
    if (
      shouldReduceMotion ||
      hasPlayedLoadingSequence ||
      window.location.hash.length > 1
    ) {
      hasPlayedLoadingSequence = true;
      setIsVisible(false);
      restorePageScroll();
      return;
    }

    const root = rootRef.current;
    if (!root) {
      setIsVisible(false);
      return;
    }

    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let cancelled = false;
    let minimumBrandTimer: ReturnType<typeof setTimeout> | undefined;
    let assetTimeoutTimer: ReturnType<typeof setTimeout> | undefined;

    const minimumBrandTime = new Promise<void>((resolve) => {
      minimumBrandTimer = setTimeout(
        resolve,
        LINEAR_MOTION.shineDuration * SECOND_IN_MS
      );
    });
    const assetTimeout = new Promise<void>((resolve) => {
      assetTimeoutTimer = setTimeout(
        resolve,
        LINEAR_MOTION.loaderAssetTimeout * SECOND_IN_MS
      );
    });
    const images = Array.from(
      root.querySelectorAll<HTMLImageElement>("[data-loading-life-image]")
    );
    const decodedImages = Promise.all(
      images.map((image) => image.decode().catch(() => undefined))
    ).then(() => undefined);

    Promise.all([
      minimumBrandTime,
      Promise.race([decodedImages, assetTimeout]),
    ]).then(() => {
      if (!cancelled) {
        setStage("images");
      }
    });

    return () => {
      cancelled = true;
      if (minimumBrandTimer) {
        clearTimeout(minimumBrandTimer);
      }
      if (assetTimeoutTimer) {
        clearTimeout(assetTimeoutTimer);
      }
      restorePageScroll();
    };
  }, [restorePageScroll, shouldReduceMotion]);

  useEffect(() => {
    if (stage !== "images" || shouldReduceMotion) {
      return;
    }

    const imageSequenceDuration =
      LOADER_IMAGE_DELAY +
      LINEAR_MOTION.loaderImageStagger * (LIFE_SCENES.length - 1) +
      LINEAR_MOTION.loaderImageDuration +
      LINEAR_MOTION.loaderHoldDuration;
    const exitTimer = setTimeout(
      () => setIsVisible(false),
      imageSequenceDuration * SECOND_IN_MS
    );

    return () => clearTimeout(exitTimer);
  }, [shouldReduceMotion, stage]);

  const finishSequence = () => {
    hasPlayedLoadingSequence = true;
    delete document.documentElement.dataset.loadingStage;
    restorePageScroll();
    window.dispatchEvent(new Event(PAGE_REVEAL_EVENT));
  };

  return (
    <AnimatePresence onExitComplete={finishSequence}>
      {isVisible ? (
        <motion.div
          animate="visible"
          aria-hidden="true"
          className="loading-sequence"
          exit="exit"
          initial="visible"
          key="side-glance-loading-sequence"
          ref={rootRef}
          variants={LOADER_VARIANTS}
        >
          <AnimatePresence initial={false}>
            {stage === "brand" ? (
              <motion.div
                animate="visible"
                className="loading-sequence-brand-stage"
                exit="exit"
                initial="hidden"
                key="loading-brand"
                variants={BRAND_VARIANTS}
              >
                <LoadingBrand />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <motion.div
            animate={stage === "images" ? "visible" : "hidden"}
            className="loading-sequence-shell px-site-gutter pb-page-block"
            initial="hidden"
            variants={GRID_VARIANTS}
          >
            <div className="loading-sequence-grid">
              {LIFE_SCENES.map((src) => (
                <motion.figure
                  className="loading-sequence-image"
                  key={src}
                  variants={IMAGE_VARIANTS}
                >
                  <Image
                    alt=""
                    data-loading-life-image
                    fill
                    priority
                    sizes="(max-width: 760px) 50vw, 42vw"
                    src={src}
                    unoptimized
                  />
                </motion.figure>
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function LoadingBrand() {
  return (
    <div className="loading-brand loading-brand-large">
      <Image
        alt=""
        className="loading-brand-mark"
        height={72}
        priority
        src="/side-glance-mark.svg"
        width={104}
      />
      <span>Side Glance</span>
    </div>
  );
}
