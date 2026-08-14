"use client";

import { ReactLenis } from "lenis/react";

export function SmoothScroll() {
  return (
    <ReactLenis
      root
      options={{
        anchors: true,
        autoRaf: true,
        respectReducedMotion: true,
        stopInertiaOnNavigate: true,
      }}
    />
  );
}
