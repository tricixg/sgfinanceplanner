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
import { SavingsLedgerModal } from "@/components/savings/SavingsLedgerModal";
import { GoalsProgressBar } from "@/components/savings/GoalsProgressBar";
import { Snackbar } from "@/components/Snackbar";
import { useSnackbar } from "@/hooks/useSnackbar";

type Props = {
  savings: SavingsBundle;
  configured: boolean;
  loading?: boolean;
  personalAccounts: UserSavingsAccount[];
  savePools: (pools: SavingsPool[]) => Promise<void>;
  saveGoals: (goals: SavingsGoal[]) => Promise<void>;
  recordPoolTransaction: (
    poolId: string,
    payload: {
      amount: number;
      occurredAt?: string;
      kind?: "deposit" | "withdrawal" | "adjustment";
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
  loading = false,
  personalAccounts,
  savePools,
  saveGoals,
  recordPoolTransaction,
}: Props) {
  const [pools, setPools] = useState(savings.pools);
  const [goals, setGoals] = useState(savings.goals);
  const [editingPools, setEditingPools] = useState(false);
  const [editingPersonalGoals, setEditingPersonalGoals] = useState(false);
  const [editingSharedGoals, setEditingSharedGoals] = useState(false);
  const [savingPools, setSavingPools] = useState(false);
  const [savingGoals, setSavingGoals] = useState(false);
  const snackbar = useSnackbar();
  const [txRefresh, setTxRefresh] = useState(0);
  const [ledgerPoolId, setLedgerPoolId] = useState<string | null>(null);

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
    try {
      await savePools(pools);
      snackbar.show("Pools saved");
      setEditingPools(false);
    } catch (e) {
      snackbar.show(e instanceof Error ? e.message : "Save failed", { error: true });
    } finally {
      setSavingPools(false);
    }
  };

  const persistGoals = async () => {
    setSavingGoals(true);
    try {
      await saveGoals(goals);
      snackbar.show("Goals saved");
      setEditingPersonalGoals(false);
      setEditingSharedGoals(false);
    } catch (e) {
      snackbar.show(e instanceof Error ? e.message : "Save failed", { error: true });
    } finally {
      setSavingGoals(false);
    }
  };

  if (loading || !configured) {
    return (
      <section className="panel on">
        <p className="loading">Loading your financial data…</p>
      </section>
    );
  }

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        <b>Personal cash</b> is on the Cash Accounts tab. Click a shared pool to record transactions.
        Goals below are progress stats — use Edit to change targets and timelines.
      </div>
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
              <>
                <div className="table-scroll">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Pool</th>
                        <th className="num">Balance</th>
                        <th>In savings?</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savings.pools.map((p) => (
                        <tr
                          key={p.id}
                          className="ledger-row"
                          tabIndex={0}
                          role="button"
                          onClick={() => {
                            setLedgerPoolId(p.id);
                            console.info("[TabSavings] opened pool ledger", { id: p.id });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setLedgerPoolId(p.id);
                            }
                          }}
                        >
                          <td>
                            <strong>{p.name}</strong>
                          </td>
                          <td className="num">{fmt2(p.balance)}</td>
                          <td>{p.includeInSavings ? "Yes" : "No"}</td>
                          <td className="note" style={{ fontSize: 12 }}>
                            {p.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
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
        pools={savings.pools}
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
            pools={savings.pools}
          />
        </>
      ) : null}

      {(() => {
        const pool =
          ledgerPoolId && !editingPools
            ? (savings.pools.find((p) => p.id === ledgerPoolId) ?? null)
            : null;
        if (!pool) return null;
        return (
          <SavingsLedgerModal
            target={{ variant: "pool", pool }}
            txRefresh={txRefresh}
            goalOptions={sharedGoals.map((g) => ({ id: g.id, name: g.name }))}
            onClose={() => setLedgerPoolId(null)}
            onRecord={async (payload) => {
              await recordPoolTransaction(pool.id, payload);
              setTxRefresh((k) => k + 1);
            }}
          />
        );
      })()}

      <Snackbar
        message={snackbar.message}
        variant={snackbar.variant}
        durationMs={snackbar.durationMs}
        onDismiss={snackbar.dismiss}
      />
    </section>
  );
}

