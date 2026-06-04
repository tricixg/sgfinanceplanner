import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMPUTED_DEBT_LABEL,
  COMPUTED_ILP_LABEL,
  COMPUTED_INSURANCE_LABEL,
  COMPUTED_SUBSCRIPTION_LABEL,
} from "@/lib/finance/budget";
import type { AutoCategory } from "@/lib/expenses/auto-category-ids";

export type AutoPaymentPayload = {
  autoCategory: AutoCategory;
  loanId?: string;
  insurancePolicyId?: string;
  ilpPolicyId?: string;
  subscriptionId?: string;
  amount: number;
  spentAt: string;
  spentTime?: string;
  note?: string;
  financialAccountId?: string;
};

export function autoPaymentCategoryLabel(autoCategory: AutoCategory): string {
  if (autoCategory === "debt") return COMPUTED_DEBT_LABEL;
  if (autoCategory === "insurance") return COMPUTED_INSURANCE_LABEL;
  if (autoCategory === "ilp") return COMPUTED_ILP_LABEL;
  return COMPUTED_SUBSCRIPTION_LABEL;
}

export function validateAutoPaymentPayload(body: {
  autoCategory?: string;
  loanId?: string;
  insurancePolicyId?: string;
  ilpPolicyId?: string;
  subscriptionId?: string;
}): { ok: true; autoCategory: AutoCategory } | { ok: false; error: string } {
  const autoCategory = body.autoCategory;
  if (
    autoCategory !== "debt" &&
    autoCategory !== "insurance" &&
    autoCategory !== "ilp" &&
    autoCategory !== "subscription"
  ) {
    return { ok: false, error: "autoCategory must be debt, insurance, ilp, or subscription" };
  }
  if (autoCategory === "debt" && !body.loanId) {
    return { ok: false, error: "loanId required for debt payments" };
  }
  if (autoCategory === "insurance" && !body.insurancePolicyId) {
    return { ok: false, error: "insurancePolicyId required for insurance payments" };
  }
  if (autoCategory === "ilp" && !body.ilpPolicyId) {
    return { ok: false, error: "ilpPolicyId required for ILP payments" };
  }
  if (autoCategory === "subscription" && !body.subscriptionId) {
    return { ok: false, error: "subscriptionId required for subscription payments" };
  }
  return { ok: true, autoCategory };
}

export async function verifyFinancialAccount(
  supabase: SupabaseClient,
  userId: string,
  financialAccountId: string
): Promise<boolean> {
  const acct = await loadFinancialAccount(supabase, userId, financialAccountId);
  return Boolean(acct);
}

export type FinancialAccountInfo = {
  id: string;
  accountType: "cash" | "credit_card";
  savingsAccountId: string | null;
  name: string;
};

export async function loadFinancialAccount(
  supabase: SupabaseClient,
  userId: string,
  financialAccountId: string
): Promise<FinancialAccountInfo | null> {
  const { data } = await supabase
    .from("financial_accounts")
    .select("id, account_type, savings_account_id, name")
    .eq("id", financialAccountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  const accountType =
    data.account_type === "credit_card" ? "credit_card" : "cash";

  return {
    id: String(data.id),
    accountType,
    savingsAccountId: data.savings_account_id ? String(data.savings_account_id) : null,
    name: String(data.name ?? "").trim(),
  };
}

export async function adjustLoanOutstanding(
  supabase: SupabaseClient,
  userId: string,
  loanId: string,
  delta: number
): Promise<{ ok: true; outstanding: number } | { ok: false; error: string }> {
  const { data: loan, error } = await supabase
    .from("loans")
    .select("id, outstanding")
    .eq("id", loanId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[auto-payment] loan fetch failed", error.message);
    return { ok: false, error: error.message };
  }
  if (!loan) {
    return { ok: false, error: "Loan not found" };
  }

  const next = Math.max(0, Number(loan.outstanding ?? 0) + delta);
  const { error: updErr } = await supabase
    .from("loans")
    .update({ outstanding: next, updated_at: new Date().toISOString() })
    .eq("id", loanId)
    .eq("user_id", userId);

  if (updErr) {
    console.error("[auto-payment] loan outstanding update failed", updErr.message);
    return { ok: false, error: updErr.message };
  }

  console.info("[auto-payment] loan outstanding adjusted", {
    userId,
    loanId,
    delta,
    outstanding: next,
  });
  return { ok: true, outstanding: next };
}

export async function verifyAutoPaymentSource(
  supabase: SupabaseClient,
  userId: string,
  autoCategory: AutoCategory,
  sourceId: string
): Promise<boolean> {
  if (autoCategory === "debt") {
    const { data } = await supabase
      .from("loans")
      .select("id")
      .eq("id", sourceId)
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(data);
  }
  if (autoCategory === "insurance") {
    const { data } = await supabase
      .from("insurance_policies")
      .select("id")
      .eq("id", sourceId)
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(data);
  }
  if (autoCategory === "ilp") {
    const { data } = await supabase
      .from("ilp_policies")
      .select("id")
      .eq("id", sourceId)
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(data);
  }
  const { data } = await supabase
    .from("recurring_subscriptions")
    .select("id")
    .eq("id", sourceId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export function autoPaymentInsertRow(
  userId: string,
  payload: AutoPaymentPayload
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    user_id: userId,
    amount: payload.amount,
    category: autoPaymentCategoryLabel(payload.autoCategory),
    auto_category: payload.autoCategory,
    spent_at: payload.spentAt,
    spent_time: payload.spentTime ?? null,
    note: payload.note ?? "",
    budget_line_id: null,
    loan_id: null,
    insurance_policy_id: null,
    ilp_policy_id: null,
    subscription_id: null,
    financial_account_id: payload.financialAccountId ?? null,
    entry_source: "recurring",
  };
  if (payload.autoCategory === "debt") row.loan_id = payload.loanId;
  if (payload.autoCategory === "insurance") row.insurance_policy_id = payload.insurancePolicyId;
  if (payload.autoCategory === "ilp") row.ilp_policy_id = payload.ilpPolicyId;
  if (payload.autoCategory === "subscription") row.subscription_id = payload.subscriptionId;
  return row;
}

export function sourceIdFromPayload(payload: AutoPaymentPayload): string {
  if (payload.autoCategory === "debt") return payload.loanId!;
  if (payload.autoCategory === "insurance") return payload.insurancePolicyId!;
  if (payload.autoCategory === "ilp") return payload.ilpPolicyId!;
  return payload.subscriptionId!;
}
