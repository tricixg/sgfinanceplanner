"use client";

import { useId, type ReactNode } from "react";
import {
  expiryDateLabel,
  monthLabel,
  monthShort,
  quarterLabel,
  yearOf,
  type MonthIndex,
} from "@/lib/miles/months";
import { MILES_PROGRAMS, PROGRAM_ORDER, programColor, type MilesProgram } from "@/lib/miles/programs";
import type { PlanResult } from "@/lib/miles/plan";
import { avail, type MilesLot } from "@/lib/miles/types";
import { ChartTip, TipRow, useChartTip, useElementWidth } from "@/components/miles/chart-helpers";
import { fmt } from "@/components/miles/format";

type Props = {
  lots: MilesLot[];
  plan: PlanResult;
  now: MonthIndex;
  end: MonthIndex;
  /** Day of the month today, to place the Today line. */
  day: number;
};

type Row =
  | { head: true; program: MilesProgram }
  | { head: false; program: MilesProgram; lot: MilesLot };

const LABEL_W = 170;
const RIGHT_W = 150;
const TOP = 26;
const ROW_H = 24;
const HEAD_H = 26;

function earnedLabel(lot: MilesLot): string {
  if (lot.earnedMonth === null || lot.program === "dbs_altitude") return "Balance";
  return MILES_PROGRAMS[lot.program].quarterly ? quarterLabel(lot.earnedMonth) : monthLabel(lot.earnedMonth);
}

/**
 * One bar per lot, from the month earned to the month it expires. A diamond
 * marks a planned conversion; the hatched bar after it is the 36-month
 * KrisFlyer life those points get. Altitude shows as one no-expiry balance.
 */
