"use client";

import { useContext, useMemo, useState } from "react";
import type { DashboardState } from "@/lib/types";
import {
  MILE_PROGRAMS,
  type MileProgramKey,
  type MilesBalance,
  type MilesPlannerPrefs,
} from "@/lib/miles/types";
import { MILES_BANK_PRESETS, type MilesBankPreset } from "@/lib/miles/presets";
import { estimateRedemption } from "@/lib/miles/redemption-chart";
import { DecimalInput } from "@/components/DecimalInput";
import { AppDataContext } from "@/contexts/app-data-contexts";
import { useMiles } from "@/hooks/useMiles";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
};

function fmtMiles(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function resolveMilesPrefs(S: DashboardState): MilesPlannerPrefs {
  return S.milesPlanner ?? { goalMiles: 0, displayProgram: "krisflyer" };
}

function emptyBalance(sortOrder: number): MilesBalance {
  return {
    id: `new-${sortOrder}-${Date.now()}`,
    userId: "",
    name: "",
    pointsBalance: 0,
    expiringAmount: null,
    expiryDate: null,
    rates: {},
    notes: "",
    sortOrder,
  };
}

export function TabMiles({ state: S, setState }: Props) {
  const appData = useContext(AppDataContext);
  const milesApi = useMiles();
  const prefs = resolveMilesPrefs(S);

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(0);
  const [savingGoal, setSavingGoal] = useState(false);

  const [editingBalances, setEditingBalances] = useState(false);
  const [balancesDraft, setBalancesDraft] = useState<MilesBalance[]>([]);
  const [savingBalances, setSavingBalances] = useState(false);
  const [balancesMsg, setBalancesMsg] = useState("");

  const saveMilesPrefs = async (patch: Partial<MilesPlannerPrefs>) => {
    const next = { ...prefs, ...patch };
    if (appData?.configured) {
      await appData.saveProfile({ milesPlanner: next });
    } else {
      setState((prev) => ({ ...prev, milesPlanner: next }));
    }
  };

  const startGoalEdit = () => {
    setGoalDraft(prefs.goalMiles);
    setEditingGoal(true);
    console.info("[TabMiles] goal edit on");
  };

  const saveGoal = async () => {
    setSavingGoal(true);
    try {
      await saveMilesPrefs({ goalMiles: goalDraft });
      setEditingGoal(false);
      console.info("[TabMiles] goal saved", goalDraft);
    } catch (e) {
      console.error("[TabMiles] goal save failed", e);
    } finally {
      setSavingGoal(false);
    }
  };

  const changeDisplayProgram = async (program: MileProgramKey) => {
    try {
      await saveMilesPrefs({ displayProgram: program });
      console.info("[TabMiles] display program saved", program);
    } catch (e) {
      console.error("[TabMiles] display program save failed", e);
    }
  };

  const goalMiles = editingGoal ? goalDraft : prefs.goalMiles;
  const displayProgram = prefs.displayProgram;
  const displayProgramLabel =
    MILE_PROGRAMS.find((p) => p.key === displayProgram)?.label ?? displayProgram;

  const { achievable, next } = useMemo(() => estimateRedemption(goalMiles), [goalMiles]);

  const startBalancesEdit = () => {
    setBalancesDraft(milesApi.balances);
    setEditingBalances(true);
    console.info("[TabMiles] balances edit on");
  };

  const saveBalancesEdit = async () => {
    setSavingBalances(true);
    setBalancesMsg("");
    try {
      await milesApi.saveBalances(balancesDraft);
      setEditingBalances(false);
      console.info("[TabMiles] balances saved");
    } catch (e) {
      setBalancesMsg(e instanceof Error ? e.message : "Failed to save miles balances");
    } finally {
      setSavingBalances(false);
    }
  };

  const updateBalance = (i: number, patch: Partial<MilesBalance>) => {
    setBalancesDraft((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  };

  const updateBalanceRate = (i: number, program: MileProgramKey, rate: number) => {
    setBalancesDraft((prev) =>
      prev.map((b, j) => {
        if (j !== i) return b;
        const rates = { ...b.rates };
        if (rate > 0) rates[program] = rate;
        else delete rates[program];
        return { ...b, rates };
      })
    );
  };

  const addBalanceRow = (preset?: MilesBankPreset) => {
    setBalancesDraft((prev) => [
      ...prev,
      {
        ...emptyBalance(prev.length),
        name: preset?.name ?? "",
        rates: preset?.rates ?? {},
      },
    ]);
  };

  const removeBalanceRow = (i: number) => {
    setBalancesDraft((prev) => prev.filter((_, j) => j !== i));
  };

  const displayBalances = editingBalances ? balancesDraft : milesApi.balances;
  const totalMiles = milesApi.totals?.milesByProgram[displayProgram] ?? 0;
  const uncounted = milesApi.totals?.uncountedByProgram[displayProgram] ?? 0;

  const soonestExpiring = useMemo(
    () =>
      milesApi.balances
        .filter((b): b is MilesBalance & { expiryDate: string } => Boolean(b.expiryDate))
        .sort((a, b) => (a.expiryDate < b.expiryDate ? -1 : 1))
        .slice(0, 3),
    [milesApi.balances]
  );

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Set a miles goal to see what destination and cabin it could redeem, track your bank
        points below, and pick which frequent-flyer program to show the total in. Conversion
        rates are starting estimates — verify against your bank&apos;s current transfer chart.
      </div>

      <div className="section-head">
        <h2>Miles goal</h2>
        {editingGoal ? (
          <button
            type="button"
            className="btn sm"
            disabled={savingGoal}
            onClick={() => void saveGoal()}
          >
            {savingGoal ? "Saving…" : "Save"}
          </button>
        ) : (
          <button type="button" className="btn ghost sm" onClick={startGoalEdit}>
            Edit
          </button>
        )}
      </div>
      <div className="card">
        {editingGoal ? (
          <div className="ctrl">
            <label>
              Goal (miles)
              <DecimalInput value={goalDraft} step={1000} min={0} onChange={setGoalDraft} />
            </label>
          </div>
        ) : (
          <div className="grid g2">
            <div className="stat accent">
              <div className="lbl">Miles goal</div>
              <div className="val">{fmtMiles(goalMiles)} miles</div>
            </div>
          </div>
        )}
        {achievable ? (
          <p>
            You can redeem: <b>{achievable.cabin}</b> to {achievable.region} (
            {achievable.examples}) — ~{fmtMiles(achievable.milesOneWay)} miles one-way.
          </p>
        ) : (
          <p className="note">Set a goal above to see what you can redeem.</p>
        )}
        {next ? (
          <p className="note">
            {fmtMiles(next.milesOneWay - goalMiles)} more miles for {next.cabin} to{" "}
            {next.region} ({next.examples}).
          </p>
        ) : null}
        <p className="note" style={{ fontSize: 12 }}>
          Approximate one-way KrisFlyer Saver award pricing — actual pricing varies by route,
          date, and award seat availability.
        </p>
      </div>

      <div className="section-head">
        <h2>Total miles</h2>
      </div>
      <div className="ctrl">
        <label>
          Show total in
          <select
            value={displayProgram}
            onChange={(e) => void changeDisplayProgram(e.target.value as MileProgramKey)}
          >
            {MILE_PROGRAMS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid g2">
        <div className="stat accent">
          <div className="lbl">{displayProgramLabel} total</div>
          <div className="val">{fmtMiles(totalMiles)} miles</div>
          {uncounted > 0 ? (
            <div className="note">
              {uncounted} {uncounted === 1 ? "balance" : "balances"} excluded — add a{" "}
              {displayProgramLabel} rate to include
            </div>
          ) : null}
        </div>
        <div className="stat">
          <div className="lbl">Points balances tracked</div>
          <div className="val">{milesApi.balances.length}</div>
        </div>
      </div>

      {soonestExpiring.length ? (
        <div className="callout urgent">
          <span className="ico">Expiring soon</span>
          {soonestExpiring.map((b) => (
            <div key={b.id}>
              <b>{b.name || "Points"}</b>: {fmtMiles(b.expiringAmount ?? b.pointsBalance)} pts
              expiring {b.expiryDate}
            </div>
          ))}
        </div>
      ) : null}

      <div className="section-head">
        <h2>Points balances</h2>
        {editingBalances ? (
          <button
            type="button"
            className="btn sm"
            disabled={savingBalances}
            onClick={() => void saveBalancesEdit()}
          >
            {savingBalances ? "Saving…" : "Save"}
          </button>
        ) : (
          <button type="button" className="btn ghost sm" onClick={startBalancesEdit}>
            Edit
          </button>
        )}
      </div>
      <div className="callout tip" style={{ marginBottom: 12 }}>
        Add a row per bank/points program (e.g. DBS Points, Max Miles) — the rates below each
        row are points needed for 1 mile in that program; leave a program blank if you don&apos;t
        know the rate yet. Add more banks any time you get a new card.
      </div>
      {balancesMsg ? <p className="pin-error">{balancesMsg}</p> : null}

      <div className="card">
        {!milesApi.configured ? (
          <p className="note">Sign in to add points balances.</p>
        ) : editingBalances ? (
          <>
            {balancesDraft.length === 0 ? (
              <p className="note">Add your bank points and Max Miles below.</p>
            ) : (
              <>
                <div className="editrow miles head">
                  <span>Bank / Program</span>
                  <span>Points balance</span>
                  <span>Expiring amount</span>
                  <span>Expiry date</span>
                  <span>Notes</span>
                  <span></span>
                </div>
                {balancesDraft.map((b, i) => (
                  <div key={b.id} style={{ marginBottom: 14 }}>
                    <div className="editrow miles">
                      <input
                        type="text"
                        value={b.name}
                        placeholder="e.g. DBS Points"
                        onChange={(e) => updateBalance(i, { name: e.target.value })}
                      />
                      <DecimalInput
                        value={b.pointsBalance}
                        step={1}
                        min={0}
                        onChange={(v) => updateBalance(i, { pointsBalance: v })}
                      />
                      <DecimalInput
                        value={b.expiringAmount ?? 0}
                        step={1}
                        min={0}
                        onChange={(v) => updateBalance(i, { expiringAmount: v || null })}
                      />
                      <input
                        type="date"
                        value={b.expiryDate ?? ""}
                        onChange={(e) =>
                          updateBalance(i, { expiryDate: e.target.value || null })
                        }
                      />
                      <input
                        type="text"
                        value={b.notes}
                        placeholder="Notes"
                        onChange={(e) => updateBalance(i, { notes: e.target.value })}
                      />
                      <button
                        type="button"
                        className="btn del sm"
                        onClick={() => removeBalanceRow(i)}
                      >
                        del
                      </button>
                    </div>
                    <div className="ctrl" style={{ marginTop: 4, marginBottom: 0 }}>
                      {MILE_PROGRAMS.map((p) => (
                        <label key={p.key} style={{ fontSize: 12 }}>
                          {p.label} rate
                          <DecimalInput
                            value={b.rates[p.key] ?? 0}
                            step={0.1}
                            min={0}
                            onChange={(v) => updateBalanceRate(i, p.key, v)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
            <div className="ctrl" style={{ marginBottom: 0 }}>
              {MILES_BANK_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  className="btn ghost sm"
                  onClick={() => addBalanceRow(preset)}
                >
                  + {preset.name}
                </button>
              ))}
              <button type="button" className="btn ghost sm" onClick={() => addBalanceRow()}>
                + Custom
              </button>
            </div>
          </>
        ) : displayBalances.length === 0 ? (
          <p className="note">No points balances yet. Click Edit to add one.</p>
        ) : (
          <div className="table-scroll">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Bank / Program</th>
                  <th className="num">Points balance</th>
                  <th className="num">{displayProgramLabel} miles</th>
                  <th>Expiry</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {displayBalances.map((b) => {
                  const rate = b.rates[displayProgram];
                  const miles = rate && rate > 0 ? b.pointsBalance / rate : null;
                  return (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.name || "—"}</strong>
                      </td>
                      <td className="num">{fmtMiles(b.pointsBalance)}</td>
                      <td className="num">{miles != null ? fmtMiles(miles) : "—"}</td>
                      <td>
                        {b.expiryDate
                          ? `${fmtMiles(b.expiringAmount ?? b.pointsBalance)} pts · ${b.expiryDate}`
                          : "—"}
                      </td>
                      <td className="note" style={{ fontSize: 12 }}>
                        {b.notes || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
