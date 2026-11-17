"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  BarController,
  LineController,
  PieController,
  DoughnutController,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import "chartjs-adapter-date-fns";
import { CHART_COLOR, CHART_FONT } from "@/lib/finance/helpers";

let registered = false;

export function ensureChartsRegistered() {
  if (registered) return;
  ChartJS.register(
    CategoryScale,
    LinearScale,
    TimeScale,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    BarController,
    LineController,
    PieController,
    DoughnutController,
    Title,
    Tooltip,
    Legend,
    Filler
  );
  ChartJS.defaults.font.family = CHART_FONT;
  ChartJS.defaults.font.size = 11.5;
  ChartJS.defaults.color = CHART_COLOR;

  // Quiet, consistent chart chrome: hairline grid, rounded bars, soft tooltips.
  ChartJS.defaults.borderColor = "rgba(220, 212, 189, 0.55)";
  ChartJS.defaults.elements.bar.borderRadius = 4;
  ChartJS.defaults.elements.line.borderCapStyle = "round";
  ChartJS.defaults.elements.line.borderJoinStyle = "round";
  ChartJS.defaults.plugins.legend.labels.usePointStyle = true;
  ChartJS.defaults.plugins.legend.labels.pointStyle = "rectRounded";
  ChartJS.defaults.plugins.legend.labels.boxWidth = 8;
  ChartJS.defaults.plugins.legend.labels.boxHeight = 8;
  ChartJS.defaults.plugins.legend.labels.padding = 14;
  const tooltip = ChartJS.defaults.plugins.tooltip;
  tooltip.backgroundColor = "#11201a";
  tooltip.titleColor = "#f4f1e8";
  tooltip.bodyColor = "#f4f1e8";
  tooltip.footerColor = "#f4f1e8";
  tooltip.padding = 10;
  tooltip.cornerRadius = 10;
  tooltip.boxPadding = 4;
  tooltip.usePointStyle = true;
  tooltip.titleFont = { weight: 600, size: 12 };
  tooltip.bodyFont = { size: 12 };
  registered = true;
}

ensureChartsRegistered();

export const chartOptionsBase = {
  responsive: true,
  maintainAspectRatio: false as const,
  plugins: { legend: { display: false } },
};
