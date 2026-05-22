"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { CHART_COLOR, CHART_FONT } from "@/lib/finance/helpers";

let registered = false;

export function ensureChartsRegistered() {
  if (registered) return;
  ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
  );
  ChartJS.defaults.font.family = CHART_FONT;
  ChartJS.defaults.font.size = 10.5;
  ChartJS.defaults.color = CHART_COLOR;
  registered = true;
}

export const chartOptionsBase = {
  responsive: true,
  maintainAspectRatio: false as const,
  plugins: { legend: { display: false } },
};
