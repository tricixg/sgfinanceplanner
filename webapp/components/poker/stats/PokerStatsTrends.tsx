"use client";

import { useEffect, useMemo, useState } from "react";
import { Chart } from "react-chartjs-2";
import type {
  Chart as ChartJS,
  ChartOptions,
  ScriptableLineSegmentContext,
  TooltipModel,
} from "chart.js";
import { ensureChartsRegistered } from "@/components/chart-setup";
import {
  buildBankrollTrendSeries,
  filterTrendByRange,
  TREND_RANGES,
  trendCornerLabels,
  type BankrollTrendPoint,
  type TrendRange,
} from "@/lib/poker/bankroll-trend";
import type { PokerSession } from "@/lib/poker/types";
import { formatChartDate, formatPlPlain, formatSessionDate } from "@/components/poker/stats/format";

ensureChartsRegistered();

type Props = { sessions: PokerSession[] };

type SeriesState = {
  cash: boolean;
  tourney: boolean;
  total: boolean;
  fill: boolean;
};

const MOSS = "#2f5d3a";
const SKY = "#3d6b8e";
const RUST = "#b5482e";
const INK = "#11201a";

function tourneySegmentColor(ctx: ScriptableLineSegmentContext): string {
  const y0 = ctx.p0.parsed.y ?? 0;
  const y1 = ctx.p1.parsed.y ?? 0;
  if (y0 < 0 || y1 < 0) return "rgba(181,72,46,0.38)";
  return "rgba(61,107,142,0.14)";
}

function externalTooltipHandler(
  context: { chart: ChartJS; tooltip: TooltipModel<"line"> },
  points: BankrollTrendPoint[]
) {
  const { chart, tooltip } = context;
  const parent = chart.canvas.parentElement;
  if (!parent) return;

  let el = parent.querySelector<HTMLDivElement>(".poker-trend-tooltip");
  if (!el) {
    el = document.createElement("div");
    el.className = "poker-trend-tooltip";
    parent.appendChild(el);
  }

  if (tooltip.opacity === 0) {
    el.style.opacity = "0";
    return;
  }

  const idx = tooltip.dataPoints[0]?.dataIndex;
  if (idx == null || !points[idx]) {
    el.style.opacity = "0";
    return;
  }

  const p = points[idx]!;
  const tourneyClass = p.tourney < 0 ? "poker-trend-tooltip-neg" : "";
  el.innerHTML = `
    <div class="poker-trend-tooltip-date">${formatSessionDate(p.playedAt)}</div>
    <div>Cash: ${formatPlPlain(p.cash)}</div>
    <div>Total: ${formatPlPlain(p.total)}</div>
    <div class="${tourneyClass}">Tourney: ${formatPlPlain(p.tourney)}</div>
  `;

  positionTrendTooltip(el, parent, chart.canvas, tooltip.caretX, tooltip.caretY);
}

function positionTrendTooltip(
  el: HTMLDivElement,
  parent: HTMLElement,
  canvas: HTMLCanvasElement,
  caretX: number,
  caretY: number
) {
  const pad = 6;
  el.style.transform = "none";
  el.style.visibility = "hidden";
  el.style.opacity = "1";
  el.style.left = "0px";
  el.style.top = "0px";

  const tw = el.offsetWidth;
  const th = el.offsetHeight;
  const originX = canvas.offsetLeft + caretX;
  const originY = canvas.offsetTop + caretY;

  let left = originX - tw / 2;
  left = Math.max(pad, Math.min(left, parent.clientWidth - tw - pad));

  let top = originY - th - 10;
  if (top < pad) {
    top = originY + 14;
  }
  top = Math.max(pad, Math.min(top, parent.clientHeight - th - pad));

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.visibility = "visible";
}

