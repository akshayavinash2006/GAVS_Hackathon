"use client";

import { useRef } from "react";
import { cn } from "@/lib/util";

/**
 * 3D tilt toward the pointer with a moving glare. Children marked `.depth`
 * float above the surface. Mouse/pen only: touch keeps native scrolling.
 * Don't put `.rise` on the same element (its fill-mode would pin transform).
 */
export function Tilt({ children, className, max = 7, style }: { children: React.ReactNode; className?: string; max?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || e.pointerType === "touch") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${((0.5 - py) * max).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((px - 0.5) * max).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
  }

  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  return (
    <div ref={ref} className={cn("tilt", className)} style={style} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
      <span aria-hidden className="tilt-glare" />
    </div>
  );
}
