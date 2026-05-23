import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BtoPlannerPrefs,
  DashboardState,
  InsurancePolicy,
  IlpPolicy,
} from "@/lib/types";
import { createEmptyState } from "@/lib/finance/defaults";
import { normalizeBtoPlannerPrefs } from "@/lib/finance/bto";

export type FinanceProfile = Pick<
  DashboardState,
  | "monthlySal"
  | "comms"
  | "salaryCreditDay"
  | "oa"
  | "sa"
  | "ma"
  | "moo"
  | "margin"
  | "cash"
  | "ccDebt"
  | "cashflowStartYm"
> & {
  btoPlanner?: BtoPlannerPrefs;
};

export async function loadFinanceProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<FinanceProfile> {
  const { data, error } = await supabase
    .from("user_finance_profile")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return profileFromState(createEmptyState());

  return {
    monthlySal: Number(data.monthly_sal ?? 0),
    comms: Number(data.comms ?? 0),
    salaryCreditDay: Number(data.salary_credit_day ?? 25),
    oa: Number(data.oa ?? 0),
    sa: Number(data.sa ?? 0),
    ma: Number(data.ma ?? 0),
    moo: Number(data.moo ?? 0),
    margin: Number(data.margin ?? 0),
    cash: Number(data.cash ?? 0),
    ccDebt: Number(data.cc_debt ?? 0),
    cashflowStartYm: String(data.cashflow_start_ym ?? ""),
    btoPlanner: data.bto_planner
      ? normalizeBtoPlannerPrefs(data.bto_planner as Partial<BtoPlannerPrefs>, {
          monthlySal: Number(data.monthly_sal ?? 0),
          oa: Number(data.oa ?? 0),
        })
      : undefined,
  };
}

export function profileFromState(state: DashboardState): FinanceProfile {
  return {
    monthlySal: state.monthlySal,
    comms: state.comms,
    salaryCreditDay: state.salaryCreditDay,
    oa: state.oa,
    sa: state.sa,
    ma: state.ma,
    moo: state.moo,
    margin: state.margin,
    cash: state.cash,
    ccDebt: state.ccDebt,
    cashflowStartYm: state.cashflowStartYm,
    btoPlanner: state.btoPlanner,
  };
}

/** Merge a partial profile patch onto existing values (PATCH must not zero omitted fields). */
export function mergeFinanceProfile(
  current: FinanceProfile,
  patch: Partial<FinanceProfile>
): FinanceProfile {
  const monthlySal = patch.monthlySal ?? current.monthlySal;
  const oa = patch.oa ?? current.oa;
  return {
    ...current,
    ...patch,
    btoPlanner:
      patch.btoPlanner !== undefined
        ? normalizeBtoPlannerPrefs(patch.btoPlanner, { monthlySal, oa })
        : current.btoPlanner,
  };
}

export async function saveFinanceProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<FinanceProfile>
): Promise<FinanceProfile> {
  const current = await loadFinanceProfile(supabase, userId);
  const merged = mergeFinanceProfile(current, patch);

  const payload = {
    user_id: userId,
    monthly_sal: merged.monthlySal,
    comms: merged.comms,
    salary_credit_day: merged.salaryCreditDay,
    oa: merged.oa,
    sa: merged.sa,
    ma: merged.ma,
    moo: merged.moo,
    margin: merged.margin,
    cash: merged.cash,
    cc_debt: merged.ccDebt,
    cashflow_start_ym: merged.cashflowStartYm,
    bto_planner: merged.btoPlanner ?? {},
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("user_finance_profile").upsert(payload);
  if (error) throw new Error(error.message);
  console.info("[profile] saved", {
    userId,
    keys: Object.keys(patch),
    monthlySal: merged.monthlySal,
    comms: merged.comms,
  });
  return loadFinanceProfile(supabase, userId);
}

export async function loadInsurancePolicies(
  supabase: SupabaseClient,
  userId: string
): Promise<InsurancePolicy[]> {
  const { data, error } = await supabase
    .from("insurance_policies")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    insurer: String(row.insurer ?? ""),
    monthlyPremium: Number(row.monthly_premium ?? 0),
    notes: String(row.notes ?? ""),
    deductionDay:
      typeof row.deduction_day === "number" && row.deduction_day >= 1
        ? row.deduction_day
        : undefined,
    defaultFinancialAccountId: row.default_financial_account_id
      ? String(row.default_financial_account_id)
      : undefined,
  }));
}