export function PokerStatsTrends({ sessions }: Props) {
  const [range, setRange] = useState<TrendRange>("MAX");
  const [series, setSeries] = useState<SeriesState>({
    cash: true,
    tourney: true,
    total: true,
    fill: true,
  });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const allPoints = useMemo(() => buildBankrollTrendSeries(sessions), [sessions]);
  const points = useMemo(
    () => filterTrendByRange(allPoints, range),
    [allPoints, range]
  );

  const corners = useMemo(
    () =>
      trendCornerLabels(points, {
        cash: series.cash,
        tourney: series.tourney,
        total: series.total,
      }),
    [points, series.cash, series.tourney, series.total]
  );

  const chartData = useMemo(() => {
    if (points.length === 0) return null;

    const cashData = points.map((p) => ({ x: p.x, y: p.cash }));
    const tourneyData = points.map((p) => ({ x: p.x, y: p.tourney }));
    const totalData = points.map((p) => ({ x: p.x, y: p.total }));
    const xMin = points[0]!.x;
    const xMax = points[points.length - 1]!.x;

    const fillOpt = series.fill ? ({ target: "origin" as const }) : false;

    const datasets: ChartJS<"line">["data"]["datasets"] = [
      {
        label: "Zero",
        data: [
          { x: xMin, y: 0 },
          { x: xMax, y: 0 },
        ],
        borderColor: "rgba(17,32,26,0.35)",
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 10,
      },
    ];

    if (series.cash) {
      datasets.push({
        label: "Cash",
        data: cashData,
        borderColor: MOSS,
        backgroundColor: "rgba(47,93,58,0.12)",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: fillOpt,
        tension: 0,
        order: 1,
      });
    }

    if (series.tourney) {
      datasets.push({
        label: "Tourney",
        data: tourneyData,
        borderColor: SKY,
        backgroundColor: "rgba(61,107,142,0.14)",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: fillOpt,
        tension: 0,
        order: 2,
        segment: {
          backgroundColor: series.fill ? tourneySegmentColor : undefined,
          borderColor: (ctx: ScriptableLineSegmentContext) => {
            const y = ctx.p1.parsed.y ?? 0;
            return y < 0 ? RUST : SKY;
          },
        },
      });
    }

    if (series.total) {
      datasets.push({
        label: "Total",
        data: totalData,
        borderColor: INK,
        backgroundColor: "rgba(17,32,26,0.08)",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: fillOpt,
        tension: 0,
        order: 0,
      });
    }

    return { datasets };
  }, [points, series]);

  const options = useMemo((): ChartOptions<"line"> => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: "nearest",
        axis: "x",
        intersect: false,
      },
      layout: {
        padding: { left: 2, right: 6, top: 4, bottom: 20 },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: (ctx) => externalTooltipHandler(ctx, points),
        },
      },
      scales: {
        x: {
          type: "time",
          time: { tooltipFormat: "PP" },
          ticks: { display: false },
          grid: { display: false },
        },
        y: {
          ticks: {
            maxTicksLimit: isMobile ? 5 : 8,
            font: { size: isMobile ? 10 : 10.5 },
            callback: (v) => {
              const n = Number(v);
              const prefix = n < 0 ? "−" : "";
              return `${prefix}$${Math.abs(n).toFixed(0)}`;
            },
          },
          grid: { color: "rgba(220,212,189,0.65)" },
        },
      },
    };
  }, [points, isMobile]);

  useEffect(() => {
    console.info("[PokerStatsTrends] render", {
      sessions: sessions.length,
      points: points.length,
      range,
    });
  }, [sessions.length, points.length, range]);

  if (sessions.length === 0) {
    return <p className="note">No sessions logged yet. Log sessions to see bankroll trends.</p>;
  }

  if (points.length === 0) {
    return (
      <>
        <TrendControls
          range={range}
          series={series}
          onRange={setRange}
          onSeries={setSeries}
        />
        <p className="note">No sessions in this time range.</p>
      </>
    );
  }

  return (
    <>
      <TrendControls
        range={range}
        series={series}
        onRange={setRange}
        onSeries={setSeries}
      />
      <div className="card poker-trend-card">
        <div
          className={`poker-trend-chart-wrap${isMobile ? " poker-trend-chart-wrap--mobile" : ""}`}
        >
          {chartData ? (
            <Chart type="line" data={chartData} options={options} />
          ) : null}
          {corners.latestDate ? (
            <div className="poker-trend-corner poker-trend-corner--br">
              {formatChartDate(corners.latestDate)}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function TrendControls({
  range,
  series,
  onRange,
  onSeries,
}: {
  range: TrendRange;
  series: SeriesState;
  onRange: (r: TrendRange) => void;
  onSeries: (s: SeriesState) => void;
}) {
  return (
    <div className="poker-trend-controls">
      <div className="poker-trend-control-row">
        <span className="poker-trend-control-label">Range</span>
        <div className="poker-fx-segment poker-trend-segment" role="group" aria-label="Time range">
          {TREND_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              className={range === r ? "active" : undefined}
              onClick={() => {
                onRange(r);
                console.info("[PokerStatsTrends] range", r);
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="poker-trend-control-row">
        <span className="poker-trend-control-label">Series</span>
        <div className="poker-fx-segment poker-trend-segment" role="group" aria-label="Series toggles">
          {(
            [
              ["cash", "Cash"],
              ["tourney", "Tourney"],
              ["total", "Total"],
              ["fill", "Fill"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={series[key] ? "active" : undefined}
              onClick={() => {
                onSeries({ ...series, [key]: !series[key] });
                console.info("[PokerStatsTrends] toggle", key, !series[key]);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
