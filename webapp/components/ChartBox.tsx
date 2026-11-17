"use client";

import { Chart } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import "./chart-setup";

type BoxChartType = "bar" | "line" | "doughnut" | "pie";

type Props = {
  type: BoxChartType;
  data: ChartData;
  /** Options typed for the specific chart kind (e.g. `ChartOptions<"bar">`) or untyped. */
  options?:
    | ChartOptions
    | ChartOptions<"bar">
    | ChartOptions<"line">
    | ChartOptions<"doughnut">
    | ChartOptions<"pie">;
  tall?: boolean;
  height?: number;
};

export function ChartBox({ type, data, options, tall, height }: Props) {
  const style = height ? { height } : undefined;
  const className = tall ? "chartbox tall" : "chartbox";

  return (
    <div className={className} style={style}>
      <Chart type={type} data={data} options={options as ChartOptions} />
    </div>
  );
}
