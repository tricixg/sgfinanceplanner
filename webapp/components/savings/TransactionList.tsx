"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { SavingsTransaction } from "@/lib/savings/types";
import { formatTransactionWhen } from "@/lib/savings/format-transaction-when";
import { fetchJson } from "@/lib/fetch-json";
import { fmt2 } from "@/lib/finance/helpers";

type Props = {
  fetchUrl: string;
  refreshKey?: number;
  viewMoreHref?: string;
};

export function TransactionList({ fetchUrl, refreshKey = 0, viewMoreHref }: Props) {
  const [items, setItems] = useState<SavingsTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { res, data } = await fetchJson<{
        items?: SavingsTransaction[];
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
            }}
          >
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
