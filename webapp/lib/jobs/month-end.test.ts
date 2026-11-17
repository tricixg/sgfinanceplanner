import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const h = vi.hoisted(() => ({
  snapshots: [] as unknown[],
  frozen: [] as unknown[],
  failNetWorthWrite: false,
  failProfileLoad: false,
}));

vi.mock("@/lib/profile/load", () => ({
  loadFinanceProfile: async () => {
    if (h.failProfileLoad) throw new Error("profile down");
    return {
      monthlySal: 0, salaryCreditDay: 25, oa: 1000, sa: 2000, ma: 3000, moo: 0,
      margin: 0, cash: 0, ccDebt: 0, cashflowStartYm: "2026-06", dateOfBirth: "",
    };
  },
  loadInsurancePolicies: async () => [{ name: "I", insurer: "", monthlyPremium: 100, notes: "" }],
  loadIlpPolicies: async () => [
    { insurer: "", planName: "P", policyNo: "", premiumType: "regular", loadingType: "front-end",
      monthlyPremium: 50, initialBonus: 0, accountValue: 0, premiumAllocationPct: 100,
      lockInEndYm: "", policyStartYm: "", surrenderChargeEndYm: "", insuranceCover: 0,
      funds: "", freeFundSwitchesPerYear: 0, notes: "" },
  ],
}));
vi.mock("@/lib/credit-cards/load", () => ({ loadCreditCards: async () => [] }));
vi.mock("@/lib/credit-cards/card-statements/load", () => ({
  loadCardStatementsBundle: async () => ({
    configured: true,
    statements: [],
    openCycles: [{ creditCardId: "c", creditCardKey: "k", cardName: "C", statementCloseDate: "", cycleStartDate: "", cycleEndDate: "", carriedForward: 0, newSpend: 200, interestEstimate: 0, estimatedTotal: 200, daysLeftInCycle: 3 }],
  }),
}));
vi.mock("@/lib/holdings/load", () => ({ loadHoldings: async () => [] }));
vi.mock("@/lib/savings/load-accounts", () => ({
  loadAccountsBundle: async () => ({
    accounts: [],
    totals: { personalSavingsCash: 4000, personalNetWorthCash: 5000 },
  }),
}));
vi.mock("@/lib/funds/load", () => ({
  loadFundsBundle: async () => ({ funds: [], totals: { fundsBalanceTotal: 700 } }),
}));
vi.mock("@/lib/loans/load", () => ({
  loadLoans: async () => [{ name: "L", card: "C", monthly: 30, out: 0, end: "2099-12" }],
}));
vi.mock("@/lib/other-loans/load", () => ({ loadOtherLoans: async () => [] }));
vi.mock("@/lib/net-worth/load", () => ({
  appendNetWorthSnapshot: async (_s: unknown, userId: string, snap: unknown) => {
    if (h.failNetWorthWrite) throw new Error("db write failed");
    h.snapshots.push({ userId, snap });
  },
}));
vi.mock("@/lib/budget/computed-months-load", () => ({
  saveComputedMonth: async (_s: unknown, userId: string, month: string, lines: unknown) => {
    h.frozen.push({ userId, month, lines });
  },
}));

import { monthEndInfo, processUserMonthEnd, runMonthEnd } from "./month-end";

const client = {} as SupabaseClient;

describe("monthEndInfo", () => {
  it.each([
    ["2026-11-30", "2026-11", true],
    ["2026-11-29", "2026-11", false],
    ["2026-12-31", "2026-12", true],
    ["2026-02-28", "2026-02", true],
    ["2028-02-28", "2028-02", false], // leap year
    ["2028-02-29", "2028-02", true],
    ["2026-01-31", "2026-01", true],
    ["2026-04-30", "2026-04", true],
    ["2026-04-01", "2026-04", false],
  ])("%s → month %s, last day %s", (today, ym, last) => {
    expect(monthEndInfo(today)).toEqual({ ym, isLastDay: last });
  });
});

describe("processUserMonthEnd", () => {
  beforeEach(() => {
    h.snapshots = [];
    h.frozen = [];
    h.failNetWorthWrite = false;
    h.failProfileLoad = false;
  });

  it("writes the month's net worth the way Cash Accounts computes it, and freezes the month's lines", async () => {
    const r = await processUserMonthEnd(client, "u1", "2026-11");
    expect(r).toEqual({ netWorth: true, lines: true, errors: [] });
    // lnw = cash 5,000 + funds 700 − card balance 200; cpf = 1,000 + 2,000 + 3,000
    expect(h.snapshots).toEqual([
      { userId: "u1", snap: { month: "2026-11-01", lnw: 5500, cpf: 6000 } },
    ]);
    expect(h.frozen).toEqual([
      { userId: "u1", month: "2026-11", lines: { insurance: 100, ilp: 50, debt: 30 } },
    ]);
  });

  it("writes nothing when an input fails to load", async () => {
    h.failProfileLoad = true;
    const r = await processUserMonthEnd(client, "u1", "2026-11");
    expect(r.netWorth).toBe(false);
    expect(r.lines).toBe(false);
    expect(r.errors[0]).toContain("profile down");
    expect(h.snapshots).toHaveLength(0);
    expect(h.frozen).toHaveLength(0);
  });

  it("a failed net-worth write is reported and does not stop the lines being frozen", async () => {
    h.failNetWorthWrite = true;
    const r = await processUserMonthEnd(client, "u1", "2026-11");
    expect(r.netWorth).toBe(false);
    expect(r.lines).toBe(true);
    expect(r.errors).toEqual(["net worth: db write failed"]);
  });
});

describe("runMonthEnd", () => {
  it("processes every user, counts results, and one failing user doesn't stop the rest", async () => {
    const seen: string[] = [];
    const summary = await runMonthEnd({
      userIds: ["a", "b", "c", "d", "e"],
      ym: "2026-11",
      concurrency: 2,
      processUser: async (id) => {
        seen.push(id);
        if (id === "b") throw new Error("boom");
        if (id === "d") return { netWorth: false, lines: true, errors: ["load: x"] };
        return { netWorth: true, lines: true, errors: [] };
      },
    });
    expect(seen.sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(summary).toEqual({
      month: "2026-11",
      users: 5,
      netWorthWritten: 3,
      linesFrozen: 4,
      failedUsers: 2,
    });
  });

  it("handles no users", async () => {
    const s = await runMonthEnd({ userIds: [], ym: "2026-11", processUser: async () => ({ netWorth: true, lines: true, errors: [] }) });
    expect(s.users).toBe(0);
  });
});
