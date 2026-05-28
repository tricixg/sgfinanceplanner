import { describe, expect, it } from "vitest";
import { buildCardCyclesForMonth } from "@/lib/finance/build-calendar-cycles";

const card = {
  id: "uuid-dbs",
  cardKey: "dbs-cc",
  name: "DBS",
  statementDay: 5,
  paymentDueDay: 25,
};

describe("buildCardCyclesForMonth", () => {
  it("projects different payment due months without refetching entries", () => {
    const entries = [
      {
        creditCardId: "uuid-dbs",
        statementCloseDate: "2026-04-05",
        paymentDueDate: "2026-05-25",
        actualAmount: 500,
      },
    ];

    const may = buildCardCyclesForMonth([card], "2026-05", entries);
    const jun = buildCardCyclesForMonth([card], "2026-06", entries);

    const mayPay = may.find((c) => c.paymentDueDate.startsWith("2026-05"));
    const junPay = jun.find((c) => c.paymentDueDate.startsWith("2026-06"));

    expect(mayPay?.actualAmount).toBe(500);
    expect(junPay?.actualAmount).toBeNull();
  });
});
