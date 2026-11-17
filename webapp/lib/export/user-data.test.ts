import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";
import {
  EXPORT_EXCLUDED_TABLES,
  HOUSEHOLD_EXPORT_TABLES,
  USER_TABLES,
  exportUserDataChunks,
} from "@/lib/export/user-data";

const ME = "u-me";
const OTHER = "u-other";
const HH = "hh-1";

async function run(f: ReturnType<typeof createFakeSupabase>) {
  let text = "";
  for await (const c of exportUserDataChunks(f.client, { id: ME, email: "Me@x.com" })) text += c;
  return JSON.parse(text) as {
    meta: Record<string, unknown>;
    tables: Record<string, Record<string, unknown>[]>;
    summary: { complete: boolean; errors: Record<string, string>; totalRows: number; tables: Record<string, { rows: number }> };
  };
}

describe("exportUserDataChunks", () => {
  it("covers every table created by the migrations (so new tables can't be forgotten)", () => {
    const dir = path.join(__dirname, "../../supabase/migrations");
    const created = new Set<string>();
    const dropped = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
      const sql = readFileSync(path.join(dir, f), "utf8");
      for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)/gi)) created.add(m[1]);
      for (const m of sql.matchAll(/drop table (?:if exists )?(?:public\.)?(\w+)/gi)) dropped.add(m[1]);
    }
    const covered = new Set([
      ...USER_TABLES.map((t) => t.table),
      ...HOUSEHOLD_EXPORT_TABLES,
      ...EXPORT_EXCLUDED_TABLES,
    ]);
    const missing = [...created].filter((t) => !dropped.has(t) && !covered.has(t));
    expect(missing).toEqual([]);
  });

  it("exports only the signed-in user's rows, plus their household's", async () => {
    const f = createFakeSupabase({
      expenses: [
        { id: "e1", user_id: ME, amount: 5 },
        { id: "e2", user_id: OTHER, amount: 9 },
      ],
      credit_cards: [{ id: "c1", user_id: ME }],
      card_statements: [{ id: "s1", user_id: ME }],
      household_members: [
        { household_id: HH, user_id: ME },
        { household_id: HH, user_id: OTHER },
        { household_id: "hh-2", user_id: "u-x" },
      ],
      savings_pools: [
        { id: "p1", household_id: HH },
        { id: "p2", household_id: "hh-2" },
      ],
      savings_transactions: [
        { id: "t-mine", user_id: ME, household_id: null },
        { id: "t-partner-pool", user_id: OTHER, household_id: HH },
        { id: "t-stranger", user_id: "u-x", household_id: "hh-2" },
      ],
      savings_goals: [
        { id: "g1", owner_user_id: ME, household_id: null },
        { id: "g2", owner_user_id: null, household_id: HH },
        { id: "g3", owner_user_id: OTHER, household_id: null },
      ],
      partner_invites: [
        { id: "i1", household_id: HH, inviter_id: ME, invitee_email: "p@x.com" },
        { id: "i2", household_id: "hh-9", inviter_id: "u-x", invitee_email: "me@x.com" },
      ],
    });
    const out = await run(f);
    expect(out.tables.expenses.map((r) => r.id)).toEqual(["e1"]);
    expect(out.tables.credit_cards).toHaveLength(1);
    expect(out.tables.card_statements).toHaveLength(1);
    expect(out.tables.household_members).toHaveLength(2);
    expect(out.tables.savings_pools.map((r) => r.id)).toEqual(["p1"]);
    expect(out.tables.savings_transactions.map((r) => r.id).sort()).toEqual(["t-mine", "t-partner-pool"]);
    expect(out.tables.savings_goals.map((r) => r.id).sort()).toEqual(["g1", "g2"]);
    expect(out.tables.partner_invites.map((r) => r.id)).toEqual(["i1"]);
    expect(out.tables.partner_invites_received.map((r) => r.id)).toEqual(["i2"]);
    expect(out.summary.complete).toBe(true);
    expect(out.meta.userId).toBe(ME);
  });

  it("includes every user table, even empty ones, and skips household tables without a household", async () => {
    const out = await run(createFakeSupabase({}));
    for (const t of USER_TABLES) expect(out.tables[t.table]).toEqual([]);
    expect(out.tables.savings_pools).toBeUndefined();
    expect(out.summary.complete).toBe(true);
  });

  it("pages past PostgREST's 1000-row limit", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: `e${i}`, user_id: ME }));
    const out = await run(createFakeSupabase({ expenses: rows }));
    expect(out.tables.expenses).toHaveLength(2500);
    expect(out.summary.tables.expenses.rows).toBe(2500);
  });

  it("reports an incomplete export instead of pretending it's whole", async () => {
    const f = createFakeSupabase(
      { expenses: [{ id: "e1", user_id: ME }], loans: [{ id: "l1", user_id: ME }] },
      { failOn: (op) => (op.table === "loans" ? "relation does not exist" : null) }
    );
    const out = await run(f);
    expect(out.summary.complete).toBe(false);
    expect(out.summary.errors.loans).toBe("relation does not exist");
    expect(out.tables.expenses).toHaveLength(1);
  });
});
