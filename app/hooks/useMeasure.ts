import { useCallback, useEffect, useRef, useState } from "react";

interface Bounds {
  width: number;
  height: number;
}

export function useMeasure<T extends HTMLElement = HTMLElement>(): [
  (node: T | null) => void,
  Bounds,
] {
  const [bounds, setBounds] = useState<Bounds>({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const disconnect = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
  }, []);

  const ref = useCallback(
    (node: T | null) => {
      disconnect();
      if (!node) {
        return;
      }

      const observer = new ResizeObserver(([entry]) => {
        setBounds({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      });

      observer.observe(node);
      observerRef.current = observer;
    },
    [disconnect]
  );

  useEffect(() => disconnect, [disconnect]);

  return [ref, bounds];
}
