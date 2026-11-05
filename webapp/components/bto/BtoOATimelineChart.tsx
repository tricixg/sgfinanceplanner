"use client";

import { useEffect, useRef, useState } from "react";
import { addMonthsYm } from "@/lib/finance";
import { fmt, formatMonthLabel } from "@/lib/finance/helpers";

type Milestone = { month: number; label: string; tone: "muted" | "ink" | "gold" };

type SeriesPoint = {
  month: number;
  balance: number;
  due: number;
  /** Self/partner split at this month — to + po === balance. */
  to: number;
  po: number;
};

type Props = {
  /** Month-by-month pooled OA from computeBTO().pooledSeries, one entry per month. */
  series: SeriesPoint[];
  /** "YYYY-MM" for month 0 — used to place year ticks. */
  todayYm: string;
  milestones: Milestone[];
  covered: { month: number; due: number; label: string } | null;
};

const HEIGHT = 280;
const PAD = { l: 48, r: 14, t: 34, b: 26 };
const TONE: Record<Milestone["tone"], string> = {
  muted: "var(--muted)",
  ink: "var(--ink)",
  gold: "var(--gold)",
};

const fmtK = (v: number) => `$${Math.round(v / 1000)}k`;

const TIP_W = 150;
const TIP_PAD = 8;
const TIP_LINE_H = 14;
const TIP_H = TIP_PAD * 2 + TIP_LINE_H * 4 - 2;

/** Pooled CPF OA against the next bill due, with milestone markers and a
 * per-month hover tooltip showing the self/partner split — sized to its
 * container. */
