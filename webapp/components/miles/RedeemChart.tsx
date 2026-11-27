"use client";

import type { ReactNode } from "react";
import { monthLabel, monthShort } from "@/lib/miles/months";
import { MILES_PROGRAMS, PROGRAM_ORDER, programColor } from "@/lib/miles/programs";
import { eventsInMonth, type PlanResult } from "@/lib/miles/plan";
import { ChartTip, TipRow, useChartTip, useElementWidth } from "@/components/miles/chart-helpers";
import { fmt, fmtK } from "@/components/miles/format";

type Props = {
  plan: PlanResult;
  /** Same months with no conversions, for the "if you never convert" line. */
  base: PlanResult;
  targetMiles: number;
  targetLabel: string;
};

const L = 48;
const R = 14;
const T = 22;
const MAIN_H = 250;
const GAP = 34;
const CHANGE_H = 78;
const B = 26;

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
  const n = v / p;
  const step = [1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => n <= s) ?? 10;
  return step * p;
}

/** Top-rounded bar segment (only the top of a stack is rounded). */
function topRounded(x: number, y1: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  const y0 = y1 + h;
  return `M${x},${y0}V${y1 + rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 + rr}V${y0}Z`;
}

/**
 * Miles you could redeem each month, stacked by where they came from, with
 * the never-convert line, the award target and a month-on-month change strip.
 */
export function RedeemChart({ plan, base, targetMiles, targetLabel }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>(680);
  const { tip, show, hide } = useChartTip();
  const m = plan.months;
  const n = m.length;
  if (!n) return <div ref={ref} />;

  const height = T + MAIN_H + GAP + CHANGE_H + B;
  const plotW = width - L - R;
  const bw = plotW / n;
  const barW = Math.max(4, bw - 3);
  const yMax = niceMax(Math.max(targetMiles, ...m.map((r) => r.total), ...base.months.map((r) => r.total), 1000) * 1.08);
  const Y = (v: number) => T + MAIN_H - (v / yMax) * MAIN_H;
  const xi = (i: number) => L + i * bw;
  const peak = Math.max(...m.map((r) => r.total));
  const peakIdx = m.findIndex((r) => r.total === peak);
  const change = m.map((r, i) => (i ? r.total - m[i - 1].total : 0));
  const cMax = Math.max(1000, ...change.map(Math.abs));
  const cTop = T + MAIN_H + GAP;
  const c0 = cTop + CHANGE_H / 2;
  const CY = (v: number) => c0 - (v / cMax) * (CHANGE_H / 2);
  const step = bw < 14 ? 6 : 3;

  const bars: ReactNode[] = [];
  m.forEach((r, i) => {
    let acc = 0;
    const x = xi(i) + (bw - barW) / 2;
    const top = PROGRAM_ORDER.filter((p) => r.byProgram[p] > 0).at(-1);
    for (const p of PROGRAM_ORDER) {
      const v = r.byProgram[p];
      if (v <= 0) continue;
      const y1 = Y(acc + v);
      const h = Math.max(0, Y(acc) - y1);
      bars.push(
        p === top ? (
          <path key={`${i}-${p}`} d={topRounded(x, y1, barW, h, 3)} fill={programColor(p)} className="mt-seg" />
        ) : (
          <rect key={`${i}-${p}`} x={x} y={y1} width={barW} height={h} fill={programColor(p)} className="mt-seg" />
        )
      );
      acc += v;
    }
  });

  let basePath = "";
  base.months.forEach((r, i) => {
    const yy = Y(r.total);
    basePath += i ? `H${xi(i)}V${yy}` : `M${xi(0)},${yy}`;
  });
  basePath += `H${xi(n)}`;

  const tipFor = (i: number) => {
    const r = m[i];
    const events = eventsInMonth(plan, r.month);
    const c = change[i];
    return (
      <>
        <div className="mt-tip-head">{monthLabel(r.month)}</div>
        {PROGRAM_ORDER.filter((p) => r.byProgram[p] > 0).map((p) => (
          <TipRow key={p} label={MILES_PROGRAMS[p].short} value={fmt(r.byProgram[p])} color={programColor(p)} />
        ))}
        <TipRow label="Ready to redeem" value={fmt(r.total)} total />
        <TipRow
          label="Change"
          value={<span className={c > 0 ? "pos" : c < 0 ? "neg" : ""}>{i ? `${c > 0 ? "+" : c < 0 ? "−" : ""}${fmt(Math.abs(c))}` : "—"}</span>}
        />
        <TipRow label="If you never convert" value={fmt(base.months[i].total)} />
        {events.length ? <div className="mt-tip-note">{events.join(" · ")}</div> : null}
      </>
    );
  };

  const peakX = Math.min(Math.max(xi(peakIdx) + bw / 2, L + 30), width - R - 40);
  const targetY = Y(targetMiles);

  return (
    <div ref={ref} className="mt-chart-wrap">
      <svg
        className="mt-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="KrisFlyer miles you could redeem each month"
      >
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (yMax * k) / 4;
          return (
            <g key={k}>
              <line x1={L} x2={width - R} y1={Y(v)} y2={Y(v)} className="mt-grid" />
              <text x={L - 8} y={Y(v) + 4} textAnchor="end">{fmtK(v)}</text>
            </g>
          );
        })}
        {bars}
        <text x={peakX} y={Y(peak) - 8} textAnchor={peakIdx < 3 ? "start" : "middle"} className="mt-strong mt-halo">
          Peak {fmtK(peak)}
        </text>
        <path d={basePath} className="mt-base-line" />
        <line x1={L} x2={width - R} y1={targetY} y2={targetY} className="mt-target-line" />
        <text x={width - R} y={targetY - 6} textAnchor="end" className="mt-ink mt-halo">
          {targetLabel} · {fmtK(targetMiles)}
        </text>

        <text x={L} y={cTop - 10} className="mt-ink mt-strong">Change from the month before</text>
        <line x1={L} x2={width - R} y1={c0} y2={c0} className="mt-axis" />
        <text x={L - 8} y={cTop + 8} textAnchor="end">+{fmtK(cMax)}</text>
        <text x={L - 8} y={cTop + CHANGE_H} textAnchor="end">{`−${fmtK(cMax)}`}</text>
        {change.map((v, i) =>
          v ? (
            <rect
              key={i}
              x={xi(i) + (bw - barW) / 2}
              y={Math.min(CY(v), c0)}
              width={barW}
              height={Math.max(1.5, Math.abs(CY(v) - c0))}
              rx={2}
              className={v > 0 ? "mt-gain" : "mt-loss"}
            />
          ) : null
        )}

        {m.map((r, i) =>
          i === 0 || r.month % step === 0 ? (
            <text key={r.month} x={xi(i) + bw / 2} y={height - 8} textAnchor="middle" className={i === 0 ? "mt-strong" : undefined}>
              {i === 0 ? "Now" : monthShort(r.month)}
            </text>
          ) : null
        )}

        {m.map((r, i) => (
          <rect
            key={`hit-${r.month}`}
            x={xi(i)}
            y={T}
            width={bw}
            height={MAIN_H + GAP + CHANGE_H}
            className="mt-hit"
            onMouseMove={(e) => show(tipFor(i), e)}
            onMouseLeave={hide}
          />
        ))}
      </svg>
      <ChartTip tip={tip} />
    </div>
  );
}
