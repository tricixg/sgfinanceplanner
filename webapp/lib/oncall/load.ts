import type { SupabaseClient } from "@supabase/supabase-js";
import { roundMoney } from "@/lib/cards/interest-accrual";
import { verifyIncomeCategory } from "@/lib/income/load";
import { applyTransaction } from "@/lib/savings/ledger";
import { sgtSpentAtToIso } from "@/lib/time/sgt";
import { deleteTransactionWithLedger } from "@/lib/transactions/actions";
import { CPF_AGE_BANDS, daysInclusive, isYmd } from "@/lib/oncall/calc";
import {
  mapOncallEntry,
  mapOncallPayment,
  mapOncallPaymentItem,
  mapOncallSettings,
} from "@/lib/oncall/mappers";
import type {
  OncallBundle,
  OncallEntry,
  OncallEntryInput,
  OncallPayment,
  OncallPaymentInput,
  OncallSettings,
} from "@/lib/oncall/types";

const MONTH_RE = /^\d{4}-\d{2}$/;

export async function loadOncallBundle(
  supabase: SupabaseClient,
  userId: string
): Promise<OncallBundle> {
  const [settingsRes, entriesRes, paymentsRes, itemsRes] = await Promise.all([
    supabase.from("oncall_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("oncall_entries")
      .select("*")
      .eq("user_id", userId)
      .order("start_date", { ascending: false }),
    supabase
      .from("oncall_payments")
      .select("*")
      .eq("user_id", userId)
      .order("received_on", { ascending: false }),
    supabase.from("oncall_payment_items").select("*").eq("user_id", userId),
  ]);
  if (settingsRes.error) throw new Error(settingsRes.error.message);
  if (entriesRes.error) throw new Error(entriesRes.error.message);
  if (paymentsRes.error) throw new Error(paymentsRes.error.message);
  if (itemsRes.error) throw new Error(itemsRes.error.message);

  const itemsByPayment = new Map<string, ReturnType<typeof mapOncallPaymentItem>[]>();
  for (const row of itemsRes.data ?? []) {
    const list = itemsByPayment.get(String(row.payment_id)) ?? [];
    list.push(mapOncallPaymentItem(row));
    itemsByPayment.set(String(row.payment_id), list);
  }

  return {
    settings: mapOncallSettings(settingsRes.data),
    entries: (entriesRes.data ?? []).map(mapOncallEntry),
    payments: (paymentsRes.data ?? []).map((row) =>
      mapOncallPayment(row, itemsByPayment.get(String(row.id)) ?? [])
    ),
  };
}

async function verifyAccount(
  supabase: SupabaseClient,
  userId: string,
  accountId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("user_savings_accounts")
    .select("user_id")
    .eq("id", accountId)
    .maybeSingle();
  return Boolean(data && data.user_id === userId);
}

export async function saveOncallSettings(
  supabase: SupabaseClient,
  userId: string,
  input: Partial<OncallSettings>
): Promise<OncallSettings> {
  const rate = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : fallback;
  };
  const band =
    input.cpfAgeBand === "custom" || CPF_AGE_BANDS.some((b) => b.id === input.cpfAgeBand)
      ? input.cpfAgeBand
      : "55";
  const dailyRate = Number(input.dailyRate);
  if (input.defaultAccountId && !(await verifyAccount(supabase, userId, input.defaultAccountId))) {
    throw new Error("Invalid deposit account");
  }

  const { data, error } = await supabase
    .from("oncall_settings")
    .upsert({
      user_id: userId,
      daily_rate: Number.isFinite(dailyRate) && dailyRate >= 0 ? roundMoney(dailyRate) : 0,
      cpf_age_band: band,
      employee_cpf_rate: rate(input.employeeCpfRate, 20),
      employer_cpf_rate: rate(input.employerCpfRate, 17),
      cpf_applies: input.cpfApplies !== false,
      default_account_id: input.defaultAccountId || null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  console.info("[oncall] settings saved", { userId });
  return mapOncallSettings(data);
}

function validateEntryInput(input: OncallEntryInput): string | null {
  if (!isYmd(input.startDate) || !isYmd(input.endDate)) return "Pick both a from and a to date";
  if (daysInclusive(input.startDate, input.endDate) < 1) {
    return "The to date is before the from date";
  }
  if (!(Number(input.dailyRate) >= 0)) return "Enter a daily rate of 0 or more";
  return null;
}

async function paidDaysForEntry(
  supabase: SupabaseClient,
  userId: string,
  entryId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("oncall_payment_items")
    .select("days")
    .eq("user_id", userId)
    .eq("entry_id", entryId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + Number(r.days ?? 0), 0);
}

export async function createOncallEntry(
  supabase: SupabaseClient,
  userId: string,
  input: OncallEntryInput
): Promise<OncallEntry> {
  const invalid = validateEntryInput(input);
  if (invalid) throw new Error(invalid);

  const { data, error } = await supabase
    .from("oncall_entries")
    .insert({
      user_id: userId,
      start_date: input.startDate,
      end_date: input.endDate,
      daily_rate: roundMoney(Number(input.dailyRate)),
      note: (input.note ?? "").trim(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  console.info("[oncall] entry created", { userId, id: data.id });
  return mapOncallEntry(data);
}

export async function updateOncallEntry(
  supabase: SupabaseClient,
  userId: string,
  entryId: string,
  input: OncallEntryInput
): Promise<OncallEntry> {
  const invalid = validateEntryInput(input);
  if (invalid) throw new Error(invalid);

  const paid = await paidDaysForEntry(supabase, userId, entryId);
  if (daysInclusive(input.startDate, input.endDate) < paid) {
    throw new Error(
      `${paid} days of this stretch are already paid. Keep at least ${paid} days, or delete a payment first`
    );
  }

  const { data, error } = await supabase
    .from("oncall_entries")
    .update({
      start_date: input.startDate,
      end_date: input.endDate,
      daily_rate: roundMoney(Number(input.dailyRate)),
      note: (input.note ?? "").trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Not found");
  console.info("[oncall] entry updated", { userId, id: entryId });
  return mapOncallEntry(data);
}

export async function deleteOncallEntry(
  supabase: SupabaseClient,
  userId: string,
  entryId: string
): Promise<void> {
  const paid = await paidDaysForEntry(supabase, userId, entryId);
  if (paid > 0) {
    throw new Error(
      `This stretch has ${paid} paid ${paid === 1 ? "day" : "days"}. Delete those payments first`
    );
  }
  const { error } = await supabase
    .from("oncall_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  console.info("[oncall] entry deleted", { userId, id: entryId });
}

function salaryMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-SG", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Record a payslip payment against stretches. When `deposited`, also adds the
 * amount as an income deposit to the chosen account; otherwise only marks the
 * days as paid (for pay already in income before the tracker existed).
 */
export async function createOncallPayment(
  supabase: SupabaseClient,
  userId: string,
  input: OncallPaymentInput
): Promise<OncallPayment> {
  if (!isYmd(input.receivedOn)) throw new Error("Pick the date the money came in");
  if (!MONTH_RE.test(input.salaryMonth ?? "")) throw new Error("Pick the salary month");
  const amount = roundMoney(Number(input.amount));
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter the amount credited, 0 or more");
  const deposited = input.deposited !== false;
  if (deposited && !(amount > 0)) throw new Error("A deposit needs an amount above 0");

  const items = (input.items ?? []).filter((i) => Number(i.days) > 0);
  if (!items.length) throw new Error("Pick at least one stretch this payment covers");
  if (new Set(items.map((i) => i.entryId)).size !== items.length) {
    throw new Error("Each stretch can only appear once in a payment");
  }

  const { data: entryRows, error: entriesErr } = await supabase
    .from("oncall_entries")
    .select("*")
    .eq("user_id", userId)
    .in(
      "id",
      items.map((i) => i.entryId)
    );
  if (entriesErr) throw new Error(entriesErr.message);
  const entries = new Map((entryRows ?? []).map((r) => [String(r.id), mapOncallEntry(r)]));

  const { data: paidRows, error: paidErr } = await supabase
    .from("oncall_payment_items")
    .select("entry_id, days")
    .eq("user_id", userId)
    .in(
      "entry_id",
      items.map((i) => i.entryId)
    );
  if (paidErr) throw new Error(paidErr.message);
  const paid = new Map<string, number>();
  for (const r of paidRows ?? []) {
    const id = String(r.entry_id);
    paid.set(id, (paid.get(id) ?? 0) + Number(r.days ?? 0));
  }

  for (const item of items) {
    const entry = entries.get(item.entryId);
    if (!entry) throw new Error("On-call stretch not found");
    const owed = daysInclusive(entry.startDate, entry.endDate) - (paid.get(entry.id) ?? 0);
    if (!Number.isInteger(Number(item.days)) || item.days > owed) {
      throw new Error(
        `Days paid for ${entry.startDate} to ${entry.endDate} must be a whole number up to ${owed}`
      );
    }
  }

  let accountId: string | null = null;
  let incomeCategoryId: string | null = null;
  if (deposited) {
    if (!input.accountId || !(await verifyAccount(supabase, userId, input.accountId))) {
      throw new Error("Pick the account the money went into");
    }
    if (!input.incomeCategoryId || !(await verifyIncomeCategory(supabase, userId, input.incomeCategoryId))) {
      throw new Error("Pick an income category");
    }
    accountId = input.accountId;
    incomeCategoryId = input.incomeCategoryId;
  }

  let savingsTransactionId: string | null = null;
  if (deposited && accountId) {
    const tx = await applyTransaction(supabase, {
      userId,
      accountId,
      amount,
      kind: "deposit",
      occurredAt: sgtSpentAtToIso(input.receivedOn, "12:00:00"),
      note: `On-call allowance · ${salaryMonthLabel(input.salaryMonth)} salary`,
      incomeCategoryId,
    });
    savingsTransactionId = tx.id;
  }

  // Undo the deposit if the payment rows can't be written, so income never
  // shows money the tracker doesn't know about.
  const rollback = async (paymentId?: string) => {
    if (paymentId) await supabase.from("oncall_payments").delete().eq("id", paymentId);
    if (savingsTransactionId) {
      await deleteTransactionWithLedger(supabase, userId, "savings", savingsTransactionId).catch(
        (e) => console.error("[oncall] deposit rollback failed", e)
      );
    }
  };

  const { data: payRow, error: payErr } = await supabase
    .from("oncall_payments")
    .insert({
      user_id: userId,
      received_on: input.receivedOn,
      salary_month: `${input.salaryMonth}-01`,
      amount,
      deposited,
      account_id: accountId,
      income_category_id: incomeCategoryId,
      savings_transaction_id: savingsTransactionId,
      note: (input.note ?? "").trim(),
    })
    .select("*")
    .single();
  if (payErr) {
    await rollback();
    throw new Error(payErr.message);
  }

  const { data: itemRows, error: itemsErr } = await supabase
    .from("oncall_payment_items")
    .insert(
      items.map((i) => ({
        user_id: userId,
        payment_id: payRow.id,
        entry_id: i.entryId,
        days: Number(i.days),
      }))
    )
    .select("*");
  if (itemsErr) {
    await rollback(String(payRow.id));
    throw new Error(itemsErr.message);
  }

  console.info("[oncall] payment recorded", {
    userId,
    id: payRow.id,
    amount,
    deposited,
    days: items.reduce((s, i) => s + Number(i.days), 0),
  });
  return mapOncallPayment(payRow, (itemRows ?? []).map(mapOncallPaymentItem));
}

/** Delete a payment, reversing its income deposit (if it still exists) so the days are owed again. */
export async function deleteOncallPayment(
  supabase: SupabaseClient,
  userId: string,
  paymentId: string
): Promise<void> {
  const { data: row, error } = await supabase
    .from("oncall_payments")
    .select("id, savings_transaction_id")
    .eq("id", paymentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Not found");

  if (row.savings_transaction_id) {
    await deleteTransactionWithLedger(supabase, userId, "savings", String(row.savings_transaction_id));
  }

  const { error: delErr } = await supabase
    .from("oncall_payments")
    .delete()
    .eq("id", paymentId)
    .eq("user_id", userId);
  if (delErr) throw new Error(delErr.message);
  console.info("[oncall] payment deleted", { userId, id: paymentId });
}

/** Set every stretch to the same daily rate (settings → "Use this rate for all entries"). */
export async function applyRateToAllEntries(
  supabase: SupabaseClient,
  userId: string,
  dailyRate: number
): Promise<void> {
  if (!(Number(dailyRate) >= 0)) throw new Error("Enter a daily rate of 0 or more");
  const { error } = await supabase
    .from("oncall_entries")
    .update({ daily_rate: roundMoney(Number(dailyRate)), updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  console.info("[oncall] rate applied to all entries", { userId, dailyRate });
}
