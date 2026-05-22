"use client";

import type { DashboardState } from "@/lib/types";
import {
  build5m,
  currentLoanLoad,
  insMonthly,
  stableTakeHome,
  loanLoadForMonth,
  monIdx,
} from "@/lib/finance";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";
import type { ChartOptions } from "chart.js";

type Props = { state: DashboardState };

export function TabNow({ state: S }: Props) {
  const rows = build5m(S);
  const insM = insMonthly(S);
  const newCash = stableTakeHome(S);
  const loadNow = currentLoanLoad(S);

  const chartData = {
    labels: rows.map((r) => r.m),
    datasets: [
      {
        label: "Cash income",
        data: rows.map((r) => r.income),
        backgroundColor: "#2f5d3a",
        stack: "a",
        order: 2,
      },
      {
        label: "Fixed",
        data: rows.map((r) => -r.fixed),
        backgroundColor: "#d8cfb4",
        stack: "b",
        order: 2,
      },
      {
        label: "Loans+Ins",
        data: rows.map((r) => -r.loans),
        backgroundColor: "#c08a2e",
        stack: "b",
        order: 2,
      },
      {
        label: "Variable",
        data: rows.map((r) => -S.varSpend),
        backgroundColor: "#a89a76",
        stack: "b",
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
        stacked: false,
        grid: { color: "#e6dfca" },
        ticks: {
          callback: (v) => "$" + (Number(v) / 1000).toFixed(1) + "k",
        },
      },
    },
  };

  const idxAug = monIdx("2026-08");
  const augLoans = loanLoadForMonth(S.loans, "2026-08");
  const items: [string, number][] = [
    ["Fatty (family)", S.fatty],
    ["Household", S.house],
    ["Manulife ILP base", S.manu],
    ["Insurance premiums", insM],
    ["Variable / daily spend", S.varSpend],
  ];
  if (augLoans > 0) items.push(["Loan instalments", augLoans]);
  let spent = 0;

  return (
    <section className="panel on">
      <div className="grid g4">
        <div className="stat accent">
          <div className="lbl">Monthly cash income — from Aug</div>
          <div className="val">{fmt(newCash)}</div>
          <div className="note">ThoughtWorks base − CPF + allowance</div>
        </div>
        <div className="stat">
          <div className="lbl">Fixed obligations / mo</div>
          <div className="val">{fmt(S.fatty + S.house + S.manu)}</div>
          <div className="note">Fatty + household + Manulife base</div>
        </div>
        <div className="stat">
          <div className="lbl">Loan + insurance load now</div>
          <div className="val">{fmt(loadNow)}</div>
          <div className="note">Drops sharply from Jul &amp; Nov</div>
        </div>
        <div className="stat warn">
          <div className="lbl">Hard deadline — clear BT</div>
          <div className="val">7 Jul</div>
          <div className="note">Balance transfer at 0%</div>
        </div>
      </div>

      <div className="callout urgent">
        <span className="ico">Transition window</span>
        <b>Jun &amp; Jul are the tight months.</b> Final pay from old employer lands ~25 Jun,
        then a gap until first full paycheck ~15 Jul. Clear balance transfers before promo
        rates end; keep reserves for loan bills due in the gap month.
      </div>

      <h2>Month-by-month cashflow · Jun – Oct 2026</h2>
      <div className="card">
        <ChartBox type="bar" data={chartData} options={chartOpts} />
        <div className="legend">
          <span><i className="dot" style={{ background: "var(--moss)" }} />Cash income</span>
          <span><i className="dot" style={{ background: "var(--sand)" }} />Fixed obligations</span>
          <span><i className="dot" style={{ background: "var(--gold)" }} />Loans + insurance</span>
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
              <th>Loans+Ins</th>
              <th>Variable spend</th>
              <th>Net</th>
              <th>Running cash</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ym}>
                <td>
                  {r.m}
                  <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
                    {r.note}
                  </div>
                </td>
                <td className="num">{fmt(r.income)}</td>
                <td className="num">{fmt(r.fixed)}</td>
                <td className="num">{fmt(r.loans)}</td>
                <td className="num">{fmt(S.varSpend)}</td>
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
          <div className="section-lbl">Where the money goes — stable month (from Aug)</div>
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
          <div className="section-lbl">Loan load step-down</div>
          <div className="minirow">
            <span className="k">Now (May–Jun)</span>
            <span className="v">{fmt2(loanLoadForMonth(S.loans, "2026-06"))} / mo</span>
          </div>
          <div className="minirow">
            <span className="k">From Jul</span>
            <span className="v pos">{fmt2(loanLoadForMonth(S.loans, "2026-08"))} / mo</span>
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
