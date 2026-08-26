import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { restoreOtherLoanDrawDown, restoreOtherLoanPayment } from "@/lib/other-loans/pay";

type QueryResult = { data?: unknown; error: { message: string } | null };

function makeThenable(
  result: QueryResult,
  onUpdate?: (patch: Record<string, unknown>) => void
) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "maybeSingle"] as const) {
    builder[method] = vi.fn(() => builder);
  }
  builder.update = vi.fn((patch: Record<string, unknown>) => {
    onUpdate?.(patch);
    return builder;
  });
  builder.then = (
    onFulfilled: (v: QueryResult) => unknown,
    onRejected?: (e: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function createMockSupabase(
  readResult: QueryResult,
  updateResult: QueryResult,
  onUpdate?: (patch: Record<string, unknown>) => void
) {
  let step = 0;
  const from = vi.fn(() => {
    step += 1;
    return step === 1 ? makeThenable(readResult) : makeThenable(updateResult, onUpdate);
  });
  return { from };
}

describe("restoreOtherLoanPayment", () => {
  it("adds the amount back to outstanding and subtracts from amount_paid", async () => {
    let patch: Record<string, unknown> | undefined;
    const mock = createMockSupabase(
      { data: { id: "loan-1", outstanding: 100, amount_paid: 400 }, error: null },
      { error: null },
      (p) => {
        patch = p;
      }
    );

    const result = await restoreOtherLoanPayment(
      { from: mock.from } as unknown as SupabaseClient,
      "user-1",
      "loan-1",
      50
    );

    expect(result).toEqual({ ok: true });
    expect(patch).toMatchObject({ outstanding: 150, amount_paid: 350, paid_at: null });
  });

  it("does not let amount_paid go negative", async () => {
    let patch: Record<string, unknown> | undefined;
    const mock = createMockSupabase(
      { data: { id: "loan-1", outstanding: 0, amount_paid: 30 }, error: null },
      { error: null },
      (p) => {
        patch = p;
      }
    );

    await restoreOtherLoanPayment(
      { from: mock.from } as unknown as SupabaseClient,
      "user-1",
      "loan-1",
      50
    );

    expect(patch?.amount_paid).toBe(0);
    expect(patch?.outstanding).toBe(50);
  });
});

describe("restoreOtherLoanDrawDown", () => {
  it("subtracts the amount from outstanding and principal", async () => {
    let patch: Record<string, unknown> | undefined;
    const mock = createMockSupabase(
      { data: { id: "loan-1", outstanding: 500, principal: 500 }, error: null },
      { error: null },
      (p) => {
        patch = p;
      }
    );

    const result = await restoreOtherLoanDrawDown(
      { from: mock.from } as unknown as SupabaseClient,
      "user-1",
      "loan-1",
      200
    );

    expect(result).toEqual({ ok: true });
    expect(patch).toMatchObject({ outstanding: 300, principal: 300 });
  });

  it("clamps outstanding and principal at zero", async () => {
    let patch: Record<string, unknown> | undefined;
    const mock = createMockSupabase(
      { data: { id: "loan-1", outstanding: 100, principal: 100 }, error: null },
      { error: null },
      (p) => {
        patch = p;
      }
    );

    await restoreOtherLoanDrawDown(
      { from: mock.from } as unknown as SupabaseClient,
      "user-1",
      "loan-1",
      150
    );

    expect(patch?.outstanding).toBe(0);
    expect(patch?.principal).toBe(0);
  });

  it("returns an error when the loan is not found", async () => {
    const mock = createMockSupabase({ data: null, error: null }, { error: null });

    const result = await restoreOtherLoanDrawDown(
      { from: mock.from } as unknown as SupabaseClient,
      "user-1",
      "missing",
      10
    );

    expect(result).toEqual({ ok: false, error: "Loan not found" });
  });
});
