"use client";

import { useMemo } from "react";
import { Chart } from "react-chartjs-2";
import { Chart as ChartJS, type ChartOptions, type Plugin } from "chart.js";
import { ensureChartsRegistered } from "@/components/chart-setup";

ensureChartsRegistered();

const GOAL_COLORS = ["#2f5d3a", "#3d6b8e", "#c08a2e", "#6b5a8e", "#b5482e", "#7a9eb5"];

type Segment = {
  name: string;
  saved: number;
  target: number;
  pct: number;
};

const goalsBarLabelsPlugin: Plugin<"bar"> = {
  id: "goalsBarLabels",
  afterDatasetsDraw(chart) {
    const pluginOpts = (chart.options.plugins as Record<string, unknown> | undefined)
      ?.goalsBarLabels as { segments?: Segment[] } | undefined;
    const segments = pluginOpts?.segments;
    if (!segments?.length) return;

    const savedMeta = chart.getDatasetMeta(0);
    const { ctx } = chart;

    savedMeta.data.forEach((bar, index) => {
      const seg = segments[index];
      if (!seg || seg.pct <= 0 || !bar) return;

      const props = bar.getProps(["x", "y", "base"], true);
      const base = Number(props.base);
      const end = Number(props.x);
      const width = Math.abs(end - base);
      if (width < 28) return;

      ctx.save();
      ctx.fillStyle = width >= 40 ? "rgba(255,255,255,0.95)" : "var(--ink)";
      ctx.font = '600 11px "SF Mono", ui-monospace, monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const centerX = Math.min(base, end) + width / 2;
      ctx.fillText(`${Math.round(seg.pct)}%`, centerX, Number(props.y));
      ctx.restore();
    });
  },
};

let goalsPluginReady = false;
function ensureGoalsBarPlugin() {
  if (goalsPluginReady) return;
  ChartJS.register(goalsBarLabelsPlugin);
  goalsPluginReady = true;
}

type Props = {
  goals: { name: string; savedAmount: number; targetAmount: number }[];
};

export function GoalsProgressBar({ goals }: Props) {
  ensureGoalsBarPlugin();

  const segments = useMemo((): Segment[] => {
    return goals
      .filter((g) => g.targetAmount > 0 || g.savedAmount > 0)
      .map((g) => ({
        name: g.name || "Goal",
        saved: g.savedAmount,
        target: g.targetAmount,
        pct:
          g.targetAmount > 0
            ? Math.min(100, (g.savedAmount / g.targetAmount) * 100)
            : 0,
      }));
  }, [goals]);

  const maxTarget = Math.max(...segments.map((s) => s.target), 1);

  const chartData = useMemo(
    () => ({
      labels: segments.map((s) => s.name),
      datasets: [
        {
          label: "Saved",
          data: segments.map((s) => s.saved),
          backgroundColor: segments.map(
            (_, i) => GOAL_COLORS[i % GOAL_COLORS.length]
          ),
          stack: "progress",
          borderWidth: 0,
        },
        {
          label: "Remaining",
          data: segments.map((s) => Math.max(0, s.target - s.saved)),
          backgroundColor: "#d8cfb4",
          stack: "progress",
          borderWidth: 0,
        },
      ],
    }),
    [segments]
  );

  const options = useMemo((): ChartOptions<"bar"> => {
    return {
      indexAxis: "y" as const,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const idx = ctx.dataIndex;
              const seg = segments[idx];
              if (!seg) return "";
              if (ctx.dataset.label === "Remaining") {
                const rem = Math.max(0, seg.target - seg.saved);
                return `Remaining: ${rem.toLocaleString("en-SG", {
                  style: "currency",
                  currency: "SGD",
                  maximumFractionDigits: 0,
                })}`;
              }
              return `Saved: ${seg.saved.toLocaleString("en-SG", {
                style: "currency",
                currency: "SGD",
                maximumFractionDigits: 0,
              })} (${Math.round(seg.pct)}%)`;
            },
            footer(items) {
              const idx = items[0]?.dataIndex;
              const seg = idx != null ? segments[idx] : null;
              if (!seg) return "";
              return `Target: ${seg.target.toLocaleString("en-SG", {
                style: "currency",
                currency: "SGD",
                maximumFractionDigits: 0,
              })}`;
            },
          },
        },
        goalsBarLabels: { segments },
      } as ChartOptions<"bar">["plugins"],
      scales: {
        x: {
          stacked: true,
          max: maxTarget,
          display: false,
          grid: { display: false },
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { size: 11 } },
        },
      },
    };
  }, [segments, maxTarget]);

  if (segments.length === 0) return null;

  const chartHeight = Math.max(72, segments.length * 30 + 24);

  return (
    <div
      className="goals-progress-bar"
      style={{ marginTop: 12, height: chartHeight }}
    >
      <Chart type="bar" data={chartData} options={options} />
    </div>
  );
}
