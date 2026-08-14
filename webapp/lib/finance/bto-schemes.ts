import type { BTOInputs } from "./bto";

/** EHG tiers for first-timer families — BTO / resale (HDB, 2024–2026 policy). */
const EHG_FAMILY_TIERS: { maxIncome: number; grant: number }[] = [
  { maxIncome: 1500, grant: 80000 },
  { maxIncome: 2000, grant: 75000 },
  { maxIncome: 2500, grant: 70000 },
  { maxIncome: 3000, grant: 65000 },
  { maxIncome: 3500, grant: 60000 },
  { maxIncome: 4000, grant: 55000 },
  { maxIncome: 4500, grant: 50000 },
  { maxIncome: 5000, grant: 45000 },
  { maxIncome: 5500, grant: 40000 },
  { maxIncome: 6000, grant: 35000 },
  { maxIncome: 6500, grant: 30000 },
  { maxIncome: 7000, grant: 25000 },
  { maxIncome: 7500, grant: 20000 },
  { maxIncome: 8000, grant: 15000 },
  { maxIncome: 8500, grant: 10000 },
  { maxIncome: 9000, grant: 5000 },
];

export type BTOSchemeId = "ehg";

export type BTOSchemeDef = {
  id: BTOSchemeId;
  name: string;
  appliesTo: "bto" | "resale" | "both";
  summary: string;
  eligibility: string;
  sourceUrl: string;
  /** Fixed grant when toggled; null = use compute(). */
  fixedAmount: number | null;
};

export const BTO_SCHEME_DEFS: BTOSchemeDef[] = [
  {
    id: "ehg",
    name: "Enhanced CPF Housing Grant (EHG)",
    appliesTo: "both",
    summary:
      "Main grant for first-timer families on BTO or resale. Credited to CPF OA to reduce loan and cash needed.",
    eligibility:
      "First-timer family; average household income ≤ $9,000/mo (assessed over 12 months at HFE application).",
    sourceUrl:
      "https://www.hdb.gov.sg/residential/buying-a-flat/new/cpf-housing-grants-for-bto-flats",
    fixedAmount: null,
  },
];

export type BTOSchemeSelection = Record<
  BTOSchemeId,
  { enabled: boolean; amountOverride: number | null }
>;

export function defaultBTOSchemes(): BTOSchemeSelection {
  return {
    ehg: { enabled: true, amountOverride: null },
  };
}

export function calcEhgFamilyGrant(householdIncomeMonthly: number): number {
  if (householdIncomeMonthly > 9000) return 0;
  for (const tier of EHG_FAMILY_TIERS) {
    if (householdIncomeMonthly <= tier.maxIncome) return tier.grant;
  }
  return 0;
}

export function schemeComputedAmount(
  id: BTOSchemeId,
  inputs: Pick<BTOInputs, "tSal" | "pSal">
): number {
  const def = BTO_SCHEME_DEFS.find((s) => s.id === id);
  if (!def) return 0;
  if (id === "ehg") {
    return calcEhgFamilyGrant(inputs.tSal + inputs.pSal);
  }
  return def.fixedAmount ?? 0;
}

export function schemeGrantAmount(
  id: BTOSchemeId,
  selection: BTOSchemeSelection,
  inputs: Pick<BTOInputs, "tSal" | "pSal">
): number {
  const sel = selection[id];
  if (!sel?.enabled) return 0;
  if (sel.amountOverride != null && sel.amountOverride >= 0) {
    return sel.amountOverride;
  }
  return schemeComputedAmount(id, inputs);
}

export function totalHousingGrants(
  selection: BTOSchemeSelection,
  inputs: Pick<BTOInputs, "tSal" | "pSal">
): number {
  return BTO_SCHEME_DEFS.reduce(
    (sum, def) => sum + schemeGrantAmount(def.id, selection, inputs),
    0
  );
}

export function enabledSchemeRows(
  selection: BTOSchemeSelection,
  inputs: Pick<BTOInputs, "tSal" | "pSal">
) {
  return BTO_SCHEME_DEFS.filter((def) => selection[def.id]?.enabled).map((def) => {
    const sel = selection[def.id];
    const amount = schemeGrantAmount(def.id, selection, inputs);
    const computed = schemeComputedAmount(def.id, inputs);
    const overridden =
      sel != null &&
      sel.amountOverride != null &&
      sel.amountOverride !== computed;
    return { ...def, amount, computed, overridden };
  });
}
