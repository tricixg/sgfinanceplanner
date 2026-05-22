import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import { cashAccountsTotal, migrateAccounts } from "./accounts";
import { wealthSummary } from "./wealth";

describe("cashAccountsTotal", () => {
  it("sums savings account balances", () => {
    expect(cashAccountsTotal(DEFAULTS)).toBe(2500);
  });

  it("migrates legacy goal saved amounts into accounts", () => {
    const accounts = migrateAccounts({
      goals: [
        { name: "A", target: 1000, saved: 300, by: "2027-01", where: "Bank A" },
        { name: "B", target: 500, saved: 200, by: "2027-06", where: "Bank A" },
      ],
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0].balance).toBe(500);
  });

  it("wealthSummary cash uses accounts when they differ from goal progress", () => {
    const S = {
      ...DEFAULTS,
      accounts: [{ name: "DBS", balance: 999, notes: "" }],
    };
    const { cash } = wealthSummary(S);
    expect(cash).toBe(999);
    expect(cash).not.toBe(DEFAULTS.goals.reduce((s, g) => s + g.saved, 0));
  });
});
