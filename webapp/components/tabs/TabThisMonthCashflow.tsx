"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardState } from "@/lib/types";
import { useCardStatements } from "@/hooks/useCardStatements";
import { DecimalInput } from "@/components/DecimalInput";
import {
  budgetFixedTotal,
  budgetSpendTotal,
  computedIlpMonthly,
  computedInsuranceMonthly,
  stableTakeHome,
} from "@/lib/finance";
import { currentYm, fmt } from "@/lib/finance/helpers";
import { fetchJson } from "@/lib/fetch-json";

type Props = {
  state: DashboardState;
  authEnabled?: boolean;
};

export function TabThisMonthCashflow({ state: S, authEnabled = false }: Props) {
  const ym = currentYm();
  const nextYm = useMemo(() => {
    const [y, m] = ym.split("-").map(Number);
    const total = y * 12 + (m - 1) + 1;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    return `${ny}-${String(nm).padStart(2, "0")}`;
  }, [ym]);
  const [additiveIncome, setAdditiveIncome] = useState(0);
  const [subscriptions, setSubscriptions] = useState(0);
  const [variableSpend, setVariableSpend] = useState(budgetSpendTotal(S));
  const { bundle } = useCardStatements(authEnabled);

  useEffect(() => {
    setVariableSpend(budgetSpendTotal(S));
  }, [S]);

  useEffect(() => {
    if (!authEnabled) return;
    void (async () => {
      const qs = new URLSearchParams({ startYm: ym, count: "1" });
      const { res, data } = await fetchJson<{ byYm?: Record<string, number> }>(
        `/api/cashflow/additive-income?${qs}`,
        { credentials: "include" }
      );
      if (res.ok && data.byYm) {
        setAdditiveIncome(Number(data.byYm[ym] ?? 0));
      }
    })();
  }, [authEnabled, ym]);

  useEffect(() => {
    if (!authEnabled) return;
    void (async () => {
      const { res, data } = await fetchJson<{
        items?: Array<{ amount?: number }>;
        subscriptions?: Array<{ amount?: number }>;
      }>("/api/recurring-subscriptions", { credentials: "include" });
      if (res.ok) {
        const list = data.items ?? data.subscriptions ?? [];
        setSubscriptions(list.reduce((s, x) => s + Math.max(0, Number(x.amount ?? 0)), 0));
      }
    })();
  }, [authEnabled]);

  const cardBillsDue = useMemo(
    () =>
      (bundle.statements ?? [])
        .filter(
          (s) => s.paymentDueDate.startsWith(`${nextYm}-`) && (s.actualAmount ?? 0) > 0
        )
        .reduce((sum, s) => sum + Number(s.actualAmount ?? 0), 0),
    [bundle.statements, nextYm]
  );

  const baseline = stableTakeHome(S);
  const fixed = budgetFixedTotal(S);
  const ilp = computedIlpMonthly(S);
  const insurance = computedInsuranceMonthly(S);

  const incomeTotal = baseline + additiveIncome;
  const expenseTotal =
    fixed + variableSpend + ilp + insurance + subscriptions + cardBillsDue;
  const net = incomeTotal - expenseTotal;

  return (
    <section className="panel on">
      <div className="grid g3" style={{ marginBottom: 12 }}>
        <div className="stat accent">
          <div className="lbl">This month income</div>
          <div className="val">{fmt(incomeTotal)}</div>
          <div className="note">Baseline {fmt(baseline)} + extra {fmt(additiveIncome)}</div>
        </div>
        <div className="stat">
          <div className="lbl">This month expenses</div>
          <div className="val">{fmt(expenseTotal)}</div>
          <div className="note">Includes credit card statements due in {nextYm}</div>
        </div>
        <div className="stat">
          <div className="lbl">Net this month</div>
          <div className={`val ${net >= 0 ? "pos" : "neg"}`}>{fmt(net)}</div>
          <div className="note">{ym}</div>
        </div>
      </div>

      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Line item</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>In</td><td>Baseline income</td><td className="num">{fmt(baseline)}</td></tr>
            <tr><td>In</td><td>Extra deposits (+cashflow)</td><td className="num">{fmt(additiveIncome)}</td></tr>
            <tr><td>Out</td><td>Fixed obligations</td><td className="num">{fmt(fixed)}</td></tr>
            <tr>
              <td>Out</td>
              <td>Variable spend</td>
              <td className="num" style={{ width: 120 }}>
                <DecimalInput
                  value={variableSpend}
                  step={10}
                  min={0}
                  onChange={setVariableSpend}
                  aria-label="Variable spend for this month cashflow"
                />
              </td>
            </tr>
            <tr><td>Out</td><td>Insurance premiums</td><td className="num">{fmt(insurance)}</td></tr>
            <tr><td>Out</td><td>ILP premiums</td><td className="num">{fmt(ilp)}</td></tr>
            <tr><td>Out</td><td>Subscriptions</td><td className="num">{fmt(subscriptions)}</td></tr>
            <tr>
              <td>Out</td>
              <td>Credit card statements due next month ({nextYm})</td>
              <td className="num">{fmt(cardBillsDue)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}><strong>Net this month</strong></td>
              <td className={`num ${net >= 0 ? "pos" : "neg"}`}><strong>{fmt(net)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
