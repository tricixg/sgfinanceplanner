"use client";

import type { DashboardState } from "@/lib/types";
import {
  buildMonths,
  stableTakeHome,
  loanLoadForMonth,
  budgetFixedTotal,
  budgetSpendTotal,
  computedDebtMonthly,
  computedIlpMonthly,
  computedInsuranceMonthly,
  COMPUTED_DEBT_LABEL,
  COMPUTED_ILP_LABEL,
  COMPUTED_INSURANCE_LABEL,
} from "@/lib/finance";
import { fmt, fmt2, formatMonthLabel } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";
import type { ChartOptions } from "chart.js";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
};

export function TabNow({ state: S, setState }: Props) {
  const startYm = S.cashflowStartYm;
  const rows = buildMonths(S, startYm, 5);
  const newCash = stableTakeHome(S);
  const firstYm = rows[0]?.ym ?? startYm;
  const lastYm = rows[rows.length - 1]?.ym ?? startYm;
  const loadFirst = loanLoadForMonth(S.loans, firstYm);
  const loadLast = loanLoadForMonth(S.loans, lastYm);

  const chartData = {
    labels: rows.map((r) => r.m),
    datasets: [
      {
        label: "Cash income",
        data: rows.map((r) => r.income),
        backgroundColor: "#2f5d3a",
        stack: "inflows",
        order: 2,
      },
      {
        label: "Fixed obligations",
        data: rows.map((r) => -r.fixed),
        backgroundColor: "#d8cfb4",
        stack: "outflows",
        order: 2,
      },
      {
        label: "Loan instalments",
        data: rows.map((r) => -r.loans),
        backgroundColor: "#c08a2e",
        stack: "outflows",
        order: 2,
      },
      {
        label: "Variable spend",
        data: rows.map((r) => -r.spend),
        backgroundColor: "#a89a76",
        stack: "outflows",
        order: 2,
      },
      {
        label: "ILP premiums",
        data: rows.map((r) => -r.ilp),
        backgroundColor: "#7a9eb5",
        stack: "outflows",
        order: 2,
      },
      {
        label: "Insurance premiums",
        data: rows.map((r) => -r.insurance),
        backgroundColor: "#6b7d6a",
        stack: "outflows",
        order: 2,
      },
      {
        label: "Net",
        data: rows.map((r) => r.net),
        type: "line" as const,
        borderColor: "#b5482e",
        backgroundColor: "#b5482e",
        borderWidth: 2.5,
        pointRadius: 4,
        tension: 0.2,
        order: 1,
      },
    ],
  };

  const chartOpts: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (c) =>
            (c.dataset.label ?? "") + ": " + fmt(Math.abs(Number(c.raw))),
        },
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false } },
      y: {
        stacked: true,
        grid: { color: "#e6dfca" },
        ticks: {
          callback: (v) => "$" + (Number(v) / 1000).toFixed(1) + "k",
        },
      },
    },
  };

  const midYm = rows[2]?.ym ?? firstYm;
  const midLoans = loanLoadForMonth(S.loans, midYm);
  const items: [string, number][] = [
    ...S.budget
      .filter((b) => b.type !== "save" && b.type !== "invest")
      .map((b) => [b.cat, b.amt] as [string, number]),
    [COMPUTED_DEBT_LABEL, midLoans],
    [COMPUTED_ILP_LABEL, computedIlpMonthly(S)],
    [COMPUTED_INSURANCE_LABEL, computedInsuranceMonthly(S)],
  ];
  let spent = 0;

  const rangeLabel = `${formatMonthLabel(firstYm)} – ${formatMonthLabel(lastYm)}`;

  return (
    <section className="panel on">
      <div className="ctrl">
        <label>
          Start month
          <input
            type="month"
            value={startYm}
            onChange={(e) => {
              const v = e.target.value;
              if (v) {
                setState((p) => ({ ...p, cashflowStartYm: v }));
                console.log("[TabNow] cashflowStartYm", v);
              }
            }}
          />
        </label>
      </div>

      <div className="grid g3">
        <div className="stat accent">
          <div className="lbl">Monthly cash income</div>
          <div className="val">{fmt(newCash)}</div>
          <div className="note">Gross − CPF + comms allowance</div>
        </div>
        <div className="stat">
          <div className="lbl">Budget outflows / mo</div>
          <div className="val">{fmt(budgetFixedTotal(S) + budgetSpendTotal(S))}</div>
          <div className="note">Fixed + spend categories</div>
        </div>
        <div className="stat">
          <div className="lbl">Loan instalments (window)</div>
          <div className="val">{fmt(loadFirst)} → {fmt(loadLast)}</div>
          <div className="note">{rangeLabel}</div>
        </div>
      </div>

      <h2>Month-by-month cashflow · {rangeLabel}</h2>
      <div className="card">
        <ChartBox type="bar" data={chartData} options={chartOpts} />
        <div className="legend">
          <span><i className="dot" style={{ background: "var(--moss)" }} />Cash income</span>
          <span><i className="dot" style={{ background: "var(--sand)" }} />Fixed obligations</span>
          <span><i className="dot" style={{ background: "var(--gold)" }} />Loan instalments</span>
          <span><i className="dot" style={{ background: "#7a9eb5" }} />ILP &amp; insurance</span>
          <span><i className="dot" style={{ background: "var(--rust)" }} />Net position</span>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Cash in</th>
              <th>Fixed</th>
              <th>Loans</th>
              <th>Spend</th>
              <th>Net</th>
              <th>Running cash</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ym}>
                <td>{r.m}</td>
                <td className="num">{fmt(r.income)}</td>
                <td className="num">{fmt(r.fixed)}</td>
                <td className="num">{fmt(r.loans)}</td>
                <td className="num">{fmt(r.spend)}</td>
                <td className={`num ${r.net >= 0 ? "pos" : "neg"}`}>
                  {r.net >= 0 ? "+" : ""}
                  {fmt(r.net)}
                </td>
                <td className={`num ${r.running >= 0 ? "pos" : "neg"}`}>{fmt(r.running)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="split">
        <div className="card">
          <div className="section-lbl">Where the money goes — mid window month</div>
          {items.map(([k, v]) => {
            spent += v;
            return (
              <div className="minirow" key={k}>
                <span className="k">{k}</span>
                <span className="v">{fmt2(v)}</span>
              </div>
            );
          })}
          <div className="minirow tot">
            <span className="k">Surplus to save / invest</span>
            <span className={`v ${newCash - spent >= 0 ? "pos" : "neg"}`}>
              {fmt2(newCash - spent)}
            </span>
          </div>
        </div>
        <div className="card">
          <div className="section-lbl">Loan load across window</div>
          <div className="minirow">
            <span className="k">{formatMonthLabel(firstYm)}</span>
            <span className="v">{fmt2(loadFirst)} / mo</span>
          </div>
          <div className="minirow">
            <span className="k">{formatMonthLabel(lastYm)}</span>
            <span className="v">{fmt2(loadLast)} / mo</span>
          </div>
          <div className="callout tip" style={{ marginBottom: 0 }}>
            <span className="ico">Tip</span>
            Every loan that ends frees cash with no effort. Direct early surplus at an
            emergency buffer of 3–6 months&apos; expenses.
          </div>
        </div>
      </div>
    </section>
  );
}
