"use client";

import { useState } from "react";
import type { DashboardState } from "@/lib/types";
import { simulateCPF } from "@/lib/finance";
import { fmt } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";

type Props = { state: DashboardState };

export function TabCPF({ state: S }: Props) {
  const [growth, setGrowth] = useState(3.5);
  const series = simulateCPF(S, growth);
  const cpfNow = S.oa + S.sa + S.ma;

  const chartData = {
    labels: series.map((r) => r.label),
    datasets: [
      {
        label: "OA",
        data: series.map((r) => r.oa),
        borderColor: "#2f5d3a",
        backgroundColor: "rgba(47,93,58,.12)",
        fill: true,
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 3,
      },
      {
        label: "SA",
        data: series.map((r) => r.sa),
        borderColor: "#3d6b8e",
        backgroundColor: "rgba(61,107,142,.10)",
        fill: true,
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 3,
      },
      {
        label: "MA",
        data: series.map((r) => r.ma),
        borderColor: "#c08a2e",
        backgroundColor: "rgba(192,138,46,.10)",
        fill: true,
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 3,
      },
    ],
  };

  return (
    <section className="panel on">
      <div className="ctrl">
        <label>
          Salary growth / yr (projection)
          <input type="number" value={growth} step={0.5}
            onChange={(e) => setGrowth(+e.target.value)} />%
        </label>
      </div>

      <div className="grid g4">
        <div className="stat">
          <div className="lbl">Ordinary Account · now</div>
          <div className="val">{fmt(S.oa)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Special Account · now</div>
          <div className="val">{fmt(S.sa)}</div>
        </div>
        <div className="stat">
          <div className="lbl">MediSave · now</div>
          <div className="val">{fmt(S.ma)}</div>
        </div>
        <div className="stat accent">
          <div className="lbl">Total CPF · now</div>
          <div className="val">{fmt(cpfNow)}</div>
        </div>
      </div>

      <h2>CPF account growth · 5 years</h2>
      <div className="card">
        <ChartBox type="line" data={chartData} options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false } },
            y: {
              grid: { color: "#e6dfca" },
              ticks: { callback: (v) => "$" + (Number(v) / 1000).toFixed(0) + "k" },
            },
          },
        }} tall />
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Year-end</th>
              <th>OA</th>
              <th>SA</th>
              <th>MA</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {series.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="num">{fmt(r.oa)}</td>
                <td className="num">{fmt(r.sa)}</td>
                <td className="num">{fmt(r.ma)}</td>
                <td className="num pos"><b>{fmt(r.oa + r.sa + r.ma)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
