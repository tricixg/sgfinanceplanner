"use client";

import { useEffect, useMemo, useState } from "react";
import type { SavingsPool, UserSavingsAccount } from "@/lib/savings/types";
import { TransactionList } from "@/components/savings/TransactionList";
import { fmt2 } from "@/lib/finance/helpers";
import { useIncomeCategories } from "@/hooks/useIncomeCategories";
import { DecimalTextInput } from "@/components/DecimalInput";
import { sgtNowInputDateTime } from "@/lib/time/sgt";
import { dispatchDomainEvent } from "@/lib/events/domain-events";

export type LedgerKind = "deposit" | "withdrawal" | "adjustment";

type AdjustmentMode = "set_balance" | "delta";

export type SavingsLedgerTarget =
  | { variant: "account"; account: UserSavingsAccount }
  | { variant: "pool"; pool: SavingsPool };

export type GoalOption = { id: string; name: string };

type Props = {
  target: SavingsLedgerTarget;
  onClose: () => void;
  txRefresh: number;
  /** Personal or shared goals available when recording (optional attribution). */
  goalOptions?: GoalOption[];
  onRecord: (payload: {
    amount: number;
    occurredAt?: string;
    kind: LedgerKind;
    note?: string;
    goalId?: string;
    incomeCategoryId?: string;
  }) => Promise<void>;
};

function useLedgerMeta(target: SavingsLedgerTarget) {
  return useMemo(() => {
    if (target.variant === "account") {
      return {
        title: target.account.name || "Cash account",
        current: target.account.balance,
        historyUrl: `/api/accounts/${target.account.id}/transactions?limit=3`,
        viewMoreHref: `/transactions?accountId=${encodeURIComponent(target.account.id)}`,
        subtitle: target.account.includeInSavings
          ? null
          : "Excluded from savings totals",
        notes: target.account.notes,
      };
    }
    return {
      title: target.pool.name || "Shared pool",
      current: target.pool.balance,
      historyUrl: `/api/savings/pools/${target.pool.id}/transactions?limit=3`,
      viewMoreHref: "/transactions",
      subtitle: target.pool.includeInSavings
        ? "Shared with partner"
        : "Shared · excluded from savings totals",
      notes: target.pool.notes,
    };
  }, [target]);
}

