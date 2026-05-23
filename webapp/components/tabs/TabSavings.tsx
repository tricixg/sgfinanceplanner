"use client";

import { useEffect, useState } from "react";
import type { DashboardState } from "@/lib/types";
import type { SavingsBundle, SavingsGoal, SavingsPool, UserSavingsAccount } from "@/lib/savings/types";
import { goalsFromSavingsGoals, goalsSummary } from "@/lib/finance/goals";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";

type Props = {
  savings: SavingsBundle;
  configured: boolean;
  onSave: (next: Pick<SavingsBundle, "accounts" | "pools" | "goals">) => Promise<unknown>;
};

function NumInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      step={0.01}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
  );
}

export function TabSavings({ savings, configured, onSave }: Props) {
  const [accounts, setAccounts] = useState(savings.accounts);
  const [pools, setPools] = useState(savings.pools);
  const [goals, setGoals] = useState(savings.goals);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const syncFromProps = () => {
    setAccounts(savings.accounts);
    setPools(savings.pools);
    setGoals(savings.goals);
  };

  useEffect(() => {
    syncFromProps();
    console.info("[TabSavings] synced from server bundle");
  }, [savings.accounts, savings.pools, savings.goals, savings.totals.personalCash]);

  const personalGoals = goals.filter((g) => g.scope === "individual");
  const sharedGoals = goals.filter((g) => g.scope === "shared");
  const personalSummary = goalsSummary({
    goals: goalsFromSavingsGoals(personalGoals),
  } as DashboardState);
  const sharedSummary = goalsSummary({
    goals: goalsFromSavingsGoals(sharedGoals),
  } as DashboardState);

  const persist = async () => {
    setSaving(true);
    setMsg("");
    try {
      await onSave({ accounts, pools, goals });
      setMsg("Saved");
      setEditing(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!configured) {
    return (
      <section className="panel on">
        <p className="note">
          Sign in with Supabase to use cloud savings accounts and partner shared pools.
          Local-only mode keeps legacy accounts on the ME tab until you connect.
        </p>
      </section>
    );
  }

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        <b>Your savings</b> are private. <b>Shared with partner</b> appears after you pair in
        Settings. Wealth and projections use personal cash by default — toggle joint inclusion
        on Wealth or 5-Year Projection.
      </div>

      <div className="section-head">
        <h2>Savings &amp; goals</h2>
        {editing ? (
          <button
            type="button"
            className="btn sm"
            disabled={saving}
            onClick={() => void persist()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              syncFromProps();
              setEditing(true);
            }}
          >
            Edit
          </button>
        )}
      </div>
      {msg ? <p className="note">{msg}</p> : null}

      <h3 className="settings-account-title">Your savings accounts</h3>
      <div className="card">
        {editing ? (
          <>
            {accounts.map((a, i) => (
              <div key={i} className="toolbar" style={{ marginBottom: 8 }}>
                <input
                  type="text"
                  value={a.name}
                  placeholder="Account name"
                  onChange={(e) => {
                    const next = [...accounts];
                    next[i] = { ...a, name: e.target.value };
                    setAccounts(next);
                  }}
                />
                <NumInput
                  value={a.balance}
                  onChange={(n) => {
                    const next = [...accounts];
                    next[i] = { ...a, balance: n };
                    setAccounts(next);
                  }}
                />
                <button
                  type="button"
                  className="btn del sm"
                  onClick={() => setAccounts(accounts.filter((_, j) => j !== i))}
                >
                  del
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn ghost sm"
              onClick={() =>
                setAccounts([
                  ...accounts,
                  {
                    id: `new-${accounts.length}`,
                    userId: "",
                    name: "New account",
                    balance: 0,
                    notes: "",
                    sortOrder: accounts.length,
                  },
                ])
              }
            >
              + Account
            </button>
          </>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td className="num">{fmt2(a.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="note" style={{ marginTop: 8 }}>
          Personal cash total: {fmt2(savings.totals.personalCash)}
        </p>
      </div>

      {savings.paired ? (
        <>
          <h3 className="settings-account-title">Shared with partner</h3>
          <div className="card">
            {editing ? (
              <>
                {pools.map((p, i) => (
                  <div key={i} className="toolbar" style={{ marginBottom: 8 }}>
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => {
                        const next = [...pools];
                        next[i] = { ...p, name: e.target.value };
                        setPools(next);
                      }}
                    />
                    <NumInput
                      value={p.balance}
                      onChange={(n) => {
                        const next = [...pools];
                        next[i] = { ...p, balance: n };
                        setPools(next);
                      }}
                    />
                    <button
                      type="button"
                      className="btn del sm"
                      onClick={() => setPools(pools.filter((_, j) => j !== i))}
                    >
                      del
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() =>
                    setPools([
                      ...pools,
                      {
                        id: `new-pool-${pools.length}`,
                        householdId: savings.householdId ?? "",
                        name: "Joint savings",
                        balance: 0,
                        notes: "",
                        sortOrder: pools.length,
                      },
                    ])
                  }
                >
                  + Shared pool
                </button>
              </>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Pool</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {pools.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="num">{fmt2(p.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="note" style={{ marginTop: 8 }}>
              Joint cash total: {fmt2(savings.totals.jointCash)}
            </p>
          </div>
        </>
      ) : (
        <p className="note">Link a partner in Settings → Partner to add shared savings pools.</p>
      )}

      <h3 className="settings-account-title">Your goals</h3>
      <GoalsSection
        editing={editing}
        goals={personalGoals}
        allGoals={goals}
        setGoals={setGoals}
        scope="individual"
        summary={personalSummary}
      />

      {savings.paired ? (
        <>
          <h3 className="settings-account-title">Shared goals</h3>
          <GoalsSection
            editing={editing}
            goals={sharedGoals}
            allGoals={goals}
            setGoals={setGoals}
            scope="shared"
            summary={sharedSummary}
          />
        </>
      ) : null}
    </section>
  );
}

function GoalsSection({
  editing,
  goals,
  allGoals,
  setGoals,
  scope,
  summary,
}: {
  editing: boolean;
  goals: SavingsGoal[];
  allGoals: SavingsGoal[];
  setGoals: (g: SavingsGoal[]) => void;
  scope: "individual" | "shared";
  summary: ReturnType<typeof goalsSummary>;
}) {
  const { rows, totT, totS, totMonthly } = summary;

  const update = (i: number, patch: Partial<SavingsGoal>) => {
    const scoped = goals[i];
    const idx = allGoals.findIndex((g) => g === scoped);
    if (idx < 0) return;
    const next = [...allGoals];
    next[idx] = { ...next[idx], ...patch };
    setGoals(next);
  };

  const add = () => {
    setGoals([
      ...allGoals,
      {
        id: `new-goal-${allGoals.length}`,
        scope,
        ownerUserId: scope === "individual" ? "self" : null,
        householdId: scope === "shared" ? "hh" : null,
        name: scope === "shared" ? "New shared goal" : "New goal",
        targetAmount: 5000,
        savedAmount: 0,
        targetDate: "2028-01-01",
        monthlyContribution: 0,
        whereLabel: "",
        linkedAccountId: null,
        linkedPoolId: null,
        sortOrder: allGoals.length,
      },
    ]);
  };

  return (
    <div className="card">
      {editing ? (
        <>
          {goals.map((g, i) => (
            <div key={g.id} className="toolbar" style={{ flexWrap: "wrap", marginBottom: 8 }}>
              <input
                type="text"
                value={g.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
              <NumInput
                value={g.targetAmount}
                onChange={(n) => update(i, { targetAmount: n })}
              />
              <NumInput
                value={g.savedAmount}
                onChange={(n) => update(i, { savedAmount: n })}
              />
              <input
                type="month"
                value={g.targetDate?.slice(0, 7) ?? "2028-01"}
                onChange={(e) => update(i, { targetDate: `${e.target.value}-01` })}
              />
              <NumInput
                value={g.monthlyContribution}
                onChange={(n) => update(i, { monthlyContribution: n })}
              />
              <button
                type="button"
                className="btn del sm"
                onClick={() => setGoals(allGoals.filter((x) => x.id !== g.id))}
              >
                del
              </button>
            </div>
          ))}
          <button type="button" className="btn ghost sm" onClick={add}>
            + Goal
          </button>
        </>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Goal</th>
              <th>Target</th>
              <th>Saved</th>
              <th>Need / mo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.name}>
                <td>{g.name}</td>
                <td className="num">{fmt(g.target)}</td>
                <td className="num">{fmt(g.saved)}</td>
                <td className="num">{fmt(g.need)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="minirow tot" style={{ marginTop: 8 }}>
        <span className="k">Total target / need per month</span>
        <span className="v">
          {fmt(totT)} · {fmt(totMonthly)}/mo
        </span>
      </div>
      {rows.length > 0 && !editing ? (
        <ChartBox
          type="bar"
          data={{
            labels: rows.map((g) => g.name),
            datasets: [
              {
                label: "Saved",
                data: rows.map((g) => g.saved),
                backgroundColor: "#2f5d3a",
              },
              {
                label: "Remaining",
                data: rows.map((g) => Math.max(0, g.target - g.saved)),
                backgroundColor: "#d8cfb4",
              },
            ],
          }}
          options={{
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
          }}
          height={200}
        />
      ) : null}
    </div>
  );
}
