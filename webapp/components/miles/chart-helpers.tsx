"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

/** Tracks an element's width (for SVG charts drawn to fit), never below `min`. */
export function useElementWidth<T extends HTMLElement>(min: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(min);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(min, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, width] as const;
}

type Tip = { content: ReactNode; x: number; y: number } | null;

/** Hover tooltip for SVG marks: call show() on mouse move, hide() on leave. */
export function useChartTip() {
  const [tip, setTip] = useState<Tip>(null);
  return {
    tip,
    show: (content: ReactNode, e: MouseEvent) => setTip({ content, x: e.clientX, y: e.clientY }),
    hide: () => setTip(null),
  };
}

export function ChartTip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const left = tip.x + 300 > vw ? Math.max(8, tip.x - 290) : tip.x + 14;
  const top = tip.y + 220 > vh ? Math.max(8, tip.y - 200) : tip.y + 14;
  return (
    <div className="mt-tip" role="tooltip" style={{ left, top }}>
      {tip.content}
    </div>
  );
}

/** One "label … value" line inside a tooltip. */
export function TipRow({
  label,
  value,
  color,
  total,
}: {
  label: string;
  value: ReactNode;
  color?: string;
  total?: boolean;
}) {
  return (
    <div className={`mt-tip-row${total ? " total" : ""}`}>
      <span>
        {color ? <i className="dot" style={{ background: color }} /> : null}
        {label}
      </span>
      <b>{value}</b>
    </div>
  );
}
