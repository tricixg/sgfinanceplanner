"use client";

import { useState } from "react";
import type { BudgetItem, DashboardState, Goal } from "@/lib/types";
import {
  budgetProjection,
  budgetVerdict,
  goalsSummary,
  monthlyInvestContribution,
  monthlySaveContribution,
  stableTakeHome,
} from "@/lib/finance";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";
import {
  COMPUTED_DEBT_LABEL,
  budgetBalanceLabel,
  computedDebtMonthly,
  COMPUTED_INSURANCE_LABEL,
  computedInsuranceMonthly,
  COMPUTED_ILP_LABEL,
  computedIlpMonthly,
  defaultBudgetTemplate,
} from "@/lib/finance/budget";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
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

const BUDGET_TYPES: BudgetItem["type"][] = ["fixed", "spend", "save", "invest"];

const palette: Record<string, string> = {
  fixed: "#a89a76",
  spend: "#c08a2e",
  save: "#3d6b8e",
  invest: "#2f5d3a",
};

const TYPE_TAG: Record<BudgetItem["type"], string> = {
  fixed: "t-end",
  spend: "t-soon",
  save: "t-live",
  invest: "t-live",
};

export function TabBudgetSavings({ state: S, setState }: Props) {
  const [budRet, setBudRet] = useState(6);
  const [budYrs, setBudYrs] = useState(10);
  const [editingAllocation, setEditingAllocation] = useState(false);
  const [editingGoals, setEditingGoals] = useState(false);

  const income = stableTakeHome(S);
  const debt = computedDebtMonthly(S);
  const insurancePrem = computedInsuranceMonthly(S);
  const ilpPrem = computedIlpMonthly(S);
  const { alloc, left, invPct, savePct } = budgetVerdict(S);
  const monthlyInv = monthlyInvestContribution(S);
  const monthlySave = monthlySaveContribution(S);
  const proj = budgetProjection(S, monthlyInv, monthlySave, budRet, budYrs);
  const { rows, totT, totS, totMonthly } = goalsSummary(S);
  const invSave = monthlyInv + monthlySave;
  const balanceLbl = budgetBalanceLabel(left);

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

  const updateGoal = (i: number, key: keyof Goal, val: string | number) => {
    setState((prev) => ({
      ...prev,
      goals: prev.goals.map((g, j) => (j === i ? { ...g, [key]: val } : g)),
    }));
    console.log("[TabBudgetSavings] updated goal", i, key, val);
  };

  const addGoal = () => {
    setState((prev) => ({
      ...prev,
      goals: [
        ...prev.goals,
        {
          name: "New goal",
          target: 5000,
          saved: 0,
          by: "2028-01",
          where: "Savings account",
        },
      ],
    }));
    console.log("[TabBudgetSavings] added goal");
  };

  const removeGoal = (i: number) => {
    setState((prev) => ({
      ...prev,
      goals: prev.goals.filter((_, j) => j !== i),
    }));
    console.log("[TabBudgetSavings] removed goal", i);
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
  verdict += ` Directing ${invPct.toFixed(0)}% to investing and ${savePct.toFixed(0)}% to savings.`;

  let glVerdict: string;
  if (totMonthly <= invSave) {
    glVerdict = `Goals need ${fmt(totMonthly)}/month; budget directs ${fmt(invSave)}/month — covered with ${fmt(invSave - totMonthly)} spare.`;
  } else {
    glVerdict = `Shortfall of ${fmt(totMonthly - invSave)}/month vs saving+investing allocation.`;
  }

  const allocationChart = S.budget.length > 0 && (
    <ChartBox
      type="doughnut"
      data={{
        labels: S.budget.map((b) => b.cat?.trim() || "Unnamed"),
        datasets: [{
          data: S.budget.map((b) => b.amt),
          backgroundColor: S.budget.map((b) => palette[b.type] ?? "#999"),
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
        Click <b>Edit</b> to change categories. Cash balances live on <b>ME</b> (savings
        accounts). Loans, insurance, and ILP premiums are auto from <b>Debts &amp; Loans</b>,{" "}
        <b>ME</b>, and <b>Investment</b>.
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
        <div className="split">
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
            {S.budget.map((b, i) => (
              <div key={i} className="budget-item" style={{ marginBottom: 14 }}>
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
                  <button
                    type="button"
                    className="btn del sm"
                    onClick={() => removeBudgetLine(i)}
                  >
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
            ))}
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
          <div className="card">
            {allocationChart}
            <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.55 }}>{verdict}</div>
          </div>
        </div>
      ) : (
        <div className="split">
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
                {S.budget.map((b, i) => (
                  <tr key={i}>
                    <td>{b.cat?.trim() || "Unnamed"}</td>
                    <td>
                      <span className={`tag ${TYPE_TAG[b.type]}`}>{b.type}</span>
                    </td>
                    <td className="num">{fmt2(b.amt)}</td>
                  </tr>
                ))}
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
          <div className="card">
            {allocationChart}
            <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.55 }}>{verdict}</div>
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

      <div className="grid g3" style={{ marginTop: 8 }}>
        <div className="stat accent">
          <div className="lbl">Total savings target</div>
          <div className="val">{fmt(totT)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Goal progress (tracked)</div>
          <div className="val">{fmt(totS)}</div>
          <div className="note">Cash balances are on ME tab</div>
        </div>
        <div className="stat warn">
          <div className="lbl">Still to save</div>
          <div className="val">{fmt(Math.max(0, totT - totS))}</div>
        </div>
      </div>

      <div className="section-head">
        <h2>Savings goals</h2>
        {editingGoals ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setEditingGoals(false);
              console.log("[TabBudgetSavings] goals edit off");
            }}
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setEditingGoals(true);
              console.log("[TabBudgetSavings] goals edit on");
            }}
          >
            Edit
          </button>
        )}
      </div>

      {editingGoals ? (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Goal</th>
                <th>Target</th>
                <th>Progress</th>
                <th>By</th>
                <th>Where</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {S.goals.map((g, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="text"
                      value={g.name}
                      onChange={(ev) => updateGoal(i, "name", ev.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={g.target}
                      onChange={(ev) => updateGoal(i, "target", +ev.target.value)}
                      style={{ width: 90 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={g.saved}
                      onChange={(ev) => updateGoal(i, "saved", +ev.target.value)}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={g.by}
                      onChange={(ev) => updateGoal(i, "by", ev.target.value)}
                      style={{ width: 90 }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={g.where}
                      onChange={(ev) => updateGoal(i, "where", ev.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn del sm"
                      onClick={() => removeGoal(i)}
                    >
                      del
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="toolbar">
            <button type="button" className="btn ghost sm" onClick={addGoal}>
              + Add goal
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          {S.goals.length === 0 ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
              No savings goals. Click Edit to add one.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Goal</th>
                  <th>Target</th>
                  <th>Progress</th>
                  <th>Gap</th>
                  <th>By</th>
                  <th>Need / mo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g, i) => (
                  <tr key={i}>
                    <td>{g.name}</td>
                    <td className="num">{fmt(g.target)}</td>
                    <td className="num">{fmt(g.saved)}</td>
                    <td className={`num ${g.gap > 0 ? "neg" : "pos"}`}>
                      {g.gap > 0 ? fmt(g.gap) : "done"}
                    </td>
                    <td className="num">{g.by}</td>
                    <td className="num">
                      <b>{fmt(g.need)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="split">
        <div className="card">
          <ChartBox
            type="bar"
            data={{
              labels: S.goals.map((g) =>
                g.name.length > 22 ? g.name.slice(0, 20) + "…" : g.name
              ),
              datasets: [
                {
                  label: "Progress",
                  data: S.goals.map((g) => g.saved),
                  backgroundColor: "#2f5d3a",
                  stack: "a",
                },
                {
                  label: "Needed",
                  data: S.goals.map((g) => Math.max(0, g.target - g.saved)),
                  backgroundColor: "#d8cfb4",
                  stack: "a",
                },
              ],
            }}
            options={{
              indexAxis: "y",
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: {
                  stacked: true,
                  grid: { color: "#e6dfca" },
                  ticks: { callback: (v) => "$" + (Number(v) / 1000).toFixed(0) + "k" },
                },
                y: { stacked: true, grid: { display: "none" } },
              },
            }}
            height={260}
          />
        </div>
        <div className="card">
          {rows.map((g) => (
            <div className="minirow" key={g.name}>
              <span className="k">{g.name}</span>
              <span className="v">{fmt(g.need)}/mo</span>
            </div>
          ))}
          <div className="minirow tot">
            <span className="k">Total / month</span>
            <span className="v">{fmt(totMonthly)}</span>
          </div>
          <div className="callout" style={{ marginTop: 12, marginBottom: 0 }}>
            <span className="ico" style={{ color: "var(--gold)" }}>
              Reality check
            </span>
            {glVerdict}
          </div>
        </div>
      </div>
    </section>
  );
}