export function BtoOATimelineChart({ series, todayYm, milestones, covered }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(720);
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(300, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (series.length < 2) return <svg ref={ref} className="bto-pf-chart" />;

  const horizon = series[series.length - 1].month || 1;
  const maxY = Math.max(...series.map((s) => Math.max(s.balance, s.due))) * 1.08 || 1;
  const x = (m: number) => PAD.l + (m / horizon) * (width - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / maxY) * (HEIGHT - PAD.t - PAD.b);

  const stepY = [20000, 50000, 100000, 200000].find((s) => maxY / s <= 6) ?? 500000;
  const yTicks: number[] = [];
  for (let v = 0; v <= maxY; v += stepY) yTicks.push(v);

  const yearTicks: { month: number; year: string }[] = [];
  for (let m = 0; m <= horizon; m++) {
    const ym = addMonthsYm(todayYm, m);
    if (ym.endsWith("-01")) yearTicks.push({ month: m, year: ym.slice(0, 4) });
  }

  const pts = series.map((s) => `${x(s.month).toFixed(1)},${y(s.balance).toFixed(1)}`);
  // Step line of the bill due next: flat at each level, vertical where it changes.
  let duePath = `M${x(series[0].month)},${y(series[0].due)}`;
  for (let i = 1; i < series.length; i++) {
    if (series[i].due !== series[i - 1].due) {
      duePath += ` L${x(series[i].month)},${y(series[i - 1].due)} L${x(series[i].month)},${y(series[i].due)}`;
    }
  }
  duePath += ` L${x(horizon)},${y(series[series.length - 1].due)}`;

  const narrow = width < 520;

  // series[m].month === m by construction (computeBTO pushes one contiguous
  // entry per month from 0 to the horizon), so the month value doubles as
  // the array index.
  const hovered = hoverMonth != null ? (series[hoverMonth] ?? null) : null;

  const monthFromPointerX = (clientX: number): number | null => {
    const svg = ref.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return null;
    const scaleX = width / rect.width;
    const px = (clientX - rect.left) * scaleX;
    const m = Math.round(((px - PAD.l) / (width - PAD.l - PAD.r)) * horizon);
    return Math.max(0, Math.min(horizon, m));
  };

  const handlePointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const m = monthFromPointerX(e.clientX);
    if (m != null) setHoverMonth(m);
  };
  const handlePointerLeave = () => setHoverMonth(null);

  let tipLeft = 0;
  let tipTop = PAD.t + 2;
  let selfPct = 50;
  if (hovered) {
    selfPct = hovered.balance > 0 ? Math.round((hovered.to / hovered.balance) * 100) : 50;
    const hoveredFracRight = hovered.month / horizon > 0.55;
    tipLeft = hoveredFracRight ? x(hovered.month) - TIP_W - 10 : x(hovered.month) + 10;
    tipLeft = Math.max(PAD.l, Math.min(width - PAD.r - TIP_W, tipLeft));
    tipTop = Math.max(PAD.t + 2, Math.min(HEIGHT - PAD.b - TIP_H, tipTop));
  }
  const partnerPct = 100 - selfPct;

  return (
    <svg
      ref={ref}
      className="bto-pf-chart"
      viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img"
      aria-label="Projected CPF OA against bills due, by month"
    >
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end">
            {fmtK(v)}
          </text>
        </g>
      ))}
      {yearTicks.map((t) => (
        <text key={t.month} x={x(t.month)} y={HEIGHT - 8} textAnchor="middle">
          {t.year}
        </text>
      ))}
      {milestones.map((ms, i) => {
        const frac = ms.month / horizon;
        const anchor = frac > 0.85 ? "end" : frac < 0.08 ? "start" : "middle";
        return (
          <g key={ms.label}>
            <line
              x1={x(ms.month)}
              x2={x(ms.month)}
              y1={PAD.t - 4}
              y2={HEIGHT - PAD.b}
              stroke={TONE[ms.tone]}
              strokeDasharray="3 3"
            />
            {!(narrow && ms.label === "Booking") && (
              <text className="ml" x={x(ms.month)} y={12 + (i % 2) * 12} textAnchor={anchor}>
                {ms.label}
              </text>
            )}
          </g>
        );
      })}
      <path
        d={`M${x(0)},${y(0)} L${pts.join(" L")} L${x(horizon)},${y(0)} Z`}
        fill="var(--moss)"
        fillOpacity={0.14}
      />
      <path d={`M${pts.join(" L")}`} fill="none" stroke="var(--moss)" strokeWidth={2.2} />
      <path d={duePath} fill="none" stroke="var(--rust)" strokeWidth={2} strokeDasharray="6 4" />
      {series.map((s) => (
        <circle
          key={s.month}
          cx={x(s.month)}
          cy={y(s.balance)}
          r={hoverMonth === s.month ? 4 : 2}
          fill={hoverMonth === s.month ? "var(--ink)" : "var(--moss)"}
          fillOpacity={hoverMonth === s.month ? 1 : 0.5}
        />
      ))}
      {covered && (
        <g>
          <circle
            cx={x(covered.month)}
            cy={y(covered.due)}
            r={5}
            fill="var(--card)"
            stroke="var(--moss)"
            strokeWidth={2.2}
          />
          <text
            className="ml"
            x={x(covered.month) + (covered.month / horizon > 0.6 ? -9 : 9)}
            y={y(covered.due) + 16}
            textAnchor={covered.month / horizon > 0.6 ? "end" : "start"}
          >
            {covered.label}
          </text>
        </g>
      )}
      {hovered && (
        <g pointerEvents="none">
          <line
            x1={x(hovered.month)}
            x2={x(hovered.month)}
            y1={PAD.t - 4}
            y2={HEIGHT - PAD.b}
            stroke="var(--ink)"
            strokeOpacity={0.25}
          />
          <rect
            x={tipLeft}
            y={tipTop}
            width={TIP_W}
            height={TIP_H}
            rx={4}
            fill="var(--card)"
            stroke="var(--line)"
          />
          <text className="ml" x={tipLeft + TIP_PAD} y={tipTop + TIP_PAD + 9}>
            {formatMonthLabel(addMonthsYm(todayYm, hovered.month))}
          </text>
          <text className="ml" x={tipLeft + TIP_PAD} y={tipTop + TIP_PAD + 9 + TIP_LINE_H}>
            Pooled {fmt(hovered.balance)}
          </text>
          <text className="ml" x={tipLeft + TIP_PAD} y={tipTop + TIP_PAD + 9 + TIP_LINE_H * 2}>
            You {fmt(hovered.to)} ({selfPct}%)
          </text>
          <text className="ml" x={tipLeft + TIP_PAD} y={tipTop + TIP_PAD + 9 + TIP_LINE_H * 3}>
            Partner {fmt(hovered.po)} ({partnerPct}%)
          </text>
        </g>
      )}
      <rect
        x={PAD.l}
        y={PAD.t}
        width={width - PAD.l - PAD.r}
        height={HEIGHT - PAD.t - PAD.b}
        fill="transparent"
        pointerEvents="all"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{ cursor: "crosshair" }}
      />
    </svg>
  );
}
