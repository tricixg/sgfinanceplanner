"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import type { BudgetItem, DashboardState } from "@/lib/types";
import {
  budgetProjection,
  budgetVerdict,
  monthlyInvestContribution,
  stableTakeHome,
} from "@/lib/finance";
import type { SavingsSnapshot } from "@/lib/savings/types";
import { useSavings } from "@/hooks/useSavings";
import { fmt, fmt2, currentYm } from "@/lib/finance/helpers";
import { fetchJson } from "@/lib/fetch-json";
import type { BudgetExpenseSummary, CategoryBudgetSummary } from "@/lib/expenses/budget-summary";
import { normalizeCategoryKey } from "@/lib/expenses/budget-match";
import type { AutoCategory } from "@/lib/expenses/auto-category-ids";
import { ChartBox } from "@/components/ChartBox";
import { DecimalInput } from "@/components/DecimalInput";
import { AppDataContext } from "@/contexts/app-data-contexts";
import { useDomainEvent } from "@/hooks/useDomainEvent";
import {
  COMPUTED_DEBT_LABEL,
  budgetBalanceLabel,
  computedDebtMonthly,
  COMPUTED_INSURANCE_LABEL,
  computedInsuranceMonthly,
  COMPUTED_ILP_LABEL,
  computedIlpMonthly,
  COMPUTED_SAVINGS_LABEL,
  COMPUTED_SUBSCRIPTION_LABEL,
  computedSavingsMonthly,
  defaultBudgetTemplate,
} from "@/lib/finance/budget";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
  savings?: SavingsSnapshot | null;
};

const BUDGET_TYPES: BudgetItem["type"][] = ["fixed", "spend", "invest"];

const palette: Record<string, string> = {
  fixed: "#a89a76",
  spend: "#c08a2e",
  invest: "#2f5d3a",
};

const AUTO_CHART_COLORS: Record<string, string> = {
  debt: "#b5482e",
  insurance: "#3d6b8e",
  ilp: "#7a9eb5",
  subscription: "#8a7be2",
  savings: "#4a8055",
};

const TYPE_TAG: Record<BudgetItem["type"], string> = {
  fixed: "t-end",
  spend: "t-soon",
  save: "t-live",
  invest: "t-live",
};

type BudgetRow = { b: BudgetItem; i: number };

function lookupCategorySpend(
  summary: BudgetExpenseSummary | null,
  line: BudgetItem
): CategoryBudgetSummary | null {
  if (!summary || (line.type !== "fixed" && line.type !== "spend")) return null;
  const all = [...summary.categories, ...summary.zeroAllocated];
  if (line.id) {
    return all.find((c) => c.budgetLineId === line.id) ?? null;
  }
  const key = normalizeCategoryKey(line.cat ?? "");
  return all.find((c) => normalizeCategoryKey(c.category) === key) ?? null;
}

function lookupComputedSpend(
  summary: BudgetExpenseSummary | null,
  kind: AutoCategory
): CategoryBudgetSummary | null {
  return summary?.computedCategories?.find((c) => c.autoCategory === kind) ?? null;
}

function splitBudgetRows(budget: BudgetItem[]): {
  allocated: BudgetRow[];
  zeroAllocated: BudgetRow[];
} {
  const withIndex = budget.map((b, i) => ({ b, i }));
  return {
    allocated: withIndex.filter(({ b }) => b.amt > 0),
    zeroAllocated: withIndex.filter(({ b }) => b.amt <= 0),
  };
}

