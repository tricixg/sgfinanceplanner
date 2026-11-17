"use client";

import Link from "next/link";
import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CPF_BTO_STAGE_LABEL, CPF_TXN_CATEGORIES, type CpfBtoStage, type CpfTxnCategory } from "@/lib/cpf/types";
import type { BtoPaymentRow, BtoReconcileStatus, BtoStageReconcile } from "@/lib/finance/bto-reconcile";
import { fmt, fmt2 } from "@/lib/finance/helpers";

const STAGES: CpfBtoStage[] = ["booking", "afl", "keys", "mortgage"];

type HistoryFilter = "all" | "cpf" | "cash" | "self" | "partner";

/** Deep link to the one logging form on CPF Outlook, pre-filled. */
export function cpfLogHref(category: CpfTxnCategory, stage: CpfBtoStage, amount?: number): string {
  const q = new URLSearchParams({ log: category, stage });
  if (amount && amount > 0) q.set("amount", amount.toFixed(2));
  return `/cpf?${q.toString()}#log`;
}

function statusLabel(status: BtoReconcileStatus, reached: boolean): string {
  if (status === "tallied") return "Tallied";
  if (status === "partial") return "Partial";
  if (status === "over") return "Overpaid";
  return reached ? "Nothing logged" : "Not due";
}

function formatYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

type Props = {
  reconcile: Record<CpfBtoStage, BtoStageReconcile>;
  rows: BtoPaymentRow[];
  /** Date label per stage, as shown on the timeline. */
  stageDates: Record<CpfBtoStage, string>;
  /** Whether each stage's date has passed (or is in progress). */
  stageReached: Record<CpfBtoStage, boolean>;
  /** The stage the "Log a payment" button should pre-select. */
  nextStage: CpfBtoStage;
  paired: boolean;
  tenureMonths: number;
};

