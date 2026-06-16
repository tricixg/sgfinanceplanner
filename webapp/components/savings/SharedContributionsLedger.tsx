"use client";

import { useCallback, useEffect, useState } from "react";
import type { SavingsGoal, SavingsTransaction } from "@/lib/savings/types";
import { fetchJson } from "@/lib/fetch-json";
import { fmt2 } from "@/lib/finance/helpers";

type Props = {
  sharedGoals: SavingsGoal[];
  myUserId: string;
};

type Page = {
  items: SavingsTransaction[];
  total: number;
  nextOffset: number | null;
};

export function SharedContributionsLedger({ sharedGoals, myUserId }: Props) {
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    setError("");
    try {
      const { res, data } = await fetchJson<Page & { error?: string }>(
        `/api/savings/shared-contributions?offset=${offset}&limit=30`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to load contributions");
      if (offset === 0) {
        setPage(data);
      } else {
        setPage((prev) =>
          prev
            ? { ...data, items: [...prev.items, ...data.items] }
            : data
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(0);
  }, [load, sharedGoals.length]);

  if (error) {
    return <p className="note" style={{ color: "var(--red, #c00)" }}>{error}</p>;
  }

  const items = page?.items ?? [];

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Shared contributions log</h3>
      {loading && items.length === 0 ? (
        <p className="note">Loading…</p>
      ) : items.length === 0 ? (
        <p className="note">No contributions recorded yet. Record deposits to a shared pool linked to a goal.</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Goal</th>
                  <th>By</th>
                  <th className="num">Amount</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {items.map((tx) => (
                  <tr key={tx.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{tx.occurredAt.slice(0, 10)}</td>
                    <td>{tx.goalName ?? "—"}</td>
                    <td>{tx.userId === myUserId ? "You" : "Partner"}</td>
                    <td className="num" style={{ color: tx.kind === "withdrawal" ? "var(--red, #c00)" : undefined }}>
                      {tx.kind === "withdrawal" ? "−" : "+"}{fmt2(Math.abs(tx.amount))}
                    </td>
                    <td className="note" style={{ fontSize: 12 }}>{tx.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {page?.nextOffset != null ? (
            <button
              type="button"
              className="btn ghost sm"
              style={{ marginTop: 8 }}
              disabled={loading}
              onClick={() => void load(page.nextOffset!)}
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
