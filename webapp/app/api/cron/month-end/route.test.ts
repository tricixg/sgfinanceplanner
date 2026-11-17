import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  today: "2026-11-30",
  adminNull: false,
  ran: [] as string[],
}));

vi.mock("@/lib/supabase/env", () => ({ isSupabaseAuthConfigured: () => true }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => (h.adminNull ? null : ({} as object)),
}));
vi.mock("@/lib/time/sgt", () => ({ sgtTodayYmd: () => h.today }));
vi.mock("@/lib/jobs/month-end", async (orig) => ({
  ...(await orig<typeof import("@/lib/jobs/month-end")>()),
  listProfileUserIds: async () => ["u1", "u2"],
  processUserMonthEnd: async (_c: unknown, userId: string, ym: string) => {
    h.ran.push(`${userId}:${ym}`);
    return { netWorth: true, lines: true, errors: [] };
  },
}));

import { GET } from "./route";

const call = (url = "http://x/api/cron/month-end", auth: string | null = "Bearer s3cret") =>
  GET(new Request(url, { headers: auth ? { authorization: auth } : {} }));

describe("GET /api/cron/month-end", () => {
  beforeEach(() => {
    h.today = "2026-11-30";
    h.adminNull = false;
    h.ran = [];
    process.env.CRON_SECRET = "s3cret";
  });

  it("is 503 when CRON_SECRET is not configured (fails closed)", async () => {
    delete process.env.CRON_SECRET;
    const res = await call();
    expect(res.status).toBe(503);
    expect(h.ran).toHaveLength(0);
  });

  it.each([null, "Bearer nope"])("is 401 for %s", async (auth) => {
    const res = await call("http://x/api/cron/month-end", auth);
    expect(res.status).toBe(401);
    expect(h.ran).toHaveLength(0);
  });

  it("skips on days that are not the last day of the month (SGT)", async () => {
    h.today = "2026-11-29";
    const body = await (await call()).json();
    expect(body).toMatchObject({ skipped: true, month: "2026-11" });
    expect(h.ran).toHaveLength(0);
  });

  it("runs for every user on the last day of the month", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, month: "2026-11", users: 2, netWorthWritten: 2, linesFrozen: 2, failedUsers: 0 });
    expect(h.ran.sort()).toEqual(["u1:2026-11", "u2:2026-11"]);
  });

  it("?force=1 runs mid-month for the current month (and says it was forced)", async () => {
    h.today = "2026-11-17";
    const body = await (await call("http://x/api/cron/month-end?force=1")).json();
    expect(body).toMatchObject({ ok: true, forced: true, month: "2026-11" });
    expect(h.ran).toHaveLength(2);
  });

  it("force still needs the secret", async () => {
    h.today = "2026-11-17";
    const res = await call("http://x/api/cron/month-end?force=1", "Bearer nope");
    expect(res.status).toBe(401);
    expect(h.ran).toHaveLength(0);
  });

  it("is 503 when the service-role key is missing", async () => {
    h.adminNull = true;
    expect((await call()).status).toBe(503);
  });
});
