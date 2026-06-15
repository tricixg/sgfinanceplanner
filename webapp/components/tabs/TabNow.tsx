"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardState } from "@/lib/types";
import type { SavingsSnapshot } from "@/lib/savings/types";
import {
  buildMonths,
  stableTakeHome,
  loanLoadForMonth,
  budgetFixedTotal,
  budgetSpendTotal,
  computedIlpMonthly,
  computedInsuranceMonthly,
  COMPUTED_DEBT_LABEL,
  COMPUTED_ILP_LABEL,
  COMPUTED_INSURANCE_LABEL,
} from "@/lib/finance";
import { currentYm, fmt, fmt2, formatMonthLabel } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";
import type { ChartOptions } from "chart.js";
import { fetchJson } from "@/lib/fetch-json";
import { useDomainEvent } from "@/hooks/useDomainEvent";
import { AppDataContext } from "@/contexts/app-data-contexts";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
  savings?: SavingsSnapshot | null;
  authEnabled?: boolean;
  preloadedAdditiveByYm?: Record<string, number> | null;
  preloadedAdditiveLoading?: boolean;
  preloadedAdditiveStartYm?: string;
};

export function TabNow({
  state: S,
  setState,
  savings,
  authEnabled = false,
  preloadedAdditiveByYm = null,
  preloadedAdditiveLoading = false,
  preloadedAdditiveStartYm = "",
}: Props) {
  const appData = useContext(AppDataContext);
  const [startYmDraft, setStartYmDraft] = useState(S.cashflowStartYm);
  const [savingStartYm, setSavingStartYm] = useState(false);
  const startYm = S.cashflowStartYm;
  const [additiveByYm, setAdditiveByYm] = useState<Record<string, number>>({});
  const [subscriptionsMonthly, setSubscriptionsMonthly] = useState(0);
  const prefetchAppliedForYm = useRef("");

  const loadAdditive = useCallback(async () => {
    if (!authEnabled || !startYm) return;
    const qs = new URLSearchParams({ startYm, count: "5" });
    const { res, data } = await fetchJson<{ byYm?: Record<string, number> }>(
      `/api/cashflow/additive-income?${qs}`,
      { credentials: "include" }
    );
    if (res.ok && data.byYm) {
      setAdditiveByYm(data.byYm);
      console.info("[TabNow] additive income loaded", data.byYm);
    }
  }, [authEnabled, startYm]);

  useEffect(() => {
    if (!preloadedAdditiveByYm) return;
    if (!preloadedAdditiveStartYm || preloadedAdditiveStartYm !== startYm) return;
    if (prefetchAppliedForYm.current === startYm) return;
    prefetchAppliedForYm.current = startYm;
    setAdditiveByYm(preloadedAdditiveByYm);
    console.info("[TabNow] additive preloaded", { startYm });
  }, [preloadedAdditiveByYm, preloadedAdditiveStartYm, startYm]);

  useEffect(() => {
    if (
      preloadedAdditiveByYm &&
      preloadedAdditiveStartYm === startYm &&
      preloadedAdditiveLoading
    ) {
      return;
    }
    void loadAdditive();
    console.info("[TabNow] additive reload trigger", {
      startYm,
      hasSavingsSnapshot: Boolean(savings),
    });
  }, [
    loadAdditive,
    startYm,
    savings,
    preloadedAdditiveByYm,
    preloadedAdditiveLoading,
    preloadedAdditiveStartYm,
  ]);

  useDomainEvent("savings:changed", () => {
    void loadAdditive();
    console.info("[TabNow] additive reload from savings:changed", { startYm });
  });

  useEffect(() => {
    setStartYmDraft(S.cashflowStartYm);
  }, [S.cashflowStartYm]);

  useEffect(() => {
    const ym = currentYm();
    if (S.cashflowStartYm === ym) return;
    setStartYmDraft(ym);
    setState((p) => ({ ...p, cashflowStartYm: ym }));
    console.info("[TabNow] defaulted cashflowStartYm on load", { ym });
    // intentionally runs once on mount; per request default view starts at current month
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSubscriptions = useCallback(async () => {
    if (!authEnabled) return;
    const { res, data } = await fetchJson<{
      items?: Array<{ amount?: number }>;
      subscriptions?: Array<{ amount?: number }>;
    }>("/api/recurring-subscriptions", { credentials: "include" });
    if (res.ok) {
      const list = data.items ?? data.subscriptions ?? [];
      const total = list.reduce((s, x) => s + Math.max(0, Number(x.amount ?? 0)), 0);
      setSubscriptionsMonthly(total);
      console.info("[TabNow] subscriptions monthly loaded", {
        total,
        count: list.length,
      });
    }
  }, [authEnabled]);

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  const rows = buildMonths(S, startYm, 5, savings, additiveByYm, subscriptionsMonthly);
  const newCash = stableTakeHome(S);
  const firstYm = rows[0]?.ym ?? startYm;
  const lastYm = rows[rows.length - 1]?.ym ?? startYm;
  const loadFirst = loanLoadForMonth(S.loans, firstYm);
  const loadLast = loanLoadForMonth(S.loans, lastYm);

  const chartData = useMemo(
    () => ({
      labels: rows.map((r) => r.m),
      datasets: [
        {
          label: "Baseline (salary/comms)",
          data: rows.map((r) => r.incomeBaseline),
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
          label: "Subscriptions",
          data: rows.map((r) => -r.subscriptions),
          backgroundColor: "#5a4678",
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
    }),
    [rows]
  );

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
            value={startYmDraft}
            onChange={(e) => {
              const v = e.target.value;
              if (v) {
                setStartYmDraft(v);
                console.info("[TabNow] cashflowStartYm draft", v);
              }
            }}
          />
        </label>
        <button
          type="button"
          className="btn sm"
          disabled={savingStartYm || startYmDraft === startYm}
          onClick={() => {
            void (async () => {
              setSavingStartYm(true);
              try {
                if (appData?.configured) {
                  await appData.saveProfile({ cashflowStartYm: startYmDraft });
                } else {
                  setState((p) => ({ ...p, cashflowStartYm: startYmDraft }));
                }
                console.info("[TabNow] cashflowStartYm saved", startYmDraft);
              } catch (e) {
                console.error("[TabNow] cashflowStartYm save failed", e);
              } finally {
                setSavingStartYm(false);
              }
            })();
          }}
        >
          {savingStartYm ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="grid g3">
        <div className="stat accent">
          <div className="lbl">Monthly baseline</div>
          <div className="val">{fmt(newCash)}</div>
          <div className="note">Gross − CPF + comms (ME tab)</div>
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
          <span><i className="dot" style={{ background: "var(--moss)" }} />Baseline income</span>
          <span><i className="dot" style={{ background: "var(--sand)" }} />Fixed obligations</span>
          <span><i className="dot" style={{ background: "var(--gold)" }} />Loan instalments</span>
          <span><i className="dot" style={{ background: "#7a9eb5" }} />ILP premiums</span>
          <span><i className="dot" style={{ background: "#6b7d6a" }} />Insurance premiums</span>
          <span><i className="dot" style={{ background: "#5a4678" }} />Subscriptions</span>
          <span><i className="dot" style={{ background: "var(--rust)" }} />Net position</span>
        </div>
      </div>

      <div className="card table-scroll cashflow-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Cash in</th>
              <th className="cashflow-sep-inout">Fixed</th>
              <th>Loans</th>
              <th>Spend</th>
              <th>Insurance</th>
              <th>ILP</th>
              <th>Subs</th>
              <th className="cashflow-sep-outnet">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ym}>
                <td>{r.m}</td>
                <td className="num">{fmt(r.incomeBaseline)}</td>
                <td className="num cashflow-sep-inout">{fmt(r.fixed)}</td>
                <td className="num">{fmt(r.loans)}</td>
                <td className="num">{fmt(r.spend)}</td>
                <td className="num">{fmt(r.insurance)}</td>
                <td className="num">{fmt(r.ilp)}</td>
                <td className="num">{fmt(r.subscriptions)}</td>
                <td className={`num cashflow-sep-outnet ${r.net >= 0 ? "pos" : "neg"}`}>
                  {r.net >= 0 ? "+" : ""}
                  {fmt(r.net)}
                </td>
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