export function ValidityTimeline({ lots, plan, now, end, day }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>(760);
  const { tip, show, hide } = useChartTip();
  const hatchId = `mt-hatch-${useId().replace(/:/g, "")}`;

  const rows: Row[] = [];
  for (const p of PROGRAM_ORDER) {
    let list = lots
      .filter((l) => l.program === p && avail(l) > 0 && (l.expiryMonth === null || l.expiryMonth >= now))
      .sort((a, b) => (a.expiryMonth ?? Infinity) - (b.expiryMonth ?? Infinity) || (a.earnedMonth ?? 0) - (b.earnedMonth ?? 0));
    if (!list.length) continue;
    if (p === "dbs_altitude") {
      const total = list.reduce((s, l) => s + avail(l), 0);
      list = [{ ...list[0], id: "altitude-total", amount: total, used: 0, earnedMonth: null, expiryMonth: null, note: "" }];
    }
    rows.push({ head: true, program: p });
    for (const lot of list) rows.push({ head: false, program: p, lot });
  }

  if (!rows.length) {
    return (
      <div ref={ref} className="mt-empty-chart">
        Log your points below and each lot appears here with its expiry.
      </div>
    );
  }

  const starts = rows.flatMap((r) => (!r.head && r.lot.earnedMonth !== null ? [r.lot.earnedMonth] : []));
  const x0 = Math.min(now - 3, ...starts);
  const x1 = end + 1;
  const plotW = width - LABEL_W - RIGHT_W;
  const X = (m: number) => LABEL_W + ((m - x0) / (x1 - x0)) * plotW;
  const height = TOP + rows.reduce((s, r) => s + (r.head ? HEAD_H : ROW_H), 0) + 8;
  const todayX = X(now + Math.min(day, 30) / 31);

  const years: number[] = [];
  for (let y = yearOf(x0) + 1; y <= yearOf(x1); y++) {
    const xx = X(y * 12);
    if (xx > LABEL_W && xx < LABEL_W + plotW) years.push(y);
  }

  let y = TOP;
  const body: ReactNode[] = [];
  for (const r of rows) {
    if (r.head) {
      body.push(
        <g key={`h-${r.program}`}>
          <text x={0} y={y + 17} className="mt-strong">{MILES_PROGRAMS[r.program].name}</text>
          <text x={LABEL_W} y={y + 17}>{MILES_PROGRAMS[r.program].rule}</text>
        </g>
      );
      y += HEAD_H;
      continue;
    }
    const { lot, program } = r;
    const rule = MILES_PROGRAMS[program];
    const cy = y + ROW_H / 2;
    const color = programColor(program);
    const left = avail(lot);
    const label = earnedLabel(lot);
    const start = lot.earnedMonth ?? x0;
    const xa = X(start);
    const fate = plan.fates[lot.id];
    const rowsTip: ReactNode[] = [
      <TipRow key="e" label="Earned" value={label} />,
      <TipRow key="a" label={lot.used ? "Left" : "Amount"} value={`${fmt(left)} ${rule.unit}`} />,
    ];
    if (lot.used) rowsTip.push(<TipRow key="u" label="Already used" value={fmt(lot.used)} />);
    let marks: ReactNode;
    let hitW: number;

    if (lot.expiryMonth === null) {
      const xb = LABEL_W + plotW;
      marks = (
        <>
          <rect x={xa} y={cy - 6} width={xb - xa} height={12} rx={4} fill={color} opacity={0.9} />
          <text x={xb + 6} y={cy + 4} className="mt-ink">No expiry</text>
        </>
      );
      rowsTip.push(<TipRow key="x" label="Expires" value="Never" />);
      rowsTip.push(<div key="m" className="mt-tip-note">Convert in 5,000-point blocks when you book.</div>);
      hitW = xb - xa;
    } else {
      const xe = X(lot.expiryMonth + 1);
      rowsTip.push(<TipRow key="x" label={fate?.converted ? "Card expiry" : "Expires"} value={expiryDateLabel(lot.expiryMonth)} />);
      if (fate && fate.converted > 0 && fate.convertedAt !== null) {
        const xc = X(fate.convertedAt + 0.5);
        const xn = X(fate.convertedAt + 37);
        const leftOver = fate.remaining > 0 && lot.expiryMonth <= end;
        marks = (
          <>
            <rect x={xc} y={cy - 4} width={xn - xc} height={8} rx={3} fill={`url(#${hatchId})`} />
            <rect x={xa} y={cy - 6} width={Math.max(2, xc - xa)} height={12} rx={4} fill={color} />
            {xe > xc ? <rect x={xc} y={cy - 6} width={xe - xc} height={12} rx={4} fill={color} opacity={0.28} /> : null}
            <rect x={xc - 5} y={cy - 5} width={10} height={10} transform={`rotate(45 ${xc} ${cy})`} className="mt-diamond" />
            {leftOver ? <circle cx={xe} cy={cy} r={4} className="mt-risk-dot" /> : null}
            <text x={xn + 6} y={cy + 4} className="mt-ink">
              {leftOver ? `${fmt(fate.remaining)} expire ${monthShort(lot.expiryMonth)}` : `→ ${monthShort(fate.convertedAt + 36)}`}
            </text>
          </>
        );
        rowsTip.push(<TipRow key="c" label="Convert" value={`${fmt(fate.converted)} in ${monthLabel(fate.convertedAt)}`} />);
        rowsTip.push(<TipRow key="n" label="New expiry" value={expiryDateLabel(fate.convertedAt + 36)} />);
        if (leftOver) {
          rowsTip.push(
            <div key="m" className="mt-tip-note">
              {fmt(fate.remaining)} points don&apos;t fit in a 5,000 block and expire unless you earn more first.
            </div>
          );
        }
        hitW = Math.max(xn, xe) - xa;
      } else {
        const lost = program !== "krisflyer" && lot.expiryMonth <= end;
        marks = (
          <>
            <rect x={xa} y={cy - 6} width={Math.max(3, xe - xa)} height={12} rx={4} fill={color} />
            {lost ? <circle cx={xe} cy={cy} r={4} className="mt-risk-dot" /> : null}
            <text x={xe + 8} y={cy + 4} className="mt-ink">
              {`expires ${monthShort(lot.expiryMonth)}${lost ? " · below 5,000" : ""}`}
            </text>
          </>
        );
        if (lot.convertedFrom) {
          rowsTip.push(<div key="f" className="mt-tip-note">Converted from {MILES_PROGRAMS[lot.convertedFrom].name}.</div>);
        }
        if (lost) {
          rowsTip.push(
            <div key="m" className="mt-tip-note">
              Not enough points for a 5,000 block by then. Earn more before {monthLabel(lot.expiryMonth)} to convert them.
            </div>
          );
        }
        hitW = xe - xa;
      }
    }

    const tipContent = (
      <>
        <div className="mt-tip-head">{rule.name}</div>
        {rowsTip}
      </>
    );
    body.push(
      <g key={lot.id}>
        <text x={0} y={cy + 4} className="mt-ink">{label}</text>
        <text x={LABEL_W - 10} y={cy + 4} textAnchor="end" className="mt-ink">{fmt(left)}</text>
        {marks}
        <rect
          x={xa}
          y={cy - 10}
          width={Math.max(hitW, 12)}
          height={20}
          fill="transparent"
          onMouseMove={(e) => show(tipContent, e)}
          onMouseLeave={hide}
        />
      </g>
    );
    y += ROW_H;
  }

  return (
    <div ref={ref} className="mt-chart-wrap">
      <svg
        className="mt-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="When each lot of points expires, and when to convert it"
      >
        <defs>
          <pattern id={hatchId} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={6} height={6} fill={programColor("krisflyer")} opacity={0.28} />
            <line x1={0} y1={0} x2={0} y2={6} stroke={programColor("krisflyer")} strokeWidth={2} opacity={0.55} />
          </pattern>
        </defs>
        {years.map((yy) => (
          <g key={yy}>
            <line x1={X(yy * 12)} x2={X(yy * 12)} y1={TOP - 8} y2={height - 4} className="mt-grid" />
            <text x={X(yy * 12) + 4} y={TOP - 12}>{yy}</text>
          </g>
        ))}
        <line x1={todayX} x2={todayX} y1={TOP - 8} y2={height - 4} className="mt-today" />
        {body}
        <text x={todayX + 4} y={height - 6} className="mt-strong mt-halo">Today</text>
      </svg>
      <ChartTip tip={tip} />
    </div>
  );
}
