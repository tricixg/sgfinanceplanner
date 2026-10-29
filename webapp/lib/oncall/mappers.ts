import { DEFAULT_ONCALL_SETTINGS } from "@/lib/oncall/calc";
import type { OncallEntry, OncallPayment, OncallPaymentItem, OncallSettings } from "@/lib/oncall/types";

export function mapOncallSettings(row: Record<string, unknown> | null): OncallSettings {
  if (!row) return { ...DEFAULT_ONCALL_SETTINGS };
  return {
    dailyRate: Number(row.daily_rate ?? 0),
    cpfAgeBand: String(row.cpf_age_band ?? DEFAULT_ONCALL_SETTINGS.cpfAgeBand),
    employeeCpfRate: Number(row.employee_cpf_rate ?? DEFAULT_ONCALL_SETTINGS.employeeCpfRate),
    employerCpfRate: Number(row.employer_cpf_rate ?? DEFAULT_ONCALL_SETTINGS.employerCpfRate),
    cpfApplies: row.cpf_applies !== false,
    defaultAccountId: row.default_account_id ? String(row.default_account_id) : null,
  };
}

export function mapOncallEntry(row: Record<string, unknown>): OncallEntry {
  return {
    id: String(row.id),
    startDate: String(row.start_date ?? "").slice(0, 10),
    endDate: String(row.end_date ?? "").slice(0, 10),
    dailyRate: Number(row.daily_rate ?? 0),
    note: String(row.note ?? ""),
  };
}

export function mapOncallPaymentItem(row: Record<string, unknown>): OncallPaymentItem {
  return {
    id: String(row.id),
    entryId: String(row.entry_id),
    days: Number(row.days ?? 0),
  };
}

export function mapOncallPayment(
  row: Record<string, unknown>,
  items: OncallPaymentItem[]
): OncallPayment {
  return {
    id: String(row.id),
    receivedOn: String(row.received_on ?? "").slice(0, 10),
    salaryMonth: String(row.salary_month ?? "").slice(0, 7),
    amount: Number(row.amount ?? 0),
    deposited: row.deposited !== false,
    accountId: row.account_id ? String(row.account_id) : null,
    incomeCategoryId: row.income_category_id ? String(row.income_category_id) : null,
    savingsTransactionId: row.savings_transaction_id ? String(row.savings_transaction_id) : null,
    note: String(row.note ?? ""),
    items,
  };
}
