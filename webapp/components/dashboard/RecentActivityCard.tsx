"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CardHeader } from "@/components/ui/CardHeader";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState, SkeletonLines } from "@/components/ui/States";
import { useDomainEvent } from "@/hooks/useDomainEvent";
import { shortMonth } from "@/lib/dashboard/cashflow";
import { fetchJson } from "@/lib/fetch-json";
import { fmt2 } from "@/lib/finance/helpers";
import type { UnifiedTransaction } from "@/lib/transactions/types";

const LIMIT = 6;

function shortDate(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(ymd)) return ymd;
  return `${Number(ymd.slice(8, 10))} ${shortMonth(ymd.slice(0, 7))}`;
}

/** Latest entries from the unified transaction history. */
export function RecentActivityCard() {
  const [items, setItems] = useState<UnifiedTransaction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const { res, data } = await fetchJson<{ items?: UnifiedTransaction[]; error?: string }>(
        `/api/transactions?limit=${LIMIT}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to load transactions");
      setItems(data.items ?? []);
    } catch (e) {
      console.error("[RecentActivityCard] load failed", e);
      setError(e instanceof Error ? e.message : "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useDomainEvent(["expense:changed", "savings:changed", "accounts:changed"], () => void load());

  return (
    <div className="card" aria-busy={loading}>
      <CardHeader title="Recent activity" href="/transactions" linkLabel="All transactions" />
      {loading ? (
        <SkeletonLines lines={6} label="Loading recent activity" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !items || items.length === 0 ? (
        <EmptyState
          icon="list"
          title="Nothing yet"
          action={
            <Link href="/expenses" className="link-more">
              Log an expense
            </Link>
          }
        >
          Expenses, deposits and transfers will show up here as you record them.
        </EmptyState>
      ) : (
        <div className="list">
          {items.map((tx) => {
            const incoming = tx.amount > 0;
            const title = tx.note?.trim() || tx.category || tx.typeLabel;
            const meta = [shortDate(tx.date), tx.category && tx.category !== title ? tx.category : null, tx.accountName]
              .filter(Boolean)
              .join(" · ");
            return (
              <div className="list-row" key={`${tx.recordType}:${tx.id}`}>
                <span className={`list-row-icon ${incoming ? "in" : ""}`}>
                  <Icon name={incoming ? "arrow-down-left" : "arrow-up-right"} />
                </span>
                <div className="list-row-main">
                  <div className="list-row-title">{title}</div>
                  <div className="list-row-sub">{meta}</div>
                </div>
                <div className="list-row-end">
                  <div className={`list-row-amount ${incoming ? "in" : ""}`}>
                    {incoming ? "+" : tx.amount < 0 ? "−" : ""}
                    {fmt2(Math.abs(tx.amount))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
