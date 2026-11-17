"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { CpfContribution, CpfTransaction } from "@/lib/cpf/types";
import { CPF_BTO_STAGE_LABEL, CPF_TXN_CATEGORIES, cpfTxnOaDelta, formatCpfDateTime } from "@/lib/cpf/types";
import { fmt2, formatMonthLabel } from "@/lib/finance/helpers";

type Filter = "all" | "contrib" | "out" | "in" | "bto";

type Entry = {
  key: string;
  id: string;
  kind: "contribution" | "transaction";
  sortDate: string;
  sortTime: string;
  sortTie: string;
  dateLabel: string;
  title: string;
  sub: string;
  oaDelta: number;
  cashAmount: number;
  stage: CpfTransaction["btoStage"];
  isCash: boolean;
  direction: "debit" | "credit";
};

type Props = {
  contributions: CpfContribution[];
  transactions: CpfTransaction[];
  /** Today's OA balance — the running "OA after" column counts back from it. */
  currentOa: number;
  deletingId: string | null;
  onDeleteContribution: (id: string) => void;
  onDeleteTransaction: (id: string) => void;
};

/** Contributions and OA transactions merged into one newest-first ledger. */
export function CpfOaHistory({
  contributions,
  transactions,
  currentOa,
  deletingId,
  onDeleteContribution,
  onDeleteTransaction,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  const entries = useMemo(() => {
    const list: Entry[] = [
      ...contributions.map((c) => ({
        key: `c-${c.id}`,
        id: c.id,
        kind: "contribution" as const,
        sortDate: c.creditedOn ?? c.month.slice(0, 10),
        sortTime: c.creditedTime ?? "",
        sortTie: c.createdAt,
        dateLabel: c.creditedOn
          ? formatCpfDateTime(c.creditedOn, c.creditedTime)
          : formatMonthLabel(c.month.slice(0, 7)),
        title: "Monthly contribution",
        sub: `For ${formatMonthLabel(c.month.slice(0, 7))} · SA +${fmt2(c.sa)} · MediSave +${fmt2(c.ma)}`,
        oaDelta: c.oa,
        cashAmount: 0,
        stage: null,
        isCash: false,
        direction: "credit" as const,
      })),
      ...transactions.map((t) => ({
        key: `t-${t.id}`,
        id: t.id,
        kind: "transaction" as const,
        sortDate: t.txnDate,
        sortTime: t.txnTime ?? "",
        sortTie: t.createdAt,
        dateLabel: formatCpfDateTime(t.txnDate, t.txnTime),
        title: CPF_TXN_CATEGORIES[t.category]?.label ?? t.category,
        sub: t.fundingSource === "cash" ? "Paid in cash · CPF OA not affected" : t.note,
        oaDelta: cpfTxnOaDelta(t),
        cashAmount: t.fundingSource === "cash" ? t.amount : 0,
        stage: t.btoStage,
        isCash: t.fundingSource === "cash",
        direction: t.direction,
      })),
    ];
    list.sort(
      (a, b) =>
        b.sortDate.localeCompare(a.sortDate) ||
        b.sortTime.localeCompare(a.sortTime) ||
        b.sortTie.localeCompare(a.sortTie)
    );
    // Running balance, counted back from today's OA (newest row first).
    let after = currentOa;
    return list.map((e) => {
      const row = { ...e, oaAfter: after };
      after -= e.oaDelta;
      return row;
    });
  }, [contributions, transactions, currentOa]);

  const shown = entries.filter((e) => {
    if (filter === "contrib") return e.kind === "contribution";
    if (filter === "out") return e.kind === "transaction" && e.direction === "debit";
    if (filter === "in") return e.direction === "credit";
    if (filter === "bto") return e.stage != null;
    return true;
  });

  return (
    <>
      <div className="section-head">
        <h2>OA history</h2>
        <SegmentedControl<Filter>
          label="Filter history"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "contrib", label: "Contributions", compact: "Contrib." },
            { value: "out", label: "Withdrawals", compact: "Out" },
            { value: "in", label: "Credits", compact: "In" },
            { value: "bto", label: "BTO" },
          ]}
        />
      </div>
      <div className="card table-scroll">
        {entries.length === 0 ? (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
            Nothing logged yet. Log this month&rsquo;s contribution or a withdrawal above to start
            your OA history.
          </p>
        ) : (
          <table style={{ minWidth: "38rem" }}>
            <thead>
              <tr>
                <th>Date &amp; time</th>
                <th>Item</th>
                <th>Tag</th>
                <th className="num">OA amount</th>
                <th className="num">OA after</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.key}>
                  <td style={{ whiteSpace: "nowrap" }}>{e.dateLabel}</td>
                  <td>
                    <b>{e.title}</b>
                    {e.sub ? <div className="cpf-txn-sub">{e.sub}</div> : null}
                  </td>
                  <td>
                    {e.kind === "contribution" ? (
                      <span className="tag t-live">Contribution</span>
                    ) : e.stage ? (
                      <Link href="/bto#payments" className="tag cpf-tag-bto">
                        BTO · {CPF_BTO_STAGE_LABEL[e.stage]}
                      </Link>
                    ) : (
                      <span className="tag">Other</span>
                    )}
                    {e.isCash ? <span className="tag t-soon" style={{ marginLeft: 4 }}>Cash</span> : null}
                  </td>
                  <td className="num">
                    {e.isCash ? (
                      <span style={{ color: "var(--muted)" }}>{fmt2(e.cashAmount)}</span>
                    ) : (
                      <span className={e.oaDelta >= 0 ? "pos" : "neg"}>
                        {e.oaDelta >= 0 ? "+" : "−"}
                        {fmt2(Math.abs(e.oaDelta))}
                      </span>
                    )}
                  </td>
                  <td className="num">{fmt2(Math.max(0, e.oaAfter))}</td>
                  <td>
                    {e.stage ? (
                      // BTO payments are owned by the BTO planner, where they're logged.
                      <Link href="/bto#payments" className="cpf-txn-manage">
                        Manage on BTO Planner
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={deletingId === e.id}
                        onClick={() =>
                          e.kind === "contribution" ? onDeleteContribution(e.id) : onDeleteTransaction(e.id)
                        }
                      >
                        {deletingId === e.id ? "…" : "Delete"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: "var(--muted)" }}>
                    Nothing matches this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
      <p className="ui-hint">
        Deleting a row reverses its effect on your balance. BTO payments are logged and deleted on
        the BTO Planner. &ldquo;OA after&rdquo; counts back from
        today&rsquo;s balance, so it&rsquo;s only exact if every OA change since is logged here.
      </p>
    </>
  );
}
