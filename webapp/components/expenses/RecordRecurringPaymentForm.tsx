"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { AutoCategory } from "@/lib/expenses/auto-category-ids";
import type { RecurringRow } from "@/lib/recurring/build-rows";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { DecimalTextInput } from "@/components/DecimalInput";

export type RecurringPaymentSuccessPayload = {
  expenseId: string;
  spentAt: string;
  amount: number;
  financialAccountId: string | null;
  accountName: string | null;
};

type Props = {
  row: RecurringRow;
  onSuccess: (payload: RecurringPaymentSuccessPayload) => void | Promise<void>;
  onCancel: () => void;
};

export function RecordRecurringPaymentForm({ row, onSuccess, onCancel }: Props) {
  const { accounts } = useFinancialAccounts();
  const [amount, setAmount] = useState(String(row.amount));
  const [spentAt, setSpentAt] = useState(row.suggestedSpentAt);
  const [financialAccountId, setFinancialAccountId] = useState(
    row.defaultFinancialAccountId ?? ""
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setMsg("Enter a valid amount");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const body: Record<string, unknown> = {
        autoCategory: row.kind as AutoCategory,
        amount: amt,
        spentAt,
        note,
      };
      if (row.kind === "debt") body.loanId = row.sourceId;
      if (row.kind === "insurance") body.insurancePolicyId = row.sourceId;
      if (row.kind === "ilp") body.ilpPolicyId = row.sourceId;
      if (row.kind === "subscription") body.subscriptionId = row.sourceId;
      if (financialAccountId) body.financialAccountId = financialAccountId;

      const { res, data } = await fetchJson<{ error?: string; item?: { id?: string } }>(
        "/api/expenses",
        {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to record payment");
      const expenseId = data.item?.id ? String(data.item.id) : "";
      if (!expenseId) {
        throw new Error("Payment saved but response is missing expense id");
      }

      const accountName = financialAccountId
        ? accounts.find((a) => a.id === financialAccountId)?.name ?? null
        : null;

      console.info("[RecordRecurringPayment] ok", {
        kind: row.kind,
        sourceId: row.sourceId,
        amt,
        spentAt,
      });
      await onSuccess({
        expenseId,
        spentAt,
        amount: amt,
        financialAccountId: financialAccountId || null,
        accountName,
      });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
      console.error("[RecordRecurringPayment] failed", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="record-recurring-payment-form" onSubmit={(e) => void submit(e)}>
      <input
        type="date"
        value={spentAt}
        onChange={(e) => setSpentAt(e.target.value)}
        required
      />
      <DecimalTextInput value={amount} onChange={setAmount} required
      />
      <select
        value={financialAccountId}
        onChange={(e) => setFinancialAccountId(e.target.value)}
        aria-label="Pay from account"
      >
        <option value="">Pay from…</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.accountType === "credit_card" ? "card" : "cash"})
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="submit" className="btn sm" disabled={saving}>
        {saving ? "…" : "Save"}
      </button>
      <button type="button" className="btn ghost sm" onClick={onCancel} disabled={saving}>
        Cancel
      </button>
      {msg ? <span className="note">{msg}</span> : null}
    </form>
  );
}
