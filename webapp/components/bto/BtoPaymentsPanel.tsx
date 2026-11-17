"use client";

import { useContext, useState } from "react";
import { BtoLogPaymentForm, BTO_STAGE_ITEMS } from "@/components/bto/BtoLogPaymentForm";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { AppDataContext } from "@/contexts/app-data-contexts";
import { CPF_BTO_STAGE_LABEL, CPF_TXN_CATEGORIES, type CpfBtoStage, type CpfTxnCategory } from "@/lib/cpf/types";
import type { BtoPaymentRow, BtoReconcileStatus, BtoStageReconcile } from "@/lib/finance/bto-reconcile";
import { fmt, fmt2 } from "@/lib/finance/helpers";

const STAGES: CpfBtoStage[] = ["booking", "afl", "keys", "mortgage"];

type HistoryFilter = "all" | "cpf" | "cash" | "self" | "partner";

type LogTarget = { stage: CpfBtoStage; category: CpfTxnCategory; amount?: number; key: number };

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
  const appData = useContext(AppDataContext);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const openLog = (stage: CpfBtoStage, category?: CpfTxnCategory, amount?: number) => {
    setLogTarget({ stage, category: category ?? BTO_STAGE_ITEMS[stage][0]!, amount, key: Date.now() });
    requestAnimationFrame(() =>
      document.getElementById("bto-log")?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
    console.info("[BtoPaymentsPanel] open log form", { stage, category });
  };

  const removeRow = async (id: string) => {
    if (!appData) return;
    setDeletingId(id);
    setDeleteError("");
    try {
      await appData.deleteCpfTransaction(id);
      console.info("[BtoPaymentsPanel] payment deleted", { id });
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete payment");
    } finally {
      setDeletingId(null);
    }
  };

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
        <button type="button" className="btn sm" onClick={() => openLog(nextStage)}>
          Log a payment
        </button>
      </div>
      <p className="ui-hint" style={{ marginTop: -4 }}>
        Log each BTO payment here as it happens and it&rsquo;s checked against the bills in your
        plan. Use the amounts on your CPF statement: the grant is credited to OA, then withdrawn as
        part of the downpayment.
      </p>

      {logTarget && (
        <BtoLogPaymentForm
          key={logTarget.key}
          reconcile={reconcile}
          initialStage={logTarget.stage}
          initialCategory={logTarget.category}
          initialAmount={logTarget.amount}
          paired={paired}
          onClose={() => setLogTarget(null)}
        />
      )}

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
                  <button type="button" className="btn ghost sm bto-pay-log" onClick={() => openLog("mortgage", "bto_mortgage")}>
                    Log this month
                  </button>
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
                          <button type="button" className="bto-pay-linkbtn" onClick={() => openLog(stage, c.category, left)}>
                            Log {fmt2(left)}
                          </button>
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
                        <button type="button" className="bto-pay-linkbtn" onClick={() => openLog(stage, "housing_grant")}>
                          Log grant
                        </button>
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
              {stage === "booking" && r.status !== "tallied" && r.status !== "over" && (
                <button
                  type="button"
                  className="btn sm bto-pay-log"
                  onClick={() => openLog("booking", "bto_option_fee")}
                >
                  Log option fee · {fmt(Math.max(0, r.expected - r.paid))}
                </button>
              )}
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
            No BTO payments logged yet. Start with your option fee, then log each downpayment, stamp
            duty and legal fee as CPF deducts it.
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
                <th></th>
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
                  <td>
                    {r.owner === "self" ? (
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={deletingId === r.id}
                        onClick={() => void removeRow(r.id)}
                      >
                        {deletingId === r.id ? "…" : "Delete"}
                      </button>
                    ) : (
                      <span className="cpf-txn-sub">Partner&rsquo;s</span>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={paired ? 7 : 6} style={{ color: "var(--muted)" }}>
                    Nothing matches this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
      {deleteError ? <p className="pin-error">{deleteError}</p> : null}
      <p className="ui-hint">
        Deleting a payment reverses its effect on your CPF OA. Your partner deletes their own
        payments from their account.
      </p>
    </>
  );
}
