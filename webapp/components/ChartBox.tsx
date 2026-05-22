"use client";

import { Chart } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import "./chart-setup";

type Props = {
  type: "bar" | "line" | "doughnut";
  data: ChartData;
  options?: ChartOptions;
  tall?: boolean;
  height?: number;
};

export function ChartBox({ type, data, options, tall, height }: Props) {
  const style = height ? { height } : undefined;
  const className = tall ? "chartbox tall" : "chartbox";

  return (
    <div className={className} style={style}>
      <Chart type={type} data={data} options={options} />
    </div>
  );
}
