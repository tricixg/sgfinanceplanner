"use client";

import type { DashboardState, Goal } from "@/lib/types";
import { fmt } from "@/lib/finance/helpers";
import { goalsSummary } from "@/lib/finance";
import { ChartBox } from "@/components/ChartBox";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
};

export function TabGoals({ state: S, setState }: Props) {
  const { rows, totT, totS, totMonthly } = goalsSummary(S);
  const invSave = S.budget
    .filter((b) => b.type === "save" || b.type === "invest")
    .reduce((s, b) => s + b.amt, 0);

  const updateGoal = (i: number, key: keyof Goal, val: string | number) => {
    setState((prev) => ({
      ...prev,
      goals: prev.goals.map((g, j) => (j === i ? { ...g, [key]: val } : g)),
    }));
  };

  const addGoal = () => {
    setState((prev) => ({
      ...prev,
      goals: [
        ...prev.goals,
        { name: "New goal", target: 5000, saved: 0, by: "2028-01", where: "Savings account" },
      ],
    }));
  };

  let glVerdict: string;
  if (totMonthly <= invSave) {
    glVerdict = `Goals need ${fmt(totMonthly)}/month; budget directs ${fmt(invSave)}/month — covered with ${fmt(invSave - totMonthly)} spare.`;
  } else {
    glVerdict = `Shortfall of ${fmt(totMonthly - invSave)}/month vs saving+investing allocation.`;
  }

  return (
    <section className="panel on">
      <div className="grid g3">
        <div className="stat accent">
          <div className="lbl">Total target</div>
          <div className="val">{fmt(totT)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Saved so far</div>
          <div className="val">{fmt(totS)}</div>
        </div>
        <div className="stat warn">
          <div className="lbl">Still to save</div>
          <div className="val">{fmt(Math.max(0, totT - totS))}</div>
        </div>
      </div>

      <h2>Your savings goals</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Goal</th>
              <th>Target</th>
              <th>Saved</th>
              <th>Gap</th>
              <th>By</th>
              <th>Months</th>
              <th>Need / mo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="text"
                    value={g.name}
                    onChange={(e) => updateGoal(i, "name", e.target.value)}
                    style={{ border: "none", background: "none", width: "100%" }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={g.target}
                    onChange={(e) => updateGoal(i, "target", +e.target.value)}
                    style={{ width: 90, textAlign: "right" }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={g.saved}
                    onChange={(e) => updateGoal(i, "saved", +e.target.value)}
                    style={{ width: 80, textAlign: "right" }}
                  />
                </td>
                <td className={`num ${g.gap > 0 ? "neg" : "pos"}`}>
                  {g.gap > 0 ? fmt(g.gap) : "done"}
                </td>
                <td>
                  <input
                    type="text"
                    value={g.by}
                    onChange={(e) => updateGoal(i, "by", e.target.value)}
                    style={{ width: 78, textAlign: "right" }}
                  />
                </td>
                <td className="num">{g.mths}</td>
                <td className="num"><b>{fmt(g.need)}</b></td>
                <td>
                  <button
                    className="btn del sm"
                    onClick={() =>
                      setState((prev) => ({
                        ...prev,
                        goals: prev.goals.filter((_, j) => j !== i),
                      }))
                    }
                  >
                    del
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="toolbar">
          <button className="btn ghost sm" onClick={addGoal}>+ Add goal</button>
        </div>
      </div>

      <div className="split">
        <div className="card">
          <ChartBox
            type="bar"
            data={{
              labels: S.goals.map((g) =>
                g.name.length > 22 ? g.name.slice(0, 20) + "…" : g.name
              ),
              datasets: [
                { label: "Saved", data: S.goals.map((g) => g.saved), backgroundColor: "#2f5d3a", stack: "a" },
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
                y: { stacked: true, grid: { display: false } },
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
            <span className="ico" style={{ color: "var(--gold)" }}>Reality check</span>
            {glVerdict}
          </div>
        </div>
      </div>
    </section>
  );
}
