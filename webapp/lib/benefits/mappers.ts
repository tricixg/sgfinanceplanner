import type { Benefit, BenefitClaim } from "@/lib/benefits/types";

export function mapBenefit(row: Record<string, unknown>): Benefit {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name ?? ""),
    limitAmount: row.limit_amount != null ? Number(row.limit_amount) : null,
    cycleMonths: row.cycle_months != null ? Number(row.cycle_months) : null,
    cycleAnchorDate: String(row.cycle_anchor_date ?? "").slice(0, 10),
    incomeCategoryId: row.income_category_id ? String(row.income_category_id) : null,
    notes: String(row.notes ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    hidden: Boolean(row.hidden ?? false),
  };
}

export function mapBenefitClaim(row: Record<string, unknown>): BenefitClaim {
  const sourceType = row.source_record_type;
  return {
    id: String(row.id),
    benefitId: String(row.benefit_id),
    amount: Number(row.amount ?? 0),
    claimedAt: String(row.claimed_at ?? "").slice(0, 10),
    note: String(row.note ?? ""),
    sourceRecordType: sourceType === "savings" || sourceType === "budget" ? sourceType : null,
    sourceRecordId: row.source_record_id ? String(row.source_record_id) : null,
    createdAt: String(row.created_at ?? ""),
  };
}
