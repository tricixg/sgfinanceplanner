import { describe, expect, it } from "vitest";
import { netWorthSnapshotBlockers, type NetWorthSnapshotInputs } from "./snapshot-gate";

const READY: NetWorthSnapshotInputs = {
  coreLoading: false,
  loadErrors: {},
  accountsLoaded: true,
  accountsError: null,
  fundsLoaded: true,
  cardStatementsLoaded: true,
};

describe("netWorthSnapshotBlockers (DATA-005)", () => {
  it("allows the write when every input loaded successfully", () => {
    expect(netWorthSnapshotBlockers(READY)).toEqual([]);
  });

  it.each([
    ["core still loading", { coreLoading: true }],
    ["card statements not loaded", { cardStatementsLoaded: false }],
    ["funds not loaded", { fundsLoaded: false }],
    ["accounts not loaded", { accountsLoaded: false }],
  ])("blocks while %s", (_name, patch) => {
    expect(netWorthSnapshotBlockers({ ...READY, ...patch }).length).toBeGreaterThan(0);
  });

  it("blocks after an accounts load error", () => {
    const b = netWorthSnapshotBlockers({ ...READY, accountsError: "boom", accountsLoaded: false });
    expect(b).toContain("accounts failed to load");
  });

  it.each(["loans", "cards", "holdings", "profile", "otherLoans"] as const)(
    "blocks after a %s load error",
    (domain) => {
      const b = netWorthSnapshotBlockers({ ...READY, loadErrors: { [domain]: "x" } });
      expect(b).toContain(`${domain} failed to load`);
    }
  );
});
