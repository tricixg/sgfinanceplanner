"use client";

import { useEffect, useState } from "react";
import type { DashboardState } from "@/lib/types";
import type {
  SavingsBundle,
  SavingsGoal,
  SavingsPool,
  UserSavingsAccount,
} from "@/lib/savings/types";
import { goalsFromSavingsGoals, goalsSummary } from "@/lib/finance/goals";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";
import { RecordSavingsForm } from "@/components/savings/RecordSavingsForm";
import { TransactionList } from "@/components/savings/TransactionList";

type Props = {
  savings: SavingsBundle;
  configured: boolean;
  personalAccounts: UserSavingsAccount[];
  savePools: (pools: SavingsPool[]) => Promise<void>;
  saveGoals: (goals: SavingsGoal[]) => Promise<void>;
  recordGoalDeposit: (
    goalId: string,
    payload: { amount: number; occurredAt?: string; note?: string }
  ) => Promise<void>;
  recordPoolTransaction: (
    poolId: string,
    payload: {
      amount: number;
      occurredAt?: string;
      kind?: "deposit" | "withdrawal";
      note?: string;
      goalId?: string;
    }
  ) => Promise<void>;
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

export function TabSavings({
  savings,
  configured,
  personalAccounts,
  savePools,
  saveGoals,
  recordGoalDeposit,
  recordPoolTransaction,
}: Props) {
  const [pools, setPools] = useState(savings.pools);
  const [goals, setGoals] = useState(savings.goals);
  const [editingPools, setEditingPools] = useState(false);
  const [editingPersonalGoals, setEditingPersonalGoals] = useState(false);
  const [editingSharedGoals, setEditingSharedGoals] = useState(false);
  const [savingPools, setSavingPools] = useState(false);
  const [savingGoals, setSavingGoals] = useState(false);
  const [msg, setMsg] = useState("");
  const [poolTxKey, setPoolTxKey] = useState(0);

  useEffect(() => {
    setPools(savings.pools);
    setGoals(savings.goals);
    console.info("[TabSavings] synced from server");
  }, [savings.pools, savings.goals, savings.totals.jointCash]);

  const personalGoals = goals.filter((g) => g.scope === "individual");
  const sharedGoals = goals.filter((g) => g.scope === "shared");
  const personalSummary = goalsSummary({
    goals: goalsFromSavingsGoals(personalGoals),
  } as DashboardState);
  const sharedSummary = goalsSummary({
    goals: goalsFromSavingsGoals(sharedGoals),
  } as DashboardState);

  const persistPools = async () => {
    setSavingPools(true);
    setMsg("");
    try {
      await savePools(pools);
      setMsg("Pools saved");
      setEditingPools(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingPools(false);
    }
  };

  const persistGoals = async () => {
    setSavingGoals(true);
    setMsg("");
    try {
      await saveGoals(goals);
      setMsg("Goals saved");
      setEditingPersonalGoals(false);
      setEditingSharedGoals(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingGoals(false);
    }
  };

  if (!configured) {
    return (
      <section className="panel on">
        <p className="note">
          Sign in with Supabase to use shared pools and goals. Personal cash accounts
          are on the <b>ME</b> tab.
        </p>
      </section>
    );
  }

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        <b>Personal cash</b> is on the ME tab. Here you manage joint pools and savings
        goals. Record deposits to keep balances and goal progress in sync.
      </div>
      {msg ? <p className="note">{msg}</p> : null}

      {savings.paired ? (
        <>
          <div className="section-head">
            <h2>Shared pools</h2>
            {editingPools ? (
              <button
                type="button"
                className="btn sm"
                disabled={savingPools}
                onClick={() => void persistPools()}
              >
                {savingPools ? "Saving…" : "Save"}
              </button>
            ) : (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  setPools(savings.pools);
                  setEditingPools(true);
                }}
              >
                Edit
              </button>
            )}
          </div>
          <div className="card">
            {editingPools ? (
              <>
                {pools.map((p, i) => (
                  <div key={p.id} className="toolbar" style={{ marginBottom: 8 }}>
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => {
                        const next = [...pools];
                        next[i] = { ...p, name: e.target.value };
                        setPools(next);
                      }}
                    />
                    <input
                      type="text"
                      value={p.notes}
                      placeholder="Notes"
                      onChange={(e) => {
                        const next = [...pools];
                        next[i] = { ...p, notes: e.target.value };
                        setPools(next);
                      }}
                    />
                    <label className="ctrl" style={{ fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={p.includeInSavings}
                        onChange={(e) => {
                          const next = [...pools];
                          next[i] = { ...p, includeInSavings: e.target.checked };
                          setPools(next);
                        }}
                      />
                      Include in savings total
                    </label>
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
                        includeInSavings: true,
                      },
                    ])
                  }
                >
                  + Shared pool
                </button>
              </>
            ) : pools.length === 0 ? (
              <p className="note">No shared pools yet. Click Edit to add one.</p>
            ) : (
              pools.map((p) => (
                <div key={p.id} style={{ marginBottom: 16 }}>
                  <div className="minirow">
                    <span className="k">{p.name}</span>
                    <span className="v">{fmt2(p.balance)}</span>
                  </div>
                  <RecordSavingsForm
                    label="Record deposit"
                    onSubmit={async ({ amount, occurredAt, note }) => {
                      await recordPoolTransaction(p.id, {
                        amount,
                        occurredAt,
                        kind: "deposit",
                        note,
                      });
                      setPoolTxKey((k) => k + 1);
                    }}
                  />
                  <details style={{ marginTop: 8 }}>
                    <summary className="note">Transaction history</summary>
                    <TransactionList
                      fetchUrl={`/api/savings/pools/${p.id}/transactions?limit=10`}
                      refreshKey={poolTxKey}
                    />
                  </details>
                </div>
              ))
            )}
            <p className="note" style={{ marginTop: 8 }}>
              Joint savings total: {fmt2(savings.totals.jointSavingsCash ?? savings.totals.jointCash)}
            </p>
          </div>
        </>
      ) : (
        <p className="note">Link a partner in ME → Settings to add shared savings pools.</p>
      )}

      <div className="section-head">
        <h2>Your goals</h2>
        {editingPersonalGoals ? (
          <button
            type="button"
            className="btn sm"
            disabled={savingGoals}
            onClick={() => void persistGoals()}
          >
            {savingGoals ? "Saving…" : "Save"}
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setGoals(savings.goals);
              setEditingPersonalGoals(true);
            }}
          >
            Edit
          </button>
        )}
      </div>
      <GoalsSection
        editing={editingPersonalGoals}
        goals={personalGoals}
        allGoals={goals}
        setGoals={setGoals}
        scope="individual"
        summary={personalSummary}
        personalAccounts={personalAccounts}
        pools={pools}
        recordGoalDeposit={recordGoalDeposit}
      />

      {savings.paired ? (
        <>
          <div className="section-head">
            <h2>Shared goals</h2>
            {editingSharedGoals ? (
              <button
                type="button"
                className="btn sm"
                disabled={savingGoals}
                onClick={() => void persistGoals()}
              >
                {savingGoals ? "Saving…" : "Save"}
              </button>
            ) : (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  setGoals(savings.goals);
                  setEditingSharedGoals(true);
                }}
              >
                Edit
              </button>
            )}
          </div>
          <GoalsSection
            editing={editingSharedGoals}
            goals={sharedGoals}
            allGoals={goals}
            setGoals={setGoals}
            scope="shared"
            summary={sharedSummary}
            personalAccounts={personalAccounts}
            pools={pools}
            recordGoalDeposit={recordGoalDeposit}
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
  personalAccounts,
  pools,
  recordGoalDeposit,
}: {
  editing: boolean;
  goals: SavingsGoal[];
  allGoals: SavingsGoal[];
  setGoals: (g: SavingsGoal[]) => void;
  scope: "individual" | "shared";
  summary: ReturnType<typeof goalsSummary>;
  personalAccounts: UserSavingsAccount[];
  pools: SavingsPool[];
  recordGoalDeposit: Props["recordGoalDeposit"];
}) {
  const { rows, totT, totMonthly } = summary;

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

  const linkOptions =
    scope === "shared"
      ? pools.map((p) => ({ id: p.id, label: p.name, type: "pool" as const }))
      : personalAccounts.map((a) => ({
          id: a.id,
          label: a.name,
          type: "account" as const,
        }));

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
              <input
                type="month"
                value={g.targetDate?.slice(0, 7) ?? "2028-01"}
                onChange={(e) => update(i, { targetDate: `${e.target.value}-01` })}
              />
              <NumInput
                value={g.monthlyContribution}
                onChange={(n) => update(i, { monthlyContribution: n })}
              />
              <select
                value={
                  scope === "shared"
                    ? (g.linkedPoolId ?? "")
                    : (g.linkedAccountId ?? "")
                }
                onChange={(e) => {
                  const v = e.target.value || null;
                  if (scope === "shared") {
                    update(i, { linkedPoolId: v, linkedAccountId: null });
                  } else {
                    update(i, { linkedAccountId: v, linkedPoolId: null });
                  }
                }}
              >
                <option value="">No linked jar</option>
                {linkOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
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
      ) : goals.length === 0 ? (
        <p className="note">No goals yet. Click Edit to add one.</p>
      ) : (
        goals.map((g) => {
          const row = rows.find((r) => r.name === g.name);
          return (
            <div key={g.id} style={{ marginBottom: 16 }}>
              <div className="minirow">
                <span className="k">{g.name}</span>
                <span className="v">
                  {fmt2(g.savedAmount)} / {fmt(g.targetAmount)}
                  {row ? ` · ${fmt(row.need)}/mo needed` : ""}
                </span>
              </div>
              {(scope === "shared" && g.linkedPoolId) ||
              (scope === "individual" && g.linkedAccountId) ? (
                <RecordSavingsForm
                  label="Record savings toward this goal"
                  onSubmit={async (payload) => {
                    await recordGoalDeposit(g.id, payload);
                  }}
                />
              ) : (
                <p className="note">
                  Link a {scope === "shared" ? "shared pool" : "personal account"} in Edit
                  to record savings that update balances.
                </p>
              )}
            </div>
          );
        })
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
