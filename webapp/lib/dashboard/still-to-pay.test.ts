import { describe, expect, it } from "vitest";
import { cardUpcomingItems } from "./still-to-pay";

const stmt = (o: Partial<Parameters<typeof cardUpcomingItems>[0][number]>) => ({
  id: "s1",
  creditCardKey: "c1",
  cardName: "Card A",
  statementCloseDate: "2026-11-05",
  paymentDueDate: "2026-11-30",
  outstandingBalance: 1000,
  balanceTransferPortion: 0,
  ...o,
});

describe("cardUpcomingItems", () => {
  it("keeps only the latest statement per card", () => {
    const items = cardUpcomingItems(
      [
        stmt({ id: "old", statementCloseDate: "2026-10-05", paymentDueDate: "2026-10-30" }),
        stmt({ id: "new" }),
      ],
      "2026-11-17"
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.key).toBe("card:new");
  });

  it("subtracts the balance transfer portion", () => {
    const items = cardUpcomingItems(
      [stmt({ outstandingBalance: 1000, balanceTransferPortion: 700 })],
      "2026-11-17"
    );
    expect(items[0]!.amount).toBe(300);
  });

  it("skips cards fully covered by balance transfer", () => {
    expect(
      cardUpcomingItems(
        [stmt({ outstandingBalance: 700, balanceTransferPortion: 700 })],
        "2026-11-17"
      )
    ).toHaveLength(0);
  });

  it("excludes statements due next month, includes overdue", () => {
    expect(
      cardUpcomingItems([stmt({ paymentDueDate: "2026-12-03" })], "2026-11-17")
    ).toHaveLength(0);
    expect(
      cardUpcomingItems([stmt({ paymentDueDate: "2026-10-30" })], "2026-11-17")
    ).toHaveLength(1);
  });
});
