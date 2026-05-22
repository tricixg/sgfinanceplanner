import type { DashboardState, InsurancePolicy } from "@/lib/types";

export const COMPUTED_INSURANCE_LABEL = "Insurance premiums (from ME)";

export function defaultInsurancePolicy(): InsurancePolicy {
  return { name: "", insurer: "", monthlyPremium: 0, notes: "" };
}

export function computedInsuranceMonthly(S: DashboardState): number {
  return S.insurancePolicies.reduce((s, p) => s + p.monthlyPremium, 0);
}

export function isInsuranceBudgetCategory(cat: string): boolean {
  const c = cat.toLowerCase();
  return (
    c.includes("insurance") ||
    c.includes("eci") ||
    c.includes("manuprotect") ||
    c.includes("readyprotect")
  );
}

type LegacyInsuranceSaved = {
  insurancePolicies?: Partial<InsurancePolicy>[];
  eci?: number;
  tpd?: number;
  acc?: number;
};

function normalizePolicy(raw: Partial<InsurancePolicy>): InsurancePolicy {
  const base = defaultInsurancePolicy();
  return {
    ...base,
    ...raw,
    name: typeof raw.name === "string" ? raw.name : base.name,
    insurer: typeof raw.insurer === "string" ? raw.insurer : base.insurer,
    monthlyPremium:
      typeof raw.monthlyPremium === "number" ? raw.monthlyPremium : 0,
    notes: typeof raw.notes === "string" ? raw.notes : "",
  };
}

export function migrateInsurancePolicies(saved: LegacyInsuranceSaved): InsurancePolicy[] {
  if (saved.insurancePolicies?.length) {
    return saved.insurancePolicies.map((p) => normalizePolicy(p));
  }

  const legacy: { name: string; insurer: string; premium: number }[] = [];
  if ((saved.eci ?? 0) > 0) {
    legacy.push({ name: "ECI", insurer: "", premium: saved.eci! });
  }
  if ((saved.tpd ?? 0) > 0) {
    legacy.push({
      name: "ManuProtect TPD",
      insurer: "Manulife",
      premium: saved.tpd!,
    });
  }
  if ((saved.acc ?? 0) > 0) {
    legacy.push({
      name: "ReadyProtect PA",
      insurer: "",
      premium: saved.acc!,
    });
  }

  if (legacy.length === 0) return [];

  console.info("[migrateInsurancePolicies] migrated legacy eci/tpd/acc", {
    count: legacy.length,
  });
  return legacy.map((l) =>
    normalizePolicy({
      name: l.name,
      insurer: l.insurer,
      monthlyPremium: l.premium,
      notes: "Migrated from legacy insurance fields",
    })
  );
}
