import {
  AUTO_DEBT_ID,
  AUTO_ILP_ID,
  AUTO_INSURANCE_ID,
} from "@/lib/expenses/auto-category-ids";
import { normalizeCategoryKey } from "@/lib/expenses/budget-match";
import { COMPUTED_DEBT_LABEL, COMPUTED_SAVINGS_LABEL } from "@/lib/finance/budget";
import { COMPUTED_ILP_LABEL } from "@/lib/finance/ilp";
import { COMPUTED_INSURANCE_LABEL } from "@/lib/finance/insurance";

/**
 * One colour per budget category, shared by every chart that breaks spending
 * down by category (Budget doughnut, Dashboard "Where your money went",
 * Past Cashflow), so a category looks the same everywhere.
 */

/**
 * "Kopitiam" palette. Together with the four auto colours below, every pair is
 * at least ~10 OKLab ΔE apart (≈7 under red-green colour blindness), and each
 * colour keeps ≥1.9:1 contrast on both the light and dark card backgrounds.
 * Ordered so the first few colours handed out are the most different.
 *
 * Colours for user categories (budget lines, income categories), assigned by
 * the user's category order.
 */
export const CATEGORY_PALETTE = [
  "#e089a0", // bandung rose
  "#633f9b", // ube purple
  "#9d4e01", // toast brown
  "#1e8a89", // teal
  "#dcb701", // kaya yellow
  "#d56f0a", // papaya
  "#7db25f", // pandan green
  "#2b4d6f", // navy
  "#6b412e", // kopi brown
  "#d8b297", // teh tarik
  "#a781b8", // taro
  "#8e8f68", // sage
] as const;

/** Fixed colours for the categories computed from other tabs. */
export const AUTO_CATEGORY_COLORS = {
  debt: "#c53954",
  insurance: "#4d6ba3",
  ilp: "#8aaecd",
  savings: "#2b7344",
} as const;

/** Fixed colours for built-in income categories, keyed by slug. */
export const INCOME_SLUG_COLORS: Readonly<Record<string, string>> = {
  salary: "#e089a0", // bandung rose
};

/**
 * Series colours for the cashflow and projection charts (5-Month Cashflow,
 * 5-Year Projection, Budget allocation projection), from the same palette so
 * Salary, Loans, ILP, Insurance and CPF/Savings look the same on every page.
 */
export const FLOW_COLORS = {
  salary: INCOME_SLUG_COLORS.salary!,
  additionalIncome: "#7db25f", // pandan green
  fixed: "#d8b297", // teh tarik
  variable: "#d56f0a", // papaya
  loans: AUTO_CATEGORY_COLORS.debt,
  ilp: AUTO_CATEGORY_COLORS.ilp,
  insurance: AUTO_CATEGORY_COLORS.insurance,
  cpf: AUTO_CATEGORY_COLORS.savings,
  investments: "#633f9b", // ube purple
  cash: "#1e8a89", // teal
  debt: AUTO_CATEGORY_COLORS.debt,
  /** Net / net-worth line drawn over the bars. */
  line: "#1d2a20",
} as const;

export const OTHER_CATEGORY_COLOR = "#c4bdb0";
export const UNCATEGORIZED_COLOR = "#9a9384";

const AUTO_BY_ID: Record<string, string> = {
  [AUTO_DEBT_ID]: AUTO_CATEGORY_COLORS.debt,
  [AUTO_INSURANCE_ID]: AUTO_CATEGORY_COLORS.insurance,
  [AUTO_ILP_ID]: AUTO_CATEGORY_COLORS.ilp,
};

const AUTO_BY_LABEL: Record<string, string> = {
  [normalizeCategoryKey(COMPUTED_DEBT_LABEL)]: AUTO_CATEGORY_COLORS.debt,
  [normalizeCategoryKey(COMPUTED_INSURANCE_LABEL)]: AUTO_CATEGORY_COLORS.insurance,
  [normalizeCategoryKey(COMPUTED_ILP_LABEL)]: AUTO_CATEGORY_COLORS.ilp,
  [normalizeCategoryKey(COMPUTED_SAVINGS_LABEL)]: AUTO_CATEGORY_COLORS.savings,
};

const OTHER_IDS = new Set(["__other__"]);
const UNCATEGORIZED_ID = "__uncategorized__";

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export type CategoryColorFn = (id: string | null | undefined, label?: string) => string;

/**
 * Build the colour lookup from the user's category ids in order (budget catalog
 * creation order, or income category order). Lookup order:
 *   1. "Other" rollups → neutral grey
 *   2. `fixedById` (e.g. Salary) → its pinned colour
 *   3. Computed categories (debt / insurance / ILP / savings) → fixed colour
 *   4. Listed categories → palette slot by position. Pinned colours are taken
 *      out of the palette first, so no other category shares them.
 *   5. Anything else (e.g. an unmatched expense category) → stable hash of its name
 */
export function buildCategoryColors(
  categoryOrder: readonly string[] | null | undefined,
  fixedById: Readonly<Record<string, string>> = {}
): CategoryColorFn {
  const pinned = new Set(Object.values(fixedById).map((c) => c.toLowerCase()));
  const palette = CATEGORY_PALETTE.filter((c) => !pinned.has(c.toLowerCase()));
  const slot = new Map<string, number>();
  for (const id of categoryOrder ?? []) {
    if (!slot.has(id) && !fixedById[id]) slot.set(id, slot.size);
  }

  return (id, label) => {
    const key = id ?? "";
    if (OTHER_IDS.has(key)) return OTHER_CATEGORY_COLOR;
    if (fixedById[key]) return fixedById[key]!;
    if (AUTO_BY_ID[key]) return AUTO_BY_ID[key]!;
    const labelKey = normalizeCategoryKey(label ?? "");
    if (labelKey && AUTO_BY_LABEL[labelKey]) return AUTO_BY_LABEL[labelKey]!;
    const i = slot.get(key);
    if (i !== undefined) return palette[i % palette.length]!;
    if (key === UNCATEGORIZED_ID) return UNCATEGORIZED_COLOR;
    const basis = labelKey || key;
    if (!basis) return UNCATEGORIZED_COLOR;
    return palette[hashString(basis) % palette.length]!;
  };
}

/** Pinned colours for income categories with a built-in slug (e.g. Salary). */
export function incomeFixedColors(
  categorySlugs: Readonly<Record<string, string>> | null | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, slug] of Object.entries(categorySlugs ?? {})) {
    const color = INCOME_SLUG_COLORS[slug];
    if (color) out[id] = color;
  }
  return out;
}
