import { afterEach, describe, expect, it, vi } from "vitest";
import { GENERIC_ERROR_MESSAGE, apiError, publicErrorMessage } from "@/lib/api/api-error";

afterEach(() => vi.restoreAllMocks());

describe("apiError / publicErrorMessage (SEC-006)", () => {
  it("masks Postgres/PostgREST text, logs the real error, keeps the status", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dbMessages = [
      'new row violates row-level security policy for table "expenses"',
      'duplicate key value violates unique constraint "expenses_pkey"',
      'relation "public.secret_table" does not exist',
      "Could not find the 'foo' column of 'expenses' in the schema cache",
      "JWT expired",
    ];
    for (const m of dbMessages) {
      const res = apiError("api/test", new Error(m), { status: 500 });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: GENERIC_ERROR_MESSAGE });
    }
    expect(spy).toHaveBeenCalledTimes(dbMessages.length);
    // One JSON line per masked error (OPS-002): scope + the real (scrubbed) message.
    const logged = JSON.parse(String(spy.mock.calls[0][0]));
    expect(logged).toMatchObject({ event: "server_error", scope: "api/test" });
    expect(logged.message).toContain("row-level security");
  });

  it("accepts PostgrestError-shaped objects and plain strings", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await apiError("s", { message: 'permission denied for table "x"', code: "42501" }).json()).toEqual({
      error: GENERIC_ERROR_MESSAGE,
    });
    expect(await apiError("s", "boom").json()).toEqual({ error: GENERIC_ERROR_MESSAGE });
    expect(await apiError("s", undefined).json()).toEqual({ error: GENERIC_ERROR_MESSAGE });
  });

  it("uses the caller's fallback when masking", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(publicErrorMessage("s", new Error("pg: boom"), "Failed to load loans")).toBe("Failed to load loans");
  });

  it("passes deliberate messages through unchanged, without logging", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const m of [
      "Valid amount required",
      "Insufficient balance",
      "Not found",
      "Payment exceeds outstanding balance (123.45)",
      "Unsupported currency: XYZ",
    ]) {
      const res = apiError("s", new Error(m), { status: 400 });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: m });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not let a template message smuggle a DB error through", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(publicErrorMessage("s", new Error("insert: duplicate key value violates unique constraint"))).toBe(
      GENERIC_ERROR_MESSAGE
    );
  });
});