/** Expected vs paid per BTO stage, plus the household payment history. */
export function BtoPaymentsPanel({
  reconcile,
  rows,
  stageDates,
  stageReached,
  nextStage,
  paired,
  tenureMonths,
}: Props) {
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const upfront = (["booking", "afl", "keys"] as const).map((s) => reconcile[s]);
  const expected = upfront.reduce((s, r) => s + r.expected, 0);
  const paid = upfront.reduce((s, r) => s + r.paid, 0);
  const bySelf = upfront.reduce((s, r) => s + r.bySelf, 0);
  const byPartner = upfront.reduce((s, r) => s + r.byPartner, 0);
  const cash = upfront.reduce((s, r) => s + r.paidCash, 0);
  const pct = (n: number) => `${expected > 0 ? Math.min(100, (n / expected) * 100) : 0}%`;

  const shown = rows.filter((r) => {
    if (filter === "cpf") return r.fundingSource === "cpf_oa";
    if (filter === "cash") return r.fundingSource === "cash";
    if (filter === "self") return r.owner === "self";
    if (filter === "partner") return r.owner === "partner";
    return true;
  });

  return (
    <>
      <div className="section-head" id="payments">
        <h2>Payments</h2>
        <Link href={cpfLogHref(nextStage === "booking" ? "bto_option_fee" : nextStage === "mortgage" ? "bto_mortgage" : "bto_downpayment", nextStage)} className="btn ghost sm">
          Log a payment
        </Link>
      </div>
      <p className="ui-hint" style={{ marginTop: -4 }}>
        Your logged payments, checked against each bill in your plan. Amounts match your CPF
        statement: the grant is credited to OA, then withdrawn as part of the downpayment. Log
        payments on CPF Outlook
        {paired ? "; your partner logs theirs from their own account." : "."}
      </p>

      <div className="card bto-pay-strip">
        <div>
          <div className="section-lbl">Upfront paid so far</div>
          <div className="bto-pay-total">
            {fmt2(paid)} <span>of {fmt2(expected)}</span>
          </div>
        </div>
        <div className="bto-pay-legend">
          <span style={{ ["--c" as string]: "var(--moss)" }}>You · CPF {fmt(bySelf)}</span>
          {paired && <span style={{ ["--c" as string]: "var(--sky)" }}>Partner · CPF {fmt(byPartner)}</span>}
          <span style={{ ["--c" as string]: "var(--gold)" }}>Cash {fmt(cash)}</span>
        </div>
        <div className="bto-pay-bar" aria-hidden="true">
          <i style={{ width: pct(bySelf), background: "var(--moss)" }} />
          <i style={{ width: pct(byPartner), background: "var(--sky)" }} />
          <i style={{ width: pct(cash), background: "var(--gold)" }} />
        </div>
      </div>

      <div className="bto-pay-stages">
        {STAGES.map((stage) => {
          const r = reconcile[stage];
          const reached = stageReached[stage];
          const statusCls = r.status === "not_started" ? "none" : r.status;
          if (stage === "mortgage") {
            return (
              <div key={stage} className={`card bto-pay-stage ${statusCls}`}>
                <div className="bto-pay-stage-head">
                  <b>{CPF_BTO_STAGE_LABEL[stage]}</b>
                  <span className={`bto-pay-pill ${statusCls}`}>
                    {r.monthsPaid ? `${r.monthsPaid} paid` : statusLabel(r.status, reached)}
                  </span>
                </div>
                <div className="bto-pay-stage-date">{stageDates[stage]}</div>
                <div className="minirow">
                  <span className="k">Monthly instalment</span>
                  <span className="v">{fmt2(r.components[0]?.expected ?? 0)}</span>
                </div>
                <div className="minirow">
                  <span className="k">Instalments logged</span>
                  <span className="v">
                    {r.monthsPaid ?? 0} of {tenureMonths}
                  </span>
                </div>
                <div className="minirow">
                  <span className="k">Paid so far</span>
                  <span className="v">{fmt2(r.paid)}</span>
                </div>
                {reached && (
                  <Link className="bto-pay-log" href={cpfLogHref("bto_mortgage", "mortgage", r.components[0]?.expected)}>
                    Log this month
                  </Link>
                )}
              </div>
            );
          }
          return (
            <div key={stage} className={`card bto-pay-stage ${statusCls}`}>
              <div className="bto-pay-stage-head">
                <b>{CPF_BTO_STAGE_LABEL[stage]}</b>
                <span className={`bto-pay-pill ${statusCls}`}>{statusLabel(r.status, reached)}</span>
              </div>
              <div className="bto-pay-stage-date">{stageDates[stage]}</div>
              {r.components.map((c) => {
                const left = Math.round((c.expected - c.paid) * 100) / 100;
                return (
                  <div className="minirow bto-pay-line" key={c.category}>
                    <span className="k">
                      {c.label}
                      <span className="bto-pay-sub">Paid {fmt2(c.paid)}</span>
                    </span>
                    <span className="v">
                      {fmt2(c.expected)}
                      <span className="bto-pay-sub">
                        {Math.abs(left) < 1 ? (
                          <span className="pos">✓ paid</span>
                        ) : left < 0 ? (
                          <span className="neg">over {fmt2(-left)}</span>
                        ) : (
                          <Link href={cpfLogHref(c.category, stage, left)}>Log {fmt2(left)}</Link>
                        )}
                      </span>
                    </span>
                  </div>
                );
              })}
              {(r.grantPlanned > 0 || r.grantCredited > 0) && (
                <div className="minirow bto-pay-line">
                  <span className="k">
                    Grant credited to OA
                    <span className="bto-pay-sub">Planned {fmt2(r.grantPlanned)}</span>
                  </span>
                  <span className="v pos">
                    +{fmt2(r.grantCredited)}
                    <span className="bto-pay-sub">
                      {Math.abs(r.grantCredited - r.grantPlanned) < 1 ? (
                        "✓ matches"
                      ) : r.grantCredited === 0 ? (
                        <Link href={cpfLogHref("housing_grant", stage, r.grantPlanned)}>Log grant</Link>
                      ) : (
                        <span className="neg">differs</span>
                      )}
                    </span>
                  </span>
                </div>
              )}
              <div className="minirow tot">
                <span className="k">Expected</span>
                <span className="v">{fmt2(r.expected)}</span>
              </div>
              <div className="minirow">
                <span className="k">Paid</span>
                <span className="v">{fmt2(r.paid)}</span>
              </div>
              <div className="minirow">
                <span className="k">
                  {Math.abs(r.variance) < 1 ? "Difference" : r.variance < 0 ? "Still to pay" : "Overpaid by"}
                </span>
                <span className={`v ${Math.abs(r.variance) < 1 ? "pos" : r.status === "not_started" ? "" : "neg"}`}>
                  {fmt2(Math.abs(r.variance) < 1 ? 0 : Math.abs(r.variance))}
                </span>
              </div>
              {r.paid > 0 && (
                <div className="bto-pay-split">
                  <span>You {fmt(r.bySelf)}</span>
                  {paired && <span>Partner {fmt(r.byPartner)}</span>}
                  <span>Cash {fmt(r.paidCash)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="section-head">
        <h2>Payment history</h2>
        <SegmentedControl<HistoryFilter>
          label="Filter payments"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "cpf", label: "CPF OA", compact: "CPF" },
            { value: "cash", label: "Cash" },
            ...(paired
              ? [
                  { value: "self" as const, label: "You" },
                  { value: "partner" as const, label: "Partner" },
                ]
              : []),
          ]}
        />
      </div>
      <div className="card table-scroll">
        {rows.length === 0 ? (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
            No BTO payments logged yet. When CPF deducts your option fee, downpayment, stamp duty or
            legal fee, log it on CPF Outlook and it shows up here.
          </p>
        ) : (
          <table style={{ minWidth: "36rem" }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Stage</th>
                <th>Item</th>
                {paired && <th>Who</th>}
                <th>Source</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.owner}-${r.id}`}>
                  <td>{formatYmd(r.txnDate)}</td>
                  <td>{r.btoStage ? CPF_BTO_STAGE_LABEL[r.btoStage] : "—"}</td>
                  <td>
                    <b>{CPF_TXN_CATEGORIES[r.category]?.label ?? r.category}</b>
                    {r.note ? <div className="cpf-txn-sub">{r.note}</div> : null}
                  </td>
                  {paired && (
                    <td className={r.owner === "partner" ? "bto-pay-partner" : ""}>
                      {r.owner === "self" ? "You" : "Partner"}
                    </td>
                  )}
                  <td>
                    <span className={`tag ${r.fundingSource === "cash" ? "t-soon" : ""}`}>
                      {r.fundingSource === "cash" ? "Cash" : "CPF OA"}
                    </span>
                  </td>
                  <td className={`num ${r.direction === "credit" ? "pos" : "neg"}`}>
                    {r.direction === "credit" ? "+" : "−"}
                    {fmt2(r.amount)}
                  </td>
                </tr>
              ))}
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={paired ? 6 : 5} style={{ color: "var(--muted)" }}>
                    Nothing matches this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
