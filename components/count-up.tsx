"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Animates a number from 0 to `value` once, on mount. Respects reduced motion. */
export function CountUp({ value, prefix = "", duration = 900 }: { value: number; prefix?: string; duration?: number }) {
  const [n, setN] = useState(value);
  const started = useRef(false);

  // Layout effect: reset to 0 before first paint so the server-rendered value doesn't flash.
  useLayoutEffect(() => {
    if (started.current) {
      setN(value);
      return;
    }
    started.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setN(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <>
      {prefix}
      {n.toLocaleString("en-IN")}
    </>
  );
}