export function SavingsLedgerModal({
  target,
  onClose,
  txRefresh,
  goalOptions = [],
  onRecord,
}: Props) {
  const meta = useLedgerMeta(target);
  const [kind, setKind] = useState<LedgerKind>("deposit");
  const [adjustmentMode, setAdjustmentMode] = useState<AdjustmentMode>("set_balance");
  const [goalId, setGoalId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => sgtNowInputDateTime());
  const [note, setNote] = useState("");
  const [incomeCategoryId, setIncomeCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyKey, setHistoryKey] = useState(txRefresh);

  const { categories: incomeCategories, configured: incomeConfigured } =
    useIncomeCategories(target.variant === "account");

  // Stable identity for the target so the reset effect below only fires when the
  // user actually switches account/pool — not on every parent re-render, which
  // recreates the inline `target` object literal and would otherwise wipe the
  // in-progress selection (e.g. the income category dropdown).
  const targetKey =
    target.variant === "account" ? target.account.id : target.pool.id;

  useEffect(() => {
    setHistoryKey(txRefresh);
  }, [txRefresh]);

  useEffect(() => {
    setGoalId("");
    setAmount("");
    setIncomeCategoryId("");
    setError("");
  }, [targetKey, kind]);

  useEffect(() => {
    if (
      kind === "deposit" &&
      target.variant === "account" &&
      incomeCategories.length &&
      !incomeCategoryId
    ) {
      const salary = incomeCategories.find((c) => c.slug === "salary");
      if (salary) setIncomeCategoryId(salary.id);
    }
  }, [kind, target.variant, incomeCategories, incomeCategoryId]);

  const showIncomeCategory =
    target.variant === "account" && kind === "deposit" && incomeConfigured;

  const showGoalPicker = goalOptions.length > 0 && kind !== "adjustment";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        console.info("[SavingsLedgerModal] closed via Escape");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const resolveAmount = (): number | null => {
    const n = parseFloat(amount);
    if (!Number.isFinite(n)) return null;
    if (kind === "adjustment") {
      if (adjustmentMode === "set_balance") {
        const delta = n - meta.current;
        if (delta === 0) return null;
        return delta;
      }
      if (n === 0) return null;
      return n;
    }
    if (n <= 0) return null;
    return n;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolved = resolveAmount();
    if (resolved === null) {
      setError(
        kind === "adjustment"
          ? adjustmentMode === "set_balance"
            ? "Enter a balance different from the current total"
            : "Enter a non-zero adjustment"
          : "Enter a positive amount"
      );
      return;
    }
    if (showIncomeCategory && !incomeCategoryId) {
      setError("Select an income category");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onRecord({
        amount: resolved,
        occurredAt: new Date(date).toISOString(),
        kind,
        note: note.trim() || undefined,
        goalId: showGoalPicker && goalId ? goalId : undefined,
        incomeCategoryId: showIncomeCategory ? incomeCategoryId : undefined,
      });
      setAmount("");
      setNote("");
      setGoalId("");
      setIncomeCategoryId("");
      setHistoryKey((k) => k + 1);
      dispatchDomainEvent(["savings:changed", "accounts:changed"]);
      console.info("[SavingsLedgerModal] recorded", {
        variant: target.variant,
        kind,
        amount: resolved,
        goalId: goalId || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record");
    } finally {
      setBusy(false);
    }
  };

  const amountPlaceholder =
    kind === "adjustment"
      ? adjustmentMode === "set_balance"
        ? "New balance"
        : "Change by (+/−)"
      : "Amount";

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="savings-ledger-title"
      >
        <div className="modal-header">
          <div>
            <h3 id="savings-ledger-title" style={{ margin: 0 }}>
              {meta.title}
            </h3>
            <p className="note" style={{ margin: "4px 0 0" }}>
              Balance: <strong>{fmt2(meta.current)}</strong>
              {meta.subtitle ? ` · ${meta.subtitle}` : ""}
            </p>
            {meta.notes ? (
              <p className="note" style={{ margin: "4px 0 0" }}>
                {meta.notes}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn ghost sm" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="modal-form">
          <div className="toolbar" style={{ flexWrap: "wrap", marginBottom: 8, gap: 8 }}>
            <label className="ctrl" style={{ fontSize: 13, flex: "1 1 140px" }}>
              <span style={{ display: "block", marginBottom: 4, color: "var(--muted)" }}>
                Type
              </span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as LedgerKind)}
                style={{ width: "100%" }}
              >
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </label>
            {showGoalPicker ? (
              <label className="ctrl" style={{ fontSize: 13, flex: "2 1 200px" }}>
                <span style={{ display: "block", marginBottom: 4, color: "var(--muted)" }}>
                  Savings goal (optional)
                </span>
                <select
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">None — balance only</option>
                  {goalOptions.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name || "Goal"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {showIncomeCategory ? (
              <label className="ctrl" style={{ fontSize: 13, flex: "2 1 200px" }}>
                <span style={{ display: "block", marginBottom: 4, color: "var(--muted)" }}>
                  Income category
                </span>
                <select
                  value={incomeCategoryId}
                  onChange={(e) => setIncomeCategoryId(e.target.value)}
                  style={{ width: "100%" }}
                  required
                >
                  <option value="">Select…</option>
                  {incomeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.countsAsAdditive ? " (+ cashflow)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {kind === "adjustment" ? (
            <div className="toolbar" style={{ flexWrap: "wrap", marginBottom: 8 }}>
              <label className="ctrl" style={{ fontSize: 13 }}>
                <input
                  type="radio"
                  name="adj-mode"
                  checked={adjustmentMode === "set_balance"}
                  onChange={() => setAdjustmentMode("set_balance")}
                />
                Set balance to
              </label>
              <label className="ctrl" style={{ fontSize: 13 }}>
                <input
                  type="radio"
                  name="adj-mode"
                  checked={adjustmentMode === "delta"}
                  onChange={() => setAdjustmentMode("delta")}
                />
                Adjust by amount
              </label>
            </div>
          ) : null}

          <div className="toolbar" style={{ flexWrap: "wrap" }}>
            <DecimalTextInput
              placeholder={amountPlaceholder}
              aria-label={amountPlaceholder}
              value={amount}
              onChange={setAmount}
              autoFocus
            />
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date and time"
            />
            <input
              type="text"
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="submit" className="btn sm" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
          {error ? (
            <p className="pin-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        <div className="modal-history">
          <h4 style={{ margin: "16px 0 8px", fontSize: 14 }}>Transaction history</h4>
          <TransactionList
            fetchUrl={meta.historyUrl}
            refreshKey={historyKey}
            viewMoreHref={meta.viewMoreHref}
          />
        </div>
      </div>
    </div>
  );
}
