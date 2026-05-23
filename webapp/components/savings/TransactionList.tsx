"use client";

import { useCallback, useEffect, useState } from "react";
import type { SavingsTransaction } from "@/lib/savings/types";
import { fetchJson } from "@/lib/fetch-json";
import { fmt2 } from "@/lib/finance/helpers";

type Props = {
  fetchUrl: string;
  refreshKey?: number;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-SG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function TransactionList({ fetchUrl, refreshKey = 0 }: Props) {
  const [items, setItems] = useState<SavingsTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { res, data } = await fetchJson<{
        items?: SavingsTransaction[];
        error?: string;
      }>(fetchUrl, { credentials: "include" });
      if (res.ok) setItems(data.items ?? []);
    } catch (e) {
      console.warn("[TransactionList] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [fetchUrl]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) {
    return <p className="note">Loading history…</p>;
  }
  if (!items.length) {
    return <p className="note">No deposits recorded yet.</p>;
  }

  return (
    <ul className="note" style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
      {items.map((tx) => (
        <li
          key={tx.id}
          style={{
            padding: "6px 0",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <strong>{tx.amount > 0 ? "+" : ""}{fmt2(tx.amount)}</strong>
          {" · "}
          {formatWhen(tx.occurredAt)}
          {tx.note ? ` — ${tx.note}` : ""}
          {tx.balanceAfter != null ? (
            <span style={{ display: "block", opacity: 0.8 }}>
              Balance after: {fmt2(tx.balanceAfter)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
