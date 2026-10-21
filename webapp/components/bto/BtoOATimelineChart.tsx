"use client";

import { useEffect, useRef, useState } from "react";
import { addMonthsYm } from "@/lib/finance";

type Milestone = { month: number; label: string; tone: "muted" | "ink" | "gold" };

type Props = {
  /** Month-by-month pooled OA from computeBTO().pooledSeries. */
  series: { month: number; balance: number; due: number }[];
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

/** Pooled CPF OA against the next bill due, with milestone markers — sized to its container. */
export function BtoOATimelineChart({ series, todayYm, milestones, covered }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(720);

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

  return (
    <svg
      ref={ref}
      className="bto-pf-chart"
      viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img"
      aria-label="Projected CPF OA against bills due"
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
    </svg>
  );
}
