"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardState, RecurringSubscription } from "@/lib/types";
import { useCardStatements } from "@/hooks/useCardStatements";
import { DecimalInput } from "@/components/DecimalInput";
import {
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

type RowKey =
  | "baseline"
  | "additive"
  | "loans"
  | "variableSpend"
  | "insurance"
  | "ilp"
  | "recurring"
  | "cardBillsDue";

const ALL_INCLUDED: Record<RowKey, boolean> = {
  baseline: true,
  additive: true,
  loans: true,
  variableSpend: true,
  insurance: true,
  ilp: true,
  recurring: true,
  cardBillsDue: true,
};

function toggleSetMember(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function IncludeCheckbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      aria-label={`Include ${label} in this month's totals`}
    />
  );
}

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
  const [recurringItems, setRecurringItems] = useState<RecurringSubscription[]>([]);
  const [variableSpend, setVariableSpend] = useState(budgetSpendTotal(S));
  const [loansOpen, setLoansOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [included, setIncluded] = useState<Record<RowKey, boolean>>(ALL_INCLUDED);
  const [excludedLoanItems, setExcludedLoanItems] = useState<Set<string>>(new Set());
  const [excludedRecurringItems, setExcludedRecurringItems] = useState<Set<string>>(new Set());
  const { bundle } = useCardStatements(authEnabled);

  const toggleIncluded = (key: RowKey) =>
    setIncluded((p) => ({ ...p, [key]: !p[key] }));

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
        items?: RecurringSubscription[];
        subscriptions?: RecurringSubscription[];
      }>("/api/recurring-subscriptions", { credentials: "include" });
      if (res.ok) {
        const list = data.items ?? data.subscriptions ?? [];
        setRecurringItems(list.filter((x) => Math.max(0, Number(x.amount ?? 0)) > 0));
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
  const ilp = computedIlpMonthly(S);
  const insurance = computedInsuranceMonthly(S);

  const loanItems = useMemo(() => {
    const cardLoans = S.loans
      .filter((l) => l.end >= ym && l.monthly > 0)
      .map((l, i) => ({ key: `loan-${l.id ?? i}`, label: l.name || l.card, amount: l.monthly }));
    const personalLoans = (S.otherLoans ?? [])
      .filter((l) => l.loanType === "personal" && !l.paidAt && l.monthly > 0)
      .map((l, i) => ({ key: `otherloan-${l.id ?? i}`, label: l.name, amount: l.monthly }));
    return [...cardLoans, ...personalLoans];
  }, [S.loans, S.otherLoans, ym]);

  const loans = useMemo(
    () =>
      loanItems.reduce((s, item) => (excludedLoanItems.has(item.key) ? s : s + item.amount), 0),
    [loanItems, excludedLoanItems]
  );
  const recurringTotal = useMemo(
    () =>
      recurringItems.reduce((s, x) => {
        const amt = Math.max(0, Number(x.amount ?? 0));
        return excludedRecurringItems.has(x.id ?? x.name) ? s : s + amt;
      }, 0),
    [recurringItems, excludedRecurringItems]
  );

  const incomeTotal =
    (included.baseline ? baseline : 0) + (included.additive ? additiveIncome : 0);
  const expenseTotal =
    (included.loans ? loans : 0) +
    (included.variableSpend ? variableSpend : 0) +
    (included.insurance ? insurance : 0) +
    (included.ilp ? ilp : 0) +
    (included.recurring ? recurringTotal : 0) +
    (included.cardBillsDue ? cardBillsDue : 0);
  const net = incomeTotal - expenseTotal;

  const rowClass = (key: RowKey) =>
    included[key] ? undefined : "this-month-cashflow-row-excluded";
  const detailClass = (parentKey: RowKey, itemExcluded: boolean) =>
    `this-month-cashflow-detail-row${
      included[parentKey] && !itemExcluded ? "" : " this-month-cashflow-row-excluded"
    }`;

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
        <table className="this-month-cashflow-table">
          <thead>
            <tr>
              <th></th>
              <th>Type</th>
              <th>Line item</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className={rowClass("baseline")}>
              <td>
                <IncludeCheckbox
                  checked={included.baseline}
                  onChange={() => toggleIncluded("baseline")}
                  label="Baseline income"
                />
              </td>
              <td>In</td>
              <td>Baseline income</td>
              <td className="num">{fmt(baseline)}</td>
            </tr>
            <tr className={rowClass("additive")}>
              <td>
                <IncludeCheckbox
                  checked={included.additive}
                  onChange={() => toggleIncluded("additive")}
                  label="Extra deposits"
                />
              </td>
              <td>In</td>
              <td>Extra deposits (+cashflow)</td>
              <td className="num">{fmt(additiveIncome)}</td>
            </tr>
            <tr className={rowClass("loans")}>
              <td>
                <IncludeCheckbox
                  checked={included.loans}
                  onChange={() => toggleIncluded("loans")}
                  label="Loans & debt"
                />
              </td>
              <td>Out</td>
              <td>
                {loanItems.length > 0 ? (
                  <button
                    type="button"
                    className="this-month-cashflow-toggle"
                    onClick={() => setLoansOpen((v) => !v)}
                    aria-expanded={loansOpen}
                  >
                    <span className="caret">{loansOpen ? "▾" : "▸"}</span>
                    Loans &amp; debt
                  </button>
                ) : (
                  "Loans & debt"
                )}
              </td>
              <td className="num">{fmt(loans)}</td>
            </tr>
            {loansOpen &&
              loanItems.map((item) => {
                const itemExcluded = excludedLoanItems.has(item.key);
                return (
                  <tr className={detailClass("loans", itemExcluded)} key={item.key}>
                    <td>
                      <IncludeCheckbox
                        checked={!itemExcluded}
                        onChange={() =>
                          setExcludedLoanItems((prev) => toggleSetMember(prev, item.key))
                        }
                        label={item.label}
                        disabled={!included.loans}
                      />
                    </td>
                    <td></td>
                    <td>{item.label}</td>
                    <td className="num">{fmt(item.amount)}</td>
                  </tr>
                );
              })}
            <tr className={rowClass("variableSpend")}>
              <td>
                <IncludeCheckbox
                  checked={included.variableSpend}
                  onChange={() => toggleIncluded("variableSpend")}
                  label="Variable spend"
                />
              </td>
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
            <tr className={rowClass("insurance")}>
              <td>
                <IncludeCheckbox
                  checked={included.insurance}
                  onChange={() => toggleIncluded("insurance")}
                  label="Insurance premiums"
                />
              </td>
              <td>Out</td>
              <td>Insurance premiums</td>
              <td className="num">{fmt(insurance)}</td>
            </tr>
            <tr className={rowClass("ilp")}>
              <td>
                <IncludeCheckbox
                  checked={included.ilp}
                  onChange={() => toggleIncluded("ilp")}
                  label="ILP premiums"
                />
              </td>
              <td>Out</td>
              <td>ILP premiums</td>
              <td className="num">{fmt(ilp)}</td>
            </tr>
            <tr className={rowClass("recurring")}>
              <td>
                <IncludeCheckbox
                  checked={included.recurring}
                  onChange={() => toggleIncluded("recurring")}
                  label="Recurring"
                />
              </td>
              <td>Out</td>
              <td>
                {recurringItems.length > 0 ? (
                  <button
                    type="button"
                    className="this-month-cashflow-toggle"
                    onClick={() => setRecurringOpen((v) => !v)}
                    aria-expanded={recurringOpen}
                  >
                    <span className="caret">{recurringOpen ? "▾" : "▸"}</span>
                    Recurring
                  </button>
                ) : (
                  "Recurring"
                )}
              </td>
              <td className="num">{fmt(recurringTotal)}</td>
            </tr>
            {recurringOpen &&
              recurringItems.map((item, i) => {
                const key = item.id ?? item.name;
                const itemExcluded = excludedRecurringItems.has(key);
                return (
                  <tr className={detailClass("recurring", itemExcluded)} key={`rec-${key}-${i}`}>
                    <td>
                      <IncludeCheckbox
                        checked={!itemExcluded}
                        onChange={() =>
                          setExcludedRecurringItems((prev) => toggleSetMember(prev, key))
                        }
                        label={item.name}
                        disabled={!included.recurring}
                      />
                    </td>
                    <td></td>
                    <td>{item.name}</td>
                    <td className="num">{fmt(item.amount)}</td>
                  </tr>
                );
              })}
            <tr className={rowClass("cardBillsDue")}>
              <td>
                <IncludeCheckbox
                  checked={included.cardBillsDue}
                  onChange={() => toggleIncluded("cardBillsDue")}
                  label="Credit card statements due next month"
                />
              </td>
              <td>Out</td>
              <td>Credit card statements due next month ({nextYm})</td>
              <td className="num">{fmt(cardBillsDue)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}><strong>Net this month</strong></td>
              <td className={`num ${net >= 0 ? "pos" : "neg"}`}><strong>{fmt(net)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
