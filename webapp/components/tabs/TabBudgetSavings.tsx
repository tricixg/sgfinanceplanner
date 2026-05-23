"use client";

import { useEffect, useState } from "react";
import type { BudgetItem, DashboardState } from "@/lib/types";
import {
  budgetProjection,
  budgetVerdict,
  monthlyInvestContribution,
  stableTakeHome,
} from "@/lib/finance";
import { effectiveMonthlySave } from "@/lib/finance/savings-totals";
import type { SavingsSnapshot } from "@/lib/savings/types";
import { fmt, fmt2, currentYm } from "@/lib/finance/helpers";
import { fetchJson } from "@/lib/fetch-json";
import type { BudgetExpenseSummary, CategoryBudgetSummary } from "@/lib/expenses/budget-summary";
import { normalizeCategoryKey } from "@/lib/expenses/budget-match";
import type { AutoCategory } from "@/lib/expenses/auto-category-ids";
import { ChartBox } from "@/components/ChartBox";
import {
  COMPUTED_DEBT_LABEL,
  budgetBalanceLabel,
  computedDebtMonthly,
  COMPUTED_INSURANCE_LABEL,
  computedInsuranceMonthly,
  COMPUTED_ILP_LABEL,
  computedIlpMonthly,
  COMPUTED_SUBSCRIPTION_LABEL,
  defaultBudgetTemplate,
} from "@/lib/finance/budget";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
  savings?: SavingsSnapshot | null;
};

function NumInput({
  value,
  onChange,
  step,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step ?? 1}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
  );
}

const BUDGET_TYPES: BudgetItem["type"][] = ["fixed", "spend", "invest"];

const palette: Record<string, string> = {
  fixed: "#a89a76",
  spend: "#c08a2e",
  invest: "#2f5d3a",
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
  const [budRet, setBudRet] = useState(6);
  const [budYrs, setBudYrs] = useState(10);
  const [editingAllocation, setEditingAllocation] = useState(false);
  const [expenseSummary, setExpenseSummary] = useState<BudgetExpenseSummary | null>(null);

  useEffect(() => {
    if (editingAllocation) return;
    void (async () => {
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
    })();
  }, [editingAllocation, S.budget]);

  const income = stableTakeHome(S);
  const debt = computedDebtMonthly(S);
  const insurancePrem = computedInsuranceMonthly(S);
  const ilpPrem = computedIlpMonthly(S);
  const subPrem =
    lookupComputedSpend(expenseSummary, "subscription")?.allocated ?? 0;
  const { alloc, left, invPct } = budgetVerdict(S);
  const monthlyInv = monthlyInvestContribution(S);
  const monthlySave =
    savings != null ? effectiveMonthlySave(savings, false) : 0;
  const proj = budgetProjection(S, monthlyInv, monthlySave, budRet, budYrs, savings);
  const budgetLines = S.budget.filter((b) => b.type !== "save");
  const { allocated: allocatedRows, zeroAllocated: zeroRows } = splitBudgetRows(S.budget);
  const balanceLbl = budgetBalanceLabel(left);

  const renderBudgetEditItem = ({ b, i }: BudgetRow) => (
    <div className="budget-item" key={i} style={{ marginBottom: 14 }}>
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
        <span className="num">{fmt2(b.amt)}</span>
        <button type="button" className="btn del sm" onClick={() => removeBudgetLine(i)}>
          del
        </button>
      </div>
      <input
        type="range"
        className="budget-slider"
        min={0}
        max={Math.round(income) || 1}
        step={10}
        value={b.amt}
        onChange={(ev) => updateBudget(i, { amt: +ev.target.value })}
      />
    </div>
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

  const updateBudget = (i: number, patchItem: Partial<BudgetItem>) => {
    setState((prev) => ({
      ...prev,
      budget: prev.budget.map((b, j) => (j === i ? { ...b, ...patchItem } : b)),
    }));
    console.log("[TabBudgetSavings] updated budget line", i, patchItem);
  };

  const addBudgetLine = () => {
    setState((prev) => ({
      ...prev,
      budget: [
        ...prev.budget,
        { cat: "New category", amt: 0, type: "spend" },
      ],
    }));
    console.log("[TabBudgetSavings] added budget line");
  };

  const removeBudgetLine = (i: number) => {
    setState((prev) => ({
      ...prev,
      budget: prev.budget.filter((_, j) => j !== i),
    }));
    console.log("[TabBudgetSavings] removed budget line", i);
  };

  const initBudgetTemplate = () => {
    setState((prev) => ({
      ...prev,
      budget: defaultBudgetTemplate(),
    }));
    console.log("[TabBudgetSavings] initialized budget template");
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
  if (monthlySave > 0) {
    verdict += ` Goal contributions total ${fmt(monthlySave)}/month (Savings tab).`;
  }
  verdict += ` Directing ${invPct.toFixed(0)}% of take-home to investing via budget lines.`;

  const allocationChart = budgetLines.length > 0 && (
    <ChartBox
      type="doughnut"
      data={{
        labels: budgetLines.map((b) => b.cat?.trim() || "Unnamed"),
        datasets: [{
          data: budgetLines.map((b) => b.amt),
          backgroundColor: budgetLines.map((b) => palette[b.type] ?? "#999"),
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
        {editingAllocation ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setEditingAllocation(false);
              console.log("[TabBudgetSavings] allocation edit off");
            }}
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setEditingAllocation(true);
              console.log("[TabBudgetSavings] allocation edit on");
            }}
          >
            Edit
          </button>
        )}
      </div>

      <div className="callout tip">
        Take-home: <b>{fmt(income)}</b>. <b>Remaining</b> (or over-allocated) = take-home − your
        categories − loans ({fmt(debt)}) − insurance ({fmt(insurancePrem)}) − ILP (
        {fmt(ilpPrem)}).
      </div>

      {S.budget.length === 0 && !editingAllocation ? (
        <div className="card">
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
            </tbody>
          </table>
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
            <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.55 }}>{verdict}</div>
          </div>
          <div className="card">
            {S.budget.length === 0 ? (
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
            {allocatedRows.map(renderBudgetEditItem)}
            {zeroRows.length > 0 ? (
              <details className="budget-zero-section">
                <summary>$0 budget · {zeroRows.length} categories</summary>
                {zeroRows.map(renderBudgetEditItem)}
              </details>
            ) : null}
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
            <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.55 }}>{verdict}</div>
          </div>
          <div className="card">
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
            </table>
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
      )}

      <h2>Allocation projection</h2>
      <div className="card">
        <div className="ctrl">
          <label>
            Return %{" "}
            <input
              type="number"
              value={budRet}
              step={0.5}
              onChange={(e) => setBudRet(+e.target.value)}
            />
          </label>
          <label>
            Years{" "}
            <input
              type="number"
              value={budYrs}
              min={3}
              max={30}
              onChange={(e) => setBudYrs(+e.target.value)}
            />
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
        {monthlySave > 0
          ? ` Projections above assume ${fmt(monthlySave)}/month from goal contributions.`
          : ""}
      </div>
    </section>
  );
}
