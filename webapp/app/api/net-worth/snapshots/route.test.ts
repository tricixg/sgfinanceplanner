import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ appended: [] as unknown[] }));

vi.mock("@/lib/supabase/env", () => ({ isSupabaseAuthConfigured: () => true }));
vi.mock("@/lib/auth/require-user", () => ({
  requireSessionUser: async () => ({ user: { id: "u1" } }),
}));
vi.mock("@/lib/supabase/authed", () => ({ createAuthedSupabaseClient: async () => ({}) }));
vi.mock("@/lib/net-worth/load", () => ({
  loadNetWorthSnapshots: async () => [],
  appendNetWorthSnapshot: async (_s: unknown, _u: string, snap: unknown) => {
    h.appended.push(snap);
  },
}));

import { POST } from "./route";

const post = (snapshot: unknown) =>
  POST(
    new NextRequest("http://localhost/api/net-worth/snapshots", {
      method: "POST",
      body: JSON.stringify({ snapshot }),
    })
  );

describe("POST /api/net-worth/snapshots (DATA-005)", () => {
  beforeEach(() => {
    h.appended = [];
  });

  it("stores a valid first-of-month snapshot", async () => {
    const res = await post({ month: "2026-11-01", lnw: 12345.67, cpf: 80000 });
    expect(res.status).toBe(200);
    expect(h.appended).toHaveLength(1);
  });

  it.each([
    ["not a first-of-month date", { month: "2026-11-17", lnw: 1, cpf: 1 }],
    ["a malformed month", { month: "Nov 2026", lnw: 1, cpf: 1 }],
    ["a missing lnw", { month: "2026-11-01", cpf: 1 }],
    ["a string lnw", { month: "2026-11-01", lnw: "12", cpf: 1 }],
    // JSON.stringify turns NaN into null, which must not be stored as $0
    ["a NaN cpf (serialised as null)", { month: "2026-11-01", lnw: 1, cpf: Number.NaN }],
  ])("rejects %s with 400 and writes nothing", async (_n, snap) => {
    const res = await post(snap);
    expect(res.status).toBe(400);
    expect(h.appended).toHaveLength(0);
  });
});