export function TabBudgetSavings({
  state: S,
  setState,
  savings,
}: Props) {
  const appData = useContext(AppDataContext);
  const { bundle: savingsBundle } = useSavings();
  const savingsGoals = savingsBundle.goals;
  const [budRet, setBudRet] = useState(6);
  const [budYrs, setBudYrs] = useState(10);
  const [editingAllocation, setEditingAllocation] = useState(false);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<BudgetItem[]>(S.budget);
  const [expenseSummary, setExpenseSummary] = useState<BudgetExpenseSummary | null>(null);
  const activeBudget = editingAllocation ? budgetDraft : S.budget;
  const budgetState = editingAllocation ? { ...S, budget: budgetDraft } : S;

  const loadExpenseSummary = useCallback(async () => {
    if (editingAllocation) return;
    try {
      const ym = currentYm();
      const { res, data } = await fetchJson<BudgetExpenseSummary & { error?: string }>(
        `/api/expenses/summary?ym=${ym}`,
        { credentials: "include" }
      );
      if (res.ok) {
        setExpenseSummary(data);
        console.info("[TabBudgetSavings] expense summary loaded", { ym });
      }
    } catch (e) {
      console.warn("[TabBudgetSavings] expense summary failed", e);
    }
  }, [editingAllocation]);

  useEffect(() => {
    void loadExpenseSummary();
  }, [loadExpenseSummary, S.budget]);

  useDomainEvent(
    ["expense:changed", "budget:changed", "loans:changed", "recurring:changed"],
    () => {
      void loadExpenseSummary();
    }
  );

  const income = stableTakeHome(S);
  const ym = currentYm();
  const debt =
    lookupComputedSpend(expenseSummary, "debt")?.allocated ??
    computedDebtMonthly(S, ym);
  const insurancePrem = computedInsuranceMonthly(S);
  const ilpPrem = computedIlpMonthly(S);
  const subPrem =
    lookupComputedSpend(expenseSummary, "subscription")?.allocated ?? 0;
  const savingsPrem = computedSavingsMonthly(savingsGoals);
  const { alloc, left, invPct } = budgetVerdict(budgetState, ym, savingsPrem);
  const monthlyInv = monthlyInvestContribution(budgetState);
  const proj = budgetProjection(
    budgetState,
    monthlyInv,
    0,
    budRet,
    budYrs,
    savings,
    savingsPrem
  );
  const budgetLines = activeBudget.filter((b) => b.type !== "save");
  const { allocated: allocatedRows, zeroAllocated: zeroRows } =
    splitBudgetRows(activeBudget);
  /** Stable draft order while editing — avoid jumping between $0 and allocated sections. */
  const editBudgetRows: BudgetRow[] = editingAllocation
    ? budgetDraft.map((b, i) => ({ b, i }))
    : [];
  const balanceLbl = budgetBalanceLabel(left);

  const renderBudgetEditItem = ({ b, i }: BudgetRow) => (
    <div className="budget-item" key={b.id ?? `budget-line-${i}`} style={{ marginBottom: 14 }}>
      <div className="editrow budget-line">
        <input
          type="text"
          value={b.cat ?? ""}
          placeholder="Category name"
          onChange={(ev) => updateBudget(i, { cat: ev.target.value })}
        />
        <select
          value={b.type}
          onChange={(ev) =>
            updateBudget(i, { type: ev.target.value as BudgetItem["type"] })
          }
        >
          {BUDGET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <DecimalInput
          value={b.amt}
          step={1}
          min={0}
          max={Math.round(income) || 1}
          onChange={(v) => updateBudget(i, { amt: v })}
          aria-label={`Budget amount for ${b.cat || "category"}`}
          style={{ width: 110 }}
        />
        <button type="button" className="btn del sm" onClick={() => removeBudgetLine(i)}>
          del
        </button>
      </div>
      <input
        type="range"
        className="budget-slider"
        min={0}
        max={Math.round(income) || 1}
        step={1}
        value={b.amt}
        onChange={(ev) => updateBudget(i, { amt: +ev.target.value })}
      />
    </div>
  );

  const renderComputedAllocationRow = (
    key: string,
    label: string,
    allocated: number
  ) => (
    <tr className="computed-row" key={key}>
      <td>{label}</td>
      <td>
        <span className="tag t-soon">auto</span>
      </td>
      <td className="num">{fmt2(allocated)}</td>
      <td className="num">—</td>
      <td className="num">—</td>
    </tr>
  );

  const renderComputedViewRow = (
    kind: AutoCategory,
    label: string,
    allocated: number
  ) => {
    const spend = lookupComputedSpend(expenseSummary, kind);
    return (
      <tr className="computed-row" key={kind}>
        <td>{label}</td>
        <td>
          <span className="tag t-soon">auto</span>
        </td>
        <td className="num">{fmt2(allocated)}</td>
        <td className="num">{spend ? fmt2(spend.spent) : "—"}</td>
        <td className={`num ${spend && spend.remaining < 0 ? "neg" : ""}`}>
          {spend ? fmt2(spend.remaining) : "—"}
        </td>
      </tr>
    );
  };

  const renderBudgetViewRow = ({ b, i }: BudgetRow) => {
    const spend = lookupCategorySpend(expenseSummary, b);
    return (
      <tr key={i}>
        <td>{b.cat?.trim() || "Unnamed"}</td>
        <td>
          <span className={`tag ${TYPE_TAG[b.type]}`}>{b.type}</span>
        </td>
        <td className="num">{fmt2(b.amt)}</td>
        {spend ? (
          <>
            <td className="num">{fmt2(spend.spent)}</td>
            <td className={`num ${spend.remaining < 0 ? "neg" : ""}`}>{fmt2(spend.remaining)}</td>
          </>
        ) : (
          <>
            <td className="num">—</td>
            <td className="num">—</td>
          </>
        )}
      </tr>
    );
  };

  const computedUsedTotal =
    (lookupComputedSpend(expenseSummary, "debt")?.spent ?? 0) +
    (lookupComputedSpend(expenseSummary, "insurance")?.spent ?? 0) +
    (lookupComputedSpend(expenseSummary, "ilp")?.spent ?? 0) +
    (lookupComputedSpend(expenseSummary, "subscription")?.spent ?? 0);

  const categoryUsedTotal = allocatedRows.reduce((sum, row) => {
    const spend = lookupCategorySpend(expenseSummary, row.b);
    return sum + (spend?.spent ?? 0);
  }, 0);

  const tableAmountTotal = debt + insurancePrem + ilpPrem + subPrem + savingsPrem + alloc;
  const tableUsedTotal = computedUsedTotal + categoryUsedTotal;
  const tableRemainingTotal = tableAmountTotal - tableUsedTotal;

  const startBudgetEdit = () => {
    setBudgetDraft(structuredClone(S.budget));
    setEditingAllocation(true);
    console.info("[TabBudgetSavings] allocation edit on");
  };

  const saveBudget = async () => {
    setBudgetSaving(true);
    try {
      if (appData?.configured) {
        await appData.saveBudget(budgetDraft);
      } else {
        setState((prev) => ({ ...prev, budget: budgetDraft }));
      }
      setEditingAllocation(false);
      console.info("[TabBudgetSavings] budget saved", { lines: budgetDraft.length });
    } catch (e) {
      console.error("[TabBudgetSavings] budget save failed", e);
    } finally {
      setBudgetSaving(false);
    }
  };

  const updateBudget = (i: number, patchItem: Partial<BudgetItem>) => {
    setBudgetDraft((prev) =>
      prev.map((b, j) => (j === i ? { ...b, ...patchItem } : b))
    );
    console.info("[TabBudgetSavings] updated budget draft line", i, patchItem);
  };

  const addBudgetLine = () => {
    setBudgetDraft((prev) => [
      ...prev,
      { cat: "New category", amt: 0, type: "spend" },
    ]);
    console.info("[TabBudgetSavings] added budget draft line");
  };

  const removeBudgetLine = (i: number) => {
    setBudgetDraft((prev) => prev.filter((_, j) => j !== i));
    console.info("[TabBudgetSavings] removed budget draft line", i);
  };

  const initBudgetTemplate = () => {
    const template = defaultBudgetTemplate();
    setBudgetDraft(template);
    if (!editingAllocation) {
      void (async () => {
        if (appData?.configured) {
          await appData.saveBudget(template);
        } else {
          setState((prev) => ({ ...prev, budget: template }));
        }
      })();
    }
    console.info("[TabBudgetSavings] initialized budget template");
  };

  let verdict = "";
  if (Math.abs(left) > 20) {
    verdict =
      left < 0
        ? `Over-allocated by ${fmt2(-left)}. Trim a category.`
        : `${fmt2(left)} remaining — assign to saving or investing.`;
  } else {
    verdict = "Balanced plan. ";
  }
  if (savingsPrem > 0) {
    verdict += ` Savings goals need ${fmt(savingsPrem)}/month (by target dates on Savings tab).`;
  }
  verdict += ` Directing ${invPct.toFixed(0)}% of take-home to investing via budget lines.`;

  const allocationChartRows = [
    { label: COMPUTED_DEBT_LABEL, amount: debt, color: AUTO_CHART_COLORS.debt },
    { label: COMPUTED_INSURANCE_LABEL, amount: insurancePrem, color: AUTO_CHART_COLORS.insurance },
    { label: COMPUTED_ILP_LABEL, amount: ilpPrem, color: AUTO_CHART_COLORS.ilp },
    { label: COMPUTED_SUBSCRIPTION_LABEL, amount: subPrem, color: AUTO_CHART_COLORS.subscription },
    { label: COMPUTED_SAVINGS_LABEL, amount: savingsPrem, color: AUTO_CHART_COLORS.savings },
    ...budgetLines.map((b) => ({
      label: b.cat?.trim() || "Unnamed",
      amount: Number(b.amt ?? 0),
      color: palette[b.type] ?? "#999",
    })),
  ].filter((row) => row.amount > 0);

  const allocationChart = allocationChartRows.length > 0 && (
    <ChartBox
      type="doughnut"
      data={{
        labels: allocationChartRows.map((row) => row.label),
        datasets: [{
          data: allocationChartRows.map((row) => row.amount),
          backgroundColor: allocationChartRows.map((row) => row.color),
          borderColor: "#fffdf6",
          borderWidth: 2,
        }],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { boxWidth: 9, font: { size: 9.5 } } },
        },
      }}
      height={220}
    />
  );

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Click <b>Edit</b> to change categories. Savings accounts and goals live on{" "}
        <b>Savings &amp; Goals</b>. Loans, insurance, and ILP premiums are auto from{" "}
        <b>Debts &amp; Loans</b>, <b>ME</b>, and <b>Investment</b>.
      </div>

      <div className="grid g3">
        <div className="stat accent">
          <div className="lbl">Monthly take-home</div>
          <div className="val">{fmt(income)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Your categories</div>
          <div className="val">{fmt(alloc)}</div>
        </div>
        <div className={`stat ${left < -20 ? "warn" : ""}`}>
          <div className="lbl">{balanceLbl}</div>
          <div className={`val ${left < -1 ? "neg" : ""}`}>{fmt2(Math.abs(left))}</div>
          <div className="note">
            {left < -1
              ? "Spending exceeds take-home — trim a category"
              : "After auto deductions in table"}
          </div>
        </div>
      </div>

      <div className="section-head">
        <h2>Monthly salary allocation</h2>
      </div>

      <div className="callout tip">
        Take-home: <b>{fmt(income)}</b>. <b>Remaining</b> (or over-allocated) = take-home − your
        categories − loans ({fmt(debt)}) − insurance ({fmt(insurancePrem)}) − ILP (
        {fmt(ilpPrem)}) − savings ({fmt(savingsPrem)}).
      </div>

      {S.budget.length === 0 && !editingAllocation ? (
        <div className="card">
          <div className="table-scroll category-budget-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Type</th>
                <th>Amount / month</th>
              </tr>
            </thead>
            <tbody>
              <tr className="computed-row">
                <td>{COMPUTED_DEBT_LABEL}</td>
                <td>
                  <span className="tag t-soon">auto</span>
                </td>
                <td className="num">{fmt2(debt)}</td>
              </tr>
              <tr className="computed-row">
                <td>{COMPUTED_INSURANCE_LABEL}</td>
                <td>
                  <span className="tag t-soon">auto</span>
                </td>
                <td className="num">{fmt2(insurancePrem)}</td>
              </tr>
              <tr className="computed-row">
                <td>{COMPUTED_ILP_LABEL}</td>
                <td>
                  <span className="tag t-soon">auto</span>
                </td>
                <td className="num">{fmt2(ilpPrem)}</td>
              </tr>
              <tr className="computed-row">
                <td>{COMPUTED_SAVINGS_LABEL}</td>
                <td>
                  <span className="tag t-soon">auto</span>
                </td>
                <td className="num">{fmt2(savingsPrem)}</td>
              </tr>
            </tbody>
          </table>
          </div>
          <p style={{ color: "var(--muted)", fontStyle: "italic", margin: "12px 0" }}>
            No editable categories yet.
          </p>
          <button type="button" className="btn ghost sm" onClick={initBudgetTemplate}>
            Set up default categories
          </button>
        </div>
      ) : editingAllocation ? (
        <div className="budget-stack">
          <div className="card">
            {allocationChart}
            <div className="subtext" style={{ marginTop: 12 }}>{verdict}</div>
          </div>
          <div className="card">
            <div className="section-head" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>Categories</h3>
              <button
                type="button"
                className="btn sm"
                disabled={budgetSaving}
                onClick={() => void saveBudget()}
              >
                {budgetSaving ? "Saving…" : "Save"}
              </button>
            </div>
            {activeBudget.length === 0 ? (
              <button
                type="button"
                className="btn ghost sm"
                onClick={initBudgetTemplate}
                style={{ marginBottom: 12 }}
              >
                Set up default categories
              </button>
            ) : null}
            <div className="editrow budget-line computed-line">
              <span>{COMPUTED_DEBT_LABEL}</span>
              <span className="tag t-soon">auto</span>
              <span className="num">{fmt2(debt)}</span>
              <span></span>
            </div>
            <div className="editrow budget-line computed-line">
              <span>{COMPUTED_INSURANCE_LABEL}</span>
              <span className="tag t-soon">auto</span>
              <span className="num">{fmt2(insurancePrem)}</span>
              <span></span>
            </div>
            <div className="editrow budget-line computed-line">
              <span>{COMPUTED_ILP_LABEL}</span>
              <span className="tag t-soon">auto</span>
              <span className="num">{fmt2(ilpPrem)}</span>
              <span></span>
            </div>
            <div className="editrow budget-line computed-line">
              <span>{COMPUTED_SAVINGS_LABEL}</span>
              <span className="tag t-soon">auto</span>
              <span className="num">{fmt2(savingsPrem)}</span>
              <span></span>
            </div>
            {editBudgetRows.map(renderBudgetEditItem)}
            <div className="toolbar">
              <button type="button" className="btn ghost sm" onClick={addBudgetLine}>
                + Add category
              </button>
            </div>
            <div className="minirow tot" style={{ marginTop: 12 }}>
              <span className="k">Your categories</span>
              <span className="v">{fmt2(alloc)}</span>
            </div>
            <div className="minirow" style={{ border: "none" }}>
              <span className="k">{balanceLbl}</span>
              <span className={`v ${left < -1 ? "neg" : ""}`}>{fmt2(Math.abs(left))}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="budget-stack">
          <div className="card">
            {allocationChart}
            <div className="subtext" style={{ marginTop: 12 }}>{verdict}</div>
          </div>
          <div className="card">
            <div className="section-head" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>Categories</h3>
              <button
                type="button"
                className="btn ghost sm"
                onClick={startBudgetEdit}
              >
                Edit
              </button>
            </div>
            <div className="table-scroll category-budget-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Amount / month</th>
                  <th>Used (month)</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {renderComputedViewRow("debt", COMPUTED_DEBT_LABEL, debt)}
                {renderComputedViewRow("insurance", COMPUTED_INSURANCE_LABEL, insurancePrem)}
                {renderComputedViewRow("ilp", COMPUTED_ILP_LABEL, ilpPrem)}
                {renderComputedViewRow("subscription", COMPUTED_SUBSCRIPTION_LABEL, subPrem)}
                {renderComputedAllocationRow(
                  "computed-savings",
                  COMPUTED_SAVINGS_LABEL,
                  savingsPrem
                )}
                {allocatedRows.map(renderBudgetViewRow)}
                {zeroRows.length > 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <details className="budget-zero-section">
                        <summary>$0 budget · {zeroRows.length} categories</summary>
                        <table>
                          <tbody>{zeroRows.map(renderBudgetViewRow)}</tbody>
                        </table>
                      </details>
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>
                    <span className="tag t-live">sum</span>
                  </td>
                  <td className="num">{fmt2(tableAmountTotal)}</td>
                  <td className="num">{fmt2(tableUsedTotal)}</td>
                  <td className={`num ${tableRemainingTotal < 0 ? "neg" : ""}`}>
                    {fmt2(tableRemainingTotal)}
                  </td>
                </tr>
                <tr>
                  <td>{balanceLbl}</td>
                  <td>
                    <span className={`tag ${left < -1 ? "t-end" : "t-live"}`}>
                      {left < -1 ? "over" : "left"}
                    </span>
                  </td>
                  <td className={`num ${left < -1 ? "neg" : ""}`}>{fmt2(Math.abs(left))}</td>
                  <td className="num">—</td>
                  <td className="num">—</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </div>
        </div>
      )}

      <h2>Allocation projection</h2>
      <div className="card">
        <div className="ctrl">
          <label>
            Return %{" "}
            <DecimalInput value={budRet} onChange={setBudRet} />
          </label>
          <label>
            Years{" "}
            <DecimalInput value={budYrs} min={3} max={30} onChange={setBudYrs} />
          </label>
        </div>
        <ChartBox
          type="bar"
          data={{
            labels: proj.labels,
            datasets: [
              { label: "Invested", data: proj.invSeries, backgroundColor: "#3d6b8e", stack: "a" },
              { label: "Cash", data: proj.cashSeries, backgroundColor: "#c08a2e", stack: "a" },
              {
                label: "LNW",
                data: proj.nwSeries,
                type: "line",
                borderColor: "#11201a",
                borderWidth: 2.5,
                pointRadius: 3,
                tension: 0.25,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { stacked: true, grid: { display: false } },
              y: {
                stacked: true,
                grid: { color: "#e6dfca" },
                ticks: { callback: (v) => "$" + (Number(v) / 1000).toFixed(0) + "k" },
              },
            },
          }}
        />
      </div>

      <div className="grid g3">
        <div className="stat">
          <div className="lbl">Invested pot — end</div>
          <div className="val">{fmt(proj.invPot)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Cash savings — end</div>
          <div className="val">{fmt(proj.cashPot)}</div>
        </div>
        <div className="stat accent">
          <div className="lbl">Liquid net worth — end</div>
          <div className="val">{fmt(proj.invPot + proj.cashPot)}</div>
        </div>
      </div>

      <div className="callout tip" style={{ marginTop: 16 }}>
        <span className="ico">Savings</span>
        Track accounts, shared pools, and goals on the <b>Savings &amp; Goals</b> tab.
        {savingsPrem > 0
          ? ` Projections above assume ${fmt(savingsPrem)}/month from savings goals (by target dates).`
          : ""}
      </div>
    </section>
  );
}
