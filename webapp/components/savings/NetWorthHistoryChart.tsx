"use client";

import { useMemo, useState } from "react";
import type { ChartOptions } from "chart.js";
import type { NetWorthSnapshot } from "@/lib/types";
import { fmt, formatMonthLabel } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";

type Props = {
  history: NetWorthSnapshot[];
  includeCpf: boolean;
};

type MonthPoint = {
  month: string;
  total: number;
  momPct: number | null;
};

const lineOpts: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: {
      ticks: {
        callback: (v) => "$" + (Number(v) / 1000).toFixed(1) + "k",
      },
    },
  },
};

export function NetWorthHistoryChart({ history, includeCpf }: Props) {
  const [view, setView] = useState<"monthly" | "yearly">("monthly");
  const [selectedYear, setSelectedYear] = useState("");

  const points = useMemo<MonthPoint[]>(() => {
    const totals = [...history]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((s) => ({ month: s.month, total: s.lnw + (includeCpf ? s.cpf : 0) }));
    return totals.map(({ month, total }, i) => {
      const prior = i > 0 ? totals[i - 1]!.total : undefined;
      const momPct = prior != null && prior !== 0 ? ((total - prior) / Math.abs(prior)) * 100 : null;
      return { month, total, momPct };
    });
  }, [history, includeCpf]);

  const years = useMemo(() => {
    const set = new Set(points.map((p) => p.month.slice(0, 4)));
    return [...set].sort().reverse();
  }, [points]);

  const activeYear = years.includes(selectedYear) ? selectedYear : (years[0] ?? "");
  const yearRows = useMemo(
    () => points.filter((p) => p.month.startsWith(activeYear)).slice().reverse(),
    [points, activeYear]
  );

  const chartData = useMemo(
    () => ({
      labels: points.map((p) => formatMonthLabel(p.month.slice(0, 7))),
      datasets: [
        {
          label: includeCpf ? "Net worth (incl. CPF)" : "Net worth (excl. CPF)",
          data: points.map((p) => p.total),
          borderColor: "#2f5d3a",
          backgroundColor: "rgba(47,93,58,.12)",
          fill: true,
          tension: 0.25,
        },
      ],
    }),
    [points, includeCpf]
  );

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-head">
        <h3 style={{ marginTop: 0 }}>Net worth history</h3>
        {points.length > 0 && (
          <div className="toolbar" style={{ marginTop: 0 }}>
            <button
              type="button"
              className={view === "monthly" ? "btn sm" : "btn ghost sm"}
              onClick={() => setView("monthly")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={view === "yearly" ? "btn sm" : "btn ghost sm"}
              onClick={() => setView("yearly")}
            >
              Yearly
            </button>
          </div>
        )}
      </div>

      {points.length === 0 ? (
        <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
          Visit Cash Accounts each month to start building your net worth history.
        </p>
      ) : view === "monthly" ? (
        points.length < 2 ? (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
            Come back next month to see your net worth trend.
          </p>
        ) : (
          <ChartBox type="line" height={260} data={chartData} options={lineOpts} />
        )
      ) : (
        <>
          <label className="ctrl" style={{ marginBottom: 12 }}>
            Year{" "}
            <select value={activeYear} onChange={(e) => setSelectedYear(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Net worth</th>
                  <th className="num">MoM</th>
                </tr>
              </thead>
              <tbody>
                {yearRows.map((row) => (
                  <tr key={row.month}>
                    <td>{formatMonthLabel(row.month.slice(0, 7))}</td>
                    <td className="num">{fmt(row.total)}</td>
                    <td className={`num ${(row.momPct ?? 0) < 0 ? "neg" : ""}`}>
                      {row.momPct == null
                        ? "—"
                        : `${row.momPct > 0 ? "+" : ""}${row.momPct.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
