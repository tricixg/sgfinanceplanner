"use client";

import { useMemo, useState } from "react";
import type { BenefitClaim, BenefitInput, BenefitUsage } from "@/lib/benefits/types";
import { useBenefits } from "@/hooks/useBenefits";
import { useIncomeCategories } from "@/hooks/useIncomeCategories";
import { DecimalInput, DecimalTextInput } from "@/components/DecimalInput";
import { fmt2 } from "@/lib/finance/helpers";
import { sgtTodayYmd } from "@/lib/time/sgt";

function emptyDraft(sortOrder: number): BenefitInput {
  return {
    name: "",
    limitAmount: 0,
    cycleMonths: 12,
    cycleAnchorDate: sgtTodayYmd(),
    incomeCategoryId: null,
    notes: "",
    sortOrder,
    hidden: false,
  };
}

function toDraft(b: BenefitUsage): BenefitInput {
  return {
    id: b.id,
    name: b.name,
    limitAmount: b.limitAmount,
    cycleMonths: b.cycleMonths,
    cycleAnchorDate: b.cycleAnchorDate,
    incomeCategoryId: b.incomeCategoryId,
    notes: b.notes,
    sortOrder: b.sortOrder,
    hidden: b.hidden,
  };
}

function cycleLabel(b: BenefitUsage): string {
  if (!b.cycleMonths) return "One-time — never resets";
  if (b.cycleMonths === 12) return `Resets annually · next reset ${b.cycleEnd}`;
  if (b.cycleMonths === 1) return `Resets monthly · next reset ${b.cycleEnd}`;
  if (b.cycleMonths % 12 === 0) {
    return `Resets every ${b.cycleMonths / 12} years · next reset ${b.cycleEnd}`;
  }
  return `Resets every ${b.cycleMonths} months · next reset ${b.cycleEnd}`;
}

function progressPct(used: number, limit: number | null): number {
  if (limit == null || limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, (used / limit) * 100));
}

type ClaimFormState = { amount: string; claimedAt: string; note: string };

function emptyClaimForm(): ClaimFormState {
  return { amount: "", claimedAt: sgtTodayYmd(), note: "" };
}

type Props = {
  enabled: boolean;
};