function goalLinkedLabel(
  g: SavingsGoal,
  personalAccounts: UserSavingsAccount[],
  pools: SavingsPool[]
): string | null {
  if (g.linkedAccountId) {
    return personalAccounts.find((a) => a.id === g.linkedAccountId)?.name ?? null;
  }
  if (g.linkedPoolId) {
    return pools.find((p) => p.id === g.linkedPoolId)?.name ?? null;
  }
  return null;
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
}: {
  editing: boolean;
  goals: SavingsGoal[];
  allGoals: SavingsGoal[];
  setGoals: (g: SavingsGoal[]) => void;
  scope: "individual" | "shared";
  summary: ReturnType<typeof goalsSummary>;
  personalAccounts: UserSavingsAccount[];
  pools: SavingsPool[];
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
          <div className="table-scroll">
            <table className="goals-table">
              <thead>
                <tr>
                  <th>Goal</th>
                  <th className="num">Target</th>
                  <th>By</th>
                  <th className="num">Plan/mo</th>
                  <th>{scope === "shared" ? "Pool" : "Account"}</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {goals.map((g, i) => (
                  <tr key={g.id}>
                    <td>
                      <input
                        type="text"
                        value={g.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                        style={{ width: "100%", minWidth: 120 }}
                      />
                    </td>
                    <td className="num">
                      <NumInput
                        value={g.targetAmount}
                        onChange={(n) => update(i, { targetAmount: n })}
                      />
                    </td>
                    <td>
                      <input
                        type="month"
                        value={g.targetDate?.slice(0, 7) ?? "2028-01"}
                        onChange={(e) =>
                          update(i, { targetDate: `${e.target.value}-01` })
                        }
                      />
                    </td>
                    <td className="num">
                      <NumInput
                        value={g.monthlyContribution}
                        onChange={(n) => update(i, { monthlyContribution: n })}
                      />
                    </td>
                    <td>
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
                        style={{ width: "100%", minWidth: 100 }}
                      >
                        <option value="">—</option>
                        {linkOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn del sm"
                        onClick={() => setGoals(allGoals.filter((x) => x.id !== g.id))}
                      >
                        del
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            style={{ marginTop: 8 }}
            onClick={add}
          >
            + Goal
          </button>
        </>
      ) : goals.length === 0 ? (
        <p className="note">No goals yet. Click Edit to add one.</p>
      ) : (
        <div className="table-scroll">
          <table className="goals-table">
            <thead>
              <tr>
                <th>Goal</th>
                <th className="num">Saved</th>
                <th className="num">Target</th>
                <th className="num">Need/mo</th>
                <th>By</th>
                <th>{scope === "shared" ? "Pool" : "Account"}</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((g) => {
                const row = rows.find((r) => r.name === g.name);
                const linked = goalLinkedLabel(g, personalAccounts, pools);
                const jarHint =
                  scope === "shared" ? "Use pool above" : "Use ME account";
                return (
                  <tr key={g.id}>
                    <td>
                      <strong>{g.name || "—"}</strong>
                    </td>
                    <td className="num">{fmt2(g.savedAmount)}</td>
                    <td className="num">{fmt(g.targetAmount)}</td>
                    <td className="num">{row ? fmt(row.need) : "—"}</td>
                    <td>{g.targetDate ? g.targetDate.slice(0, 7) : "—"}</td>
                    <td className="note" style={{ fontSize: 12 }}>
                      {linked ?? jarHint}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td className="num">{fmt2(rows.reduce((s, r) => s + r.saved, 0))}</td>
                <td className="num">{fmt(totT)}</td>
                <td className="num">{fmt(totMonthly)}/mo</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {!editing && goals.length > 0 ? <GoalsProgressBar goals={goals} /> : null}
    </div>
  );
}
