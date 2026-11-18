import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runHealthCheck } from "@/lib/health/check";

function client(result: { error: { code?: string; message: string } | null } | Error) {
  const calls: { table?: string; head?: boolean } = {};
  const c = {
    from(table: string) {
      calls.table = table;
      return {
        select(_cols: string, opts: { head?: boolean }) {
          calls.head = opts.head;
          return {
            limit() {
              return {
                abortSignal: async () => {
                  if (result instanceof Error) throw result;
                  return { data: null, count: 0, ...result };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { c, calls };
}

let t = 1_000;
const clock = () => (t += 5);

describe("runHealthCheck", () => {
  it("ok when the database answers; uses a HEAD request (no rows returned)", async () => {
    const { c, calls } = client({ error: null });
    const r = await runHealthCheck(c, clock);
    expect(r).toMatchObject({ status: "ok", checks: { app: "ok", database: "ok" } });
    expect(r.latencyMs).toBeGreaterThan(0);
    expect(calls).toEqual({ table: "user_finance_profile", head: true });
  });

  it("error when PostgREST errors, without echoing the error text", async () => {
    const { c } = client({ error: { code: "PGRST000", message: "secret internals" } });
    const r = await runHealthCheck(c, clock);
    expect(r.status).toBe("error");
    expect(r.checks.database).toBe("error");
    expect(JSON.stringify(r)).not.toContain("secret internals");
  });

  it("error on network failure / timeout", async () => {
    const { c } = client(new Error("AbortError"));
    expect((await runHealthCheck(c, clock)).checks.database).toBe("error");
  });

  it("not_configured when Supabase env is missing", async () => {
    expect(await runHealthCheck(null, clock)).toMatchObject({
      status: "error",
      checks: { app: "ok", database: "not_configured" },
      latencyMs: null,
    });
  });
});