export function TabBenefits({ enabled }: Props) {
  const benefitsApi = useBenefits(enabled);
  const { categories: incomeCategories } = useIncomeCategories(enabled);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BenefitInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [claimForms, setClaimForms] = useState<Record<string, ClaimFormState>>({});
  const [claimBusyId, setClaimBusyId] = useState<string | null>(null);
  const [claimMsg, setClaimMsg] = useState<Record<string, string>>({});

  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);
  const [editClaimForms, setEditClaimForms] = useState<Record<string, ClaimFormState>>({});

  const incomeCategoryName = useMemo(() => {
    const map = new Map(incomeCategories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? map.get(id) ?? "—" : "—");
  }, [incomeCategories]);

  const startEdit = () => {
    setDraft(benefitsApi.benefits.map(toDraft));
    setEditing(true);
    console.info("[TabBenefits] edit on");
  };

  const cancelEdit = () => {
    setEditing(false);
    setMsg("");
  };

  const saveEdit = async () => {
    setSaving(true);
    setMsg("");
    try {
      await benefitsApi.save(draft);
      setEditing(false);
      console.info("[TabBenefits] saved");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to save benefits");
    } finally {
      setSaving(false);
    }
  };

  const updateRow = (i: number, patch: Partial<BenefitInput>) => {
    setDraft((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  };

  const addRow = () => {
    setDraft((prev) => [...prev, emptyDraft(prev.length)]);
  };

  const removeRow = (i: number) => {
    setDraft((prev) => prev.filter((_, j) => j !== i));
  };

  const claimForm = (benefitId: string): ClaimFormState =>
    claimForms[benefitId] ?? emptyClaimForm();

  const updateClaimForm = (benefitId: string, patch: Partial<ClaimFormState>) => {
    setClaimForms((prev) => ({ ...prev, [benefitId]: { ...claimForm(benefitId), ...patch } }));
  };

  const logUsage = async (benefitId: string) => {
    const form = claimForm(benefitId);
    const amount = Number(form.amount || 0);
    if (!(amount > 0)) {
      setClaimMsg((prev) => ({ ...prev, [benefitId]: "Enter an amount" }));
      return;
    }
    setClaimBusyId(benefitId);
    setClaimMsg((prev) => ({ ...prev, [benefitId]: "" }));
    try {
      await benefitsApi.logClaim(benefitId, {
        amount,
        claimedAt: form.claimedAt || undefined,
        note: form.note || undefined,
      });
      setClaimForms((prev) => ({ ...prev, [benefitId]: emptyClaimForm() }));
      console.info("[TabBenefits] usage logged", { benefitId, amount });
    } catch (e) {
      setClaimMsg((prev) => ({
        ...prev,
        [benefitId]: e instanceof Error ? e.message : "Failed to log usage",
      }));
    } finally {
      setClaimBusyId(null);
    }
  };

  const startEditClaim = (claim: BenefitClaim) => {
    setEditClaimForms((prev) => ({
      ...prev,
      [claim.id]: { amount: String(claim.amount), claimedAt: claim.claimedAt, note: claim.note },
    }));
    setEditingClaimId(claim.id);
    setClaimMsg((prev) => ({ ...prev, [claim.benefitId]: "" }));
  };

  const cancelEditClaim = () => {
    setEditingClaimId(null);
  };

  const updateEditClaimForm = (claimId: string, patch: Partial<ClaimFormState>) => {
    setEditClaimForms((prev) => ({
      ...prev,
      [claimId]: { ...prev[claimId], ...patch },
    }));
  };

  const saveEditClaim = async (benefitId: string, claimId: string) => {
    const form = editClaimForms[claimId];
    const amount = Number(form?.amount || 0);
    if (!(amount > 0)) {
      setClaimMsg((prev) => ({ ...prev, [benefitId]: "Enter an amount" }));
      return;
    }
    setClaimBusyId(claimId);
    setClaimMsg((prev) => ({ ...prev, [benefitId]: "" }));
    try {
      await benefitsApi.updateClaim(benefitId, claimId, {
        amount,
        claimedAt: form.claimedAt || undefined,
        note: form.note,
      });
      setEditingClaimId(null);
      console.info("[TabBenefits] claim updated", { benefitId, claimId });
    } catch (e) {
      setClaimMsg((prev) => ({
        ...prev,
        [benefitId]: e instanceof Error ? e.message : "Failed to update claim",
      }));
    } finally {
      setClaimBusyId(null);
    }
  };

  const removeClaim = async (benefitId: string, claimId: string) => {
    if (!confirm("Remove this claim and restore the amount to the benefit?")) return;
    setClaimBusyId(claimId);
    try {
      await benefitsApi.deleteClaim(benefitId, claimId);
    } catch (e) {
      setClaimMsg((prev) => ({
        ...prev,
        [benefitId]: e instanceof Error ? e.message : "Failed to delete claim",
      }));
    } finally {
      setClaimBusyId(null);
    }
  };

  const renderClaimsTable = (claims: BenefitClaim[], benefitId: string) => (
    <div className="table-scroll">
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Date</th>
            <th className="num">Amount</th>
            <th>Note</th>
            <th>Via</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {claims.map((c) => {
            const isEditing = editingClaimId === c.id;
            const editForm = editClaimForms[c.id];
            if (isEditing && editForm) {
              return (
                <tr key={c.id}>
                  <td>
                    <input
                      type="date"
                      value={editForm.claimedAt}
                      onChange={(e) =>
                        updateEditClaimForm(c.id, { claimedAt: e.target.value })
                      }
                    />
                  </td>
                  <td className="num">
                    <DecimalTextInput
                      value={editForm.amount}
                      onChange={(v) => updateEditClaimForm(c.id, { amount: v })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={editForm.note}
                      onChange={(e) =>
                        updateEditClaimForm(c.id, { note: e.target.value })
                      }
                    />
                  </td>
                  <td className="note" style={{ fontSize: 12 }}>
                    {c.sourceRecordType ? "Reimbursement" : "Manual"}
                  </td>
                  <td style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={claimBusyId === c.id}
                      onClick={cancelEditClaim}
                    >
                      cancel
                    </button>
                    <button
                      type="button"
                      className="btn sm"
                      disabled={claimBusyId === c.id}
                      onClick={() => void saveEditClaim(benefitId, c.id)}
                    >
                      save
                    </button>
                  </td>
                </tr>
              );
            }
            return (
              <tr key={c.id}>
                <td>{c.claimedAt}</td>
                <td className="num">{fmt2(c.amount)}</td>
                <td className="note" style={{ fontSize: 12 }}>
                  {c.note || "—"}
                </td>
                <td className="note" style={{ fontSize: 12 }}>
                  {c.sourceRecordType ? "Reimbursement" : "Manual"}
                </td>
                <td style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={claimBusyId === c.id}
                    onClick={() => startEditClaim(c)}
                  >
                    edit
                  </button>
                  <button
                    type="button"
                    className="btn del sm"
                    disabled={claimBusyId === c.id}
                    onClick={() => void removeClaim(benefitId, c.id)}
                  >
                    del
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Add any benefit — dental, specialist medical, WFH allowance, a monthly Communication
        allowance, and so on. Give it a cycle length in months (1 for monthly, 12 for annual,
        24 for every 2 years, …) or leave it blank for a one-time allowance that never resets.
        Tick &quot;No limit&quot; for benefits you just want to track without a cap. Reimbursing
        a claim and picking a benefit there deducts it automatically, using the claim date you
        set there (not necessarily the day the reimbursement lands) to decide which cycle it
        counts toward — edit a claim&apos;s date below any time that&apos;s wrong. Use &quot;Log
        usage&quot; below for claims that don&apos;t go through reimbursement (e.g. paid
        directly to the clinic).
      </div>

      <div className="section-head">
        <h2>Benefits</h2>
        {editing ? (
          <div className="toolbar">
            <button type="button" className="btn ghost sm" onClick={cancelEdit} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn sm" onClick={() => void saveEdit()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        ) : (
          <button type="button" className="btn ghost sm" onClick={startEdit}>
            Edit
          </button>
        )}
      </div>
      {msg ? <p className="pin-error">{msg}</p> : null}

      <div className="card">
        {!benefitsApi.configured ? (
          <p className="note">Sign in to track benefits.</p>
        ) : editing ? (
          <>
            {draft.length === 0 ? (
              <p className="note">No benefits yet. Add one below.</p>
            ) : (
              <div className="table-scroll">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Limit</th>
                      <th>Cycle (months, blank = one-time)</th>
                      <th>Cycle anchor date</th>
                      <th>Linked claim category</th>
                      <th>Notes</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.map((b, i) => (
                      <tr key={b.id ?? `new-${i}`}>
                        <td>
                          <input
                            type="text"
                            value={b.name}
                            placeholder="e.g. Dental"
                            onChange={(e) => updateRow(i, { name: e.target.value })}
                          />
                        </td>
                        <td>
                          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                            <input
                              type="checkbox"
                              checked={b.limitAmount == null}
                              onChange={(e) =>
                                updateRow(i, { limitAmount: e.target.checked ? null : 0 })
                              }
                            />
                            No limit
                          </label>
                          {b.limitAmount != null ? (
                            <DecimalInput
                              value={b.limitAmount}
                              step={1}
                              min={0}
                              onChange={(v) => updateRow(i, { limitAmount: v })}
                            />
                          ) : null}
                        </td>
                        <td>
                          <DecimalInput
                            value={b.cycleMonths ?? 0}
                            step={1}
                            min={0}
                            onChange={(v) => updateRow(i, { cycleMonths: v > 0 ? v : null })}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            value={b.cycleAnchorDate}
                            onChange={(e) => updateRow(i, { cycleAnchorDate: e.target.value })}
                          />
                        </td>
                        <td>
                          <select
                            value={b.incomeCategoryId ?? ""}
                            onChange={(e) =>
                              updateRow(i, { incomeCategoryId: e.target.value || null })
                            }
                          >
                            <option value="">— None —</option>
                            {incomeCategories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="text"
                            value={b.notes ?? ""}
                            placeholder="Notes"
                            onChange={(e) => updateRow(i, { notes: e.target.value })}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn del sm"
                            onClick={() => removeRow(i)}
                          >
                            del
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="ctrl" style={{ marginTop: 10 }}>
              <button type="button" className="btn ghost sm" onClick={addRow}>
                + Add benefit
              </button>
            </div>
          </>
        ) : benefitsApi.benefits.length === 0 ? (
          <p className="note">No benefits yet. Click Edit to add dental, medical, WFH, etc.</p>
        ) : (
          <div className="grid g2">
            {benefitsApi.benefits.map((b) => {
              const pct = progressPct(b.usedInCycle, b.limitAmount);
              const over = b.limitAmount != null && b.limitAmount > 0 && b.usedInCycle > b.limitAmount;
              const form = claimForm(b.id);
              return (
                <div key={b.id} className="card">
                  <div className="category-budget-head">
                    <div>
                      <h3 className="category-budget-title">{b.name}</h3>
                      {b.incomeCategoryId ? (
                        <span className="tag t-ok">
                          Claim as: {incomeCategoryName(b.incomeCategoryId)}
                        </span>
                      ) : null}
                    </div>
                    <div className="category-budget-stats">
                      <span>
                        <span className="lbl">Limit</span>{" "}
                        {b.limitAmount == null ? "No limit" : fmt2(b.limitAmount)}
                      </span>
                      <span>
                        <span className="lbl">Used</span> {fmt2(b.usedInCycle)}
                      </span>
                      {b.remaining != null ? (
                        <span className={b.remaining < 0 ? "neg" : ""}>
                          <span className="lbl">Remaining</span> {fmt2(b.remaining)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {b.limitAmount != null && b.limitAmount > 0 ? (
                    <div className="category-budget-progress-wrap">
                      <div
                        className={`category-budget-progress ${over ? "category-budget-progress--over" : ""}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : null}

                  <p className="note" style={{ fontSize: 12 }}>
                    {cycleLabel(b)}
                    {b.notes ? ` · ${b.notes}` : ""}
                  </p>

                  <div className="ctrl" style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 12 }}>
                      Log usage amount
                      <DecimalTextInput
                        value={form.amount}
                        onChange={(v) => updateClaimForm(b.id, { amount: v })}
                      />
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Date
                      <input
                        type="date"
                        value={form.claimedAt}
                        onChange={(e) => updateClaimForm(b.id, { claimedAt: e.target.value })}
                      />
                    </label>
                    <label style={{ fontSize: 12 }}>
                      Note
                      <input
                        type="text"
                        value={form.note}
                        placeholder="Optional"
                        onChange={(e) => updateClaimForm(b.id, { note: e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={claimBusyId === b.id}
                      onClick={() => void logUsage(b.id)}
                    >
                      {claimBusyId === b.id ? "Saving…" : "Log usage"}
                    </button>
                  </div>
                  {claimMsg[b.id] ? <p className="pin-error">{claimMsg[b.id]}</p> : null}

                  {b.currentCycleClaims.length ? (
                    renderClaimsTable(b.currentCycleClaims, b.id)
                  ) : (
                    <p className="note" style={{ fontSize: 12 }}>
                      No claims logged yet.
                    </p>
                  )}

                  {b.pastCycles.length > 0 ? (
                    <details className="debt-archive" style={{ marginTop: 12 }}>
                      <summary>Past cycles — {b.pastCycles.length}</summary>
                      <div style={{ marginTop: 10 }}>
                        {b.pastCycles.map((p) => {
                          const pPct = progressPct(p.usedInCycle, b.limitAmount);
                          const pOver =
                            b.limitAmount != null &&
                            b.limitAmount > 0 &&
                            p.usedInCycle > b.limitAmount;
                          const pRemaining = b.limitAmount != null ? b.limitAmount - p.usedInCycle : null;
                          const pFullyUsed = pRemaining != null && pRemaining <= 0.01;
                          return (
                            <div key={p.cycleStart} style={{ marginBottom: 14 }}>
                              <div className="category-budget-head">
                                <p className="note" style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>
                                  {p.cycleStart} → {p.cycleEnd}
                                  {pFullyUsed ? (
                                    <span className="tag t-live" style={{ marginLeft: 6 }}>
                                      fully used
                                    </span>
                                  ) : null}
                                </p>
                                <div className="category-budget-stats">
                                  <span>
                                    <span className="lbl">Used</span> {fmt2(p.usedInCycle)}
                                  </span>
                                  {b.limitAmount != null ? (
                                    <>
                                      <span>
                                        <span className="lbl">Limit</span> {fmt2(b.limitAmount)}
                                      </span>
                                      <span className={pRemaining != null && pRemaining < 0 ? "neg" : ""}>
                                        <span className="lbl">
                                          {pOver ? "Over by" : "Remaining"}
                                        </span>{" "}
                                        {fmt2(Math.abs(pRemaining ?? 0))}
                                      </span>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                              {b.limitAmount != null && b.limitAmount > 0 ? (
                                <div className="category-budget-progress-wrap">
                                  <div
                                    className={`category-budget-progress ${pOver ? "category-budget-progress--over" : ""}`}
                                    style={{ width: `${pPct}%` }}
                                  />
                                </div>
                              ) : null}
                              {renderClaimsTable(p.claims, b.id)}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
