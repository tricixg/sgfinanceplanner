import type { DashboardState } from "@/lib/types";

/** True when persisted JSON is a full dashboard snapshot (not `{}`). */
export function isPersistedDashboardSnapshot(data: unknown): boolean {
  return isValidDashboardState(data);
}

export function isValidDashboardState(data: unknown): data is DashboardState {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const hasSalary =
    typeof d.monthlySal === "number" || typeof d.newSal === "number";
  return (
    hasSalary &&
    Array.isArray(d.loans) &&
    Array.isArray(d.goals) &&
    Array.isArray(d.holdings) &&
    Array.isArray(d.budget) &&
    (Array.isArray(d.accounts) || Array.isArray(d.goals)) &&
    (Array.isArray(d.ilpPolicies) || typeof (d as { ilp?: number }).ilp === "number")
  );
}
