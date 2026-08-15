"use client";

import { useEffect, useState } from "react";

type AgentationComponent = typeof import("agentation").Agentation;

export function AgentationToolbar({ enabled }: { enabled: boolean }) {
  const [Agentation, setAgentation] = useState<AgentationComponent | null>(
    null
  );

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;
    import("agentation")
      .then((module) => {
        if (mounted) {
          setAgentation(() => module.Agentation);
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [enabled]);

  return Agentation ? <Agentation /> : null;
}
