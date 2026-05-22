import type { DashboardState } from "@/lib/types";

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
    Array.isArray(d.budget)
  );
}
