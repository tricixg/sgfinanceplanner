"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatTransactionWhen } from "@/lib/savings/format-transaction-when";
import { fetchJson } from "@/lib/fetch-json";
import { fmt2 } from "@/lib/finance/helpers";

/** Structural shape shared by SavingsTransaction and FundTransaction — this list only reads these fields. */
type LedgerHistoryItem = {
  id: string;
  kind: string;
  amount: number;
  occurredAt: string;
  note: string;
  goalName: string | null;
  balanceAfter: number | null;
};

type Props = {
  fetchUrl: string;
  refreshKey?: number;
  viewMoreHref?: string;
  /** When provided, shows a delete control per row and reloads the list on success. */
  onDelete?: (id: string) => Promise<void>;
};

export function TransactionList({
  fetchUrl,
  refreshKey = 0,
  viewMoreHref,
  onDelete,
}: Props) {
  const [items, setItems] = useState<LedgerHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { res, data } = await fetchJson<{
        items?: LedgerHistoryItem[];
        total?: number;
        error?: string;
      }>(fetchUrl, { credentials: "include" });
      if (res.ok) {
        setItems(data.items ?? []);
        setTotal(data.total ?? data.items?.length ?? 0);
      }
    } catch (e) {
      console.warn("[TransactionList] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [fetchUrl]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const handleDelete = async (id: string) => {
    if (!onDelete) return;
    setDeletingId(id);
    try {
      await onDelete(id);
      await load();
      console.info("[TransactionList] deleted", { id });
    } catch (e) {
      console.warn("[TransactionList] delete failed", e);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <p className="note">Loading history…</p>;
  }
  if (!items.length) {
    return <p className="note">No transactions yet.</p>;
  }

  const showViewMore = Boolean(viewMoreHref && total > items.length);

  return (
    <>
      <ul className="note" style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
        {items.map((tx) => (
          <li
            key={tx.id}
            style={{
              padding: "6px 0",
              borderBottom: "1px solid var(--line)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <span>
              <span style={{ textTransform: "capitalize", opacity: 0.85 }}>
                {tx.kind}
              </span>
              {" · "}
              <strong>
                {tx.amount > 0 ? "+" : ""}
                {fmt2(tx.amount)}
              </strong>
              {" · "}
              {formatTransactionWhen(tx.occurredAt)}
              {tx.note ? ` — ${tx.note}` : ""}
              {tx.goalName ? (
                <span style={{ display: "block", opacity: 0.85, marginTop: 2 }}>
                  Goal: <strong>{tx.goalName}</strong>
                </span>
              ) : null}
              {tx.balanceAfter != null ? (
                <span style={{ display: "block", opacity: 0.8 }}>
                  Balance after: {fmt2(tx.balanceAfter)}
                </span>
              ) : null}
            </span>
            {onDelete ? (
              <button
                type="button"
                className="btn ghost sm"
                disabled={deletingId === tx.id}
                onClick={() => void handleDelete(tx.id)}
                aria-label="Delete entry"
              >
                {deletingId === tx.id ? "…" : "Delete"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {showViewMore ? (
        <Link
          href={viewMoreHref!}
          className="btn ghost sm"
          style={{ marginTop: 10, display: "inline-block" }}
          onClick={() =>
            console.info("[TransactionList] view more", { href: viewMoreHref })
          }
        >
          View more
        </Link>
      ) : null}
    </>
  );
}
