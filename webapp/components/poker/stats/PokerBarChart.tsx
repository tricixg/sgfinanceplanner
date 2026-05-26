"use client";

import { useMemo } from "react";
import { Chart } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { ensureChartsRegistered } from "@/components/chart-setup";
import type { ChartBucket } from "@/lib/poker/stats";

ensureChartsRegistered();

type Props = {
  title: string;
  buckets: ChartBucket[];
  valueKey?: "hourly" | "netProfit";
};

export function PokerBarChart({ title, buckets, valueKey = "hourly" }: Props) {
  const chart = useMemo(() => {
    if (buckets.length === 0) return null;
    return {
      labels: buckets.map((b) => b.label),
      datasets: [
        {
          label: valueKey === "hourly" ? "$/h" : "Net profit",
          data: buckets.map((b) =>
            valueKey === "hourly" ? (b.hourly ?? 0) : b.netProfit
          ),
          backgroundColor: buckets.map((b) => {
            const v = valueKey === "hourly" ? (b.hourly ?? 0) : b.netProfit;
            return v >= 0 ? "rgba(47,93,58,.75)" : "rgba(181,72,46,.75)";
          }),
        },
      ],
    };
  }, [buckets, valueKey]);

  const options = useMemo((): ChartOptions<"bar"> => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
      scales: {
        y: {
          ticks: {
            callback: (v) => {
              const n = Number(v);
              const prefix = n < 0 ? "−" : "";
              return `${prefix}$${Math.abs(n).toFixed(0)}`;
            },
          },
        },
      },
    };
  }, []);

  if (!chart) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <p className="note">No data yet.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div style={{ height: 220 }}>
        <Chart type="bar" data={chart} options={options} />
      </div>
    </div>
  );
}