export async function saveInsurancePolicies(
  supabase: SupabaseClient,
  userId: string,
  incoming: InsurancePolicy[]
): Promise<InsurancePolicy[]> {
  const { data: existing } = await supabase
    .from("insurance_policies")
    .select("id")
    .eq("user_id", userId);
  const existingIds = new Set((existing ?? []).map((r) => String(r.id)));
  const incomingIds = new Set(incoming.filter((p) => p.id).map((p) => p.id!));

  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length) {
    await supabase.from("insurance_policies").delete().in("id", toDelete);
  }

  for (let i = 0; i < incoming.length; i++) {
    const p = incoming[i];
    const row = {
      user_id: userId,
      name: p.name ?? "",
      insurer: p.insurer ?? "",
      monthly_premium: p.monthlyPremium ?? 0,
      notes: p.notes ?? "",
      deduction_day: p.deductionDay ?? null,
      default_financial_account_id: p.defaultFinancialAccountId ?? null,
      sort_order: i,
    };
    if (p.id && existingIds.has(p.id)) {
      await supabase.from("insurance_policies").update(row).eq("id", p.id).eq("user_id", userId);
    } else {
      await supabase.from("insurance_policies").insert(row);
    }
  }
  return loadInsurancePolicies(supabase, userId);
}

export async function loadIlpPolicies(
  supabase: SupabaseClient,
  userId: string
): Promise<IlpPolicy[]> {
  const { data, error } = await supabase
    .from("ilp_policies")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    insurer: String(row.insurer ?? ""),
    planName: String(row.plan_name ?? ""),
    policyNo: String(row.policy_no ?? ""),
    premiumType: (row.premium_type === "single" ? "single" : "regular") as IlpPolicy["premiumType"],
    loadingType: (row.loading_type ?? "front-end") as IlpPolicy["loadingType"],
    monthlyPremium: Number(row.monthly_premium ?? 0),
    initialBonus: Number(row.initial_bonus ?? 0),
    accountValue: Number(row.account_value ?? 0),
    premiumAllocationPct: Number(row.premium_allocation_pct ?? 100),
    lockInEndYm: String(row.lock_in_end_ym ?? ""),
    policyStartYm: String(row.policy_start_ym ?? ""),
    surrenderChargeEndYm: String(row.surrender_charge_end_ym ?? ""),
    insuranceCover: Number(row.insurance_cover ?? 0),
    funds: String(row.funds ?? ""),
    freeFundSwitchesPerYear: Number(row.free_fund_switches_per_year ?? 0),
    notes: String(row.notes ?? ""),
    deductionDay:
      typeof row.deduction_day === "number" && row.deduction_day >= 1
        ? row.deduction_day
        : undefined,
    defaultFinancialAccountId: row.default_financial_account_id
      ? String(row.default_financial_account_id)
      : undefined,
  }));
}

export async function saveIlpPolicies(
  supabase: SupabaseClient,
  userId: string,
  incoming: IlpPolicy[]
): Promise<IlpPolicy[]> {
  const { data: existing } = await supabase
    .from("ilp_policies")
    .select("id")
    .eq("user_id", userId);
  const existingIds = new Set((existing ?? []).map((r) => String(r.id)));
  const incomingIds = new Set(incoming.filter((p) => p.id).map((p) => p.id!));

  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length) {
    await supabase.from("ilp_policies").delete().in("id", toDelete);
  }

  for (let i = 0; i < incoming.length; i++) {
    const p = incoming[i];
    const row = {
      user_id: userId,
      insurer: p.insurer ?? "",
      plan_name: p.planName ?? "",
      policy_no: p.policyNo ?? "",
      premium_type: p.premiumType ?? "regular",
      loading_type: p.loadingType ?? "front-end",
      monthly_premium: p.monthlyPremium ?? 0,
      initial_bonus: p.initialBonus ?? 0,
      account_value: p.accountValue ?? 0,
      premium_allocation_pct: p.premiumAllocationPct ?? 100,
      lock_in_end_ym: p.lockInEndYm ?? "",
      policy_start_ym: p.policyStartYm ?? "",
      surrender_charge_end_ym: p.surrenderChargeEndYm ?? "",
      insurance_cover: p.insuranceCover ?? 0,
      funds: p.funds ?? "",
      free_fund_switches_per_year: p.freeFundSwitchesPerYear ?? 0,
      notes: p.notes ?? "",
      deduction_day: p.deductionDay ?? null,
      default_financial_account_id: p.defaultFinancialAccountId ?? null,
      sort_order: i,
    };
    if (p.id && existingIds.has(p.id)) {
      await supabase.from("ilp_policies").update(row).eq("id", p.id).eq("user_id", userId);
    } else {
      await supabase.from("ilp_policies").insert(row);
    }
  }
  return loadIlpPolicies(supabase, userId);
}

export async function migrateProfileFromDashboard(
  supabase: SupabaseClient,
  userId: string,
  state: DashboardState
): Promise<void> {
  const { data } = await supabase
    .from("user_finance_profile")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    await saveFinanceProfile(supabase, userId, profileFromState(state));
  }
  const { count: insCount } = await supabase
    .from("insurance_policies")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((insCount ?? 0) === 0 && state.insurancePolicies?.length) {
    await saveInsurancePolicies(supabase, userId, state.insurancePolicies);
  }
  const { count: ilpCount } = await supabase
    .from("ilp_policies")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((ilpCount ?? 0) === 0 && state.ilpPolicies?.length) {
    await saveIlpPolicies(supabase, userId, state.ilpPolicies);
  }
  console.info("[migrate] profile bundle", { userId });
}
