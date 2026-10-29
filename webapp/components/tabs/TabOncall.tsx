"use client";

import { useMemo, useState } from "react";
import { useAccounts } from "@/hooks/useAccounts";
import { useIncomeCategories } from "@/hooks/useIncomeCategories";
import { useOncall } from "@/hooks/useOncall";
import { OncallLogTable } from "@/components/oncall/OncallLogTable";
import { OncallPaymentForm } from "@/components/oncall/OncallPaymentForm";
import { OncallPaymentsTable } from "@/components/oncall/OncallPaymentsTable";
import { OncallSettingsPanel } from "@/components/oncall/OncallSettingsPanel";
import { OncallSummary } from "@/components/oncall/OncallSummary";
import { fmt2 } from "@/lib/finance/helpers";
import { paidDaysByEntry, owedDays, summarizeOncall, type OncallScope } from "@/lib/oncall/calc";
import { fmtSalaryMonth, plural } from "@/lib/oncall/format";
import type { OncallPayment, OncallPaymentInput } from "@/lib/oncall/types";
import { sgtTodayYmd } from "@/lib/time/sgt";

type Props = { enabled: boolean };

type Msg = { text: string; kind?: "err" | "warn" };

export function TabOncall({ enabled }: Props) {
  const oncall = useOncall(enabled);
  const { accounts: allAccounts } = useAccounts();
  const { categories } = useIncomeCategories(enabled);
  const accounts = useMemo(() => allAccounts.filter((a) => !a.hidden), [allAccounts]);

  const [scope, setScope] = useState<OncallScope>("ytd");
  // undefined = closed; null = all unpaid stretches; id = one stretch.
  const [payFor, setPayFor] = useState<string | null | undefined>(undefined);
  const [msg, setMsg] = useState<Msg>({ text: "" });

  // YTD follows the current Singapore calendar year (rolls over on 1 Jan SGT).
  const year = Number(sgtTodayYmd().slice(0, 4));
  const summary = useMemo(
    () => summarizeOncall(oncall.entries, oncall.payments, oncall.settings, scope, year),
    [oncall.entries, oncall.payments, oncall.settings, scope, year]
  );
  const anyOwed = useMemo(() => {
    const paid = paidDaysByEntry(oncall.payments);
    return oncall.entries.some((e) => owedDays(e, paid) > 0);
  }, [oncall.entries, oncall.payments]);

  const onMessage = (text: string, kind?: "err" | "warn") => setMsg({ text, kind });

  const savePayment = async (input: OncallPaymentInput) => {
    await oncall.recordPayment(input);
    setPayFor(undefined);
    const days = input.items.reduce((s, i) => s + i.days, 0);
    const where = input.deposited
      ? `, deposited to ${accounts.find((a) => a.id === input.accountId)?.name ?? "your account"}.`
      : ". No deposit was added.";
    onMessage(`Recorded ${fmt2(input.amount)} for ${plural(days, "day")} in ${fmtSalaryMonth(input.salaryMonth)}${where}`);
    console.info("[TabOncall] payment recorded", { days, deposited: input.deposited });
  };

  const deletePayment = async (p: OncallPayment) => {
    try {
      await oncall.deletePayment(p.id);
      onMessage(
        p.deposited && p.savingsTransactionId
          ? "Payment deleted. Its income deposit is removed and those days are awaiting payment again."
          : "Payment deleted. Those days are awaiting payment again. Your income is unchanged."
      );
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Failed to delete payment", "err");
    }
  };

  if (!enabled || (!oncall.loading && !oncall.configured)) {
    return (
      <section className="panel on">
        <p className="note">Sign in to track on-call days.</p>
      </section>
    );
  }

  return (
    <section className="panel on oncall-page">
      <div className="oncall-top">
        <p className="oncall-intro">
          Log each on-call stretch. When your payslip comes in, record the payment — it goes into your income
          as a deposit, and any days not on that payslip stay as awaiting payment.
        </p>
        <OncallSettingsPanel
          settings={oncall.settings}
          accounts={accounts}
          onSave={oncall.saveSettings}
          onApplyRateToAll={async () => {
            await oncall.applyRateToAll(oncall.settings.dailyRate);
            onMessage(`Updated every entry to ${fmt2(oncall.settings.dailyRate)} a day.`);
          }}
        />
      </div>

      {oncall.loading && !oncall.entries.length ? <p className="note">Loading…</p> : null}

      <OncallSummary summary={summary} scope={scope} year={year} onScope={setScope} />

      <section className="oncall-section">
        <div className="oncall-sec-head">
          <h2>On-call log</h2>
          <div className="toolbar" style={{ marginTop: 0 }}>
            <span className="oncall-hint">
              {plural(oncall.entries.length, "entry", "entries")} · newest first
            </span>
            <button
              type="button"
              className="btn sm"
              disabled={!anyOwed || payFor !== undefined}
              onClick={() => {
                setPayFor(null);
                onMessage("");
              }}
            >
              Record payment
            </button>
          </div>
        </div>

        {payFor !== undefined ? (
          <OncallPaymentForm
            key={payFor ?? "all"}
            entries={oncall.entries}
            payments={oncall.payments}
            settings={oncall.settings}
            accounts={accounts}
            categories={categories}
            onlyEntryId={payFor}
            onSave={savePayment}
            onCancel={() => setPayFor(undefined)}
          />
        ) : null}

        <OncallLogTable
          entries={oncall.entries}
          payments={oncall.payments}
          settings={oncall.settings}
          year={year}
          onAdd={oncall.addEntry}
          onUpdate={oncall.updateEntry}
          onDelete={oncall.deleteEntry}
          onRecordPay={(id) => {
            setPayFor(id);
            onMessage("");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onMessage={onMessage}
        />
        {msg.text ? (
          <p className={`oncall-msg${msg.kind ? ` ${msg.kind}` : ""}`} role="status">
            {msg.text}
          </p>
        ) : null}
      </section>

      <section className="oncall-section">
        <div className="oncall-sec-head">
          <h2>Payments received</h2>
          <span className="oncall-hint">Each payment is one deposit in your income</span>
        </div>
        <OncallPaymentsTable
          payments={oncall.payments}
          entries={oncall.entries}
          settings={oncall.settings}
          accounts={allAccounts}
          categories={categories}
          onDelete={deletePayment}
        />
        <p className="oncall-foot">
          Days count both the start and end date. Take-home is gross minus employee CPF. CPF is worked out per
          stretch at the rates in settings, so it can differ by a few cents from your payslip — the amount
          credited is what goes into income, so type in the payslip figure if it differs. Payments marked as
          already deposited only mark days as paid and add nothing to your income. In YTD, earned figures count
          days on call this year, and received figures count payments tagged to a salary month this year.
        </p>
      </section>
    </section>
  );
}
