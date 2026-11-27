/** 078 miles functions through lib/miles/ledger.ts, as the signed-in user. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMilesAction } from "@/lib/miles/ledger";
import { monthToInput, monthToYmd, quarterEnd, sgtThisMonth } from "@/lib/miles/months";
import { createTestDb, createUser, hasRealPostgres, rpcClientAs, type TestDb } from "./test-db";
import { count } from "./fixtures";

let db: TestDb;
const NOW = sgtThisMonth();
const ym = (offset: number) => monthToInput(NOW + offset);

type LotRow = { id: string; program: string; amount: string; used: string; expiry_month: string | null; source: string };

async function lots(userId: string, program?: string): Promise<LotRow[]> {
  return db.query<LotRow>(
    `select id, program, amount, used, to_char(expiry_month, 'YYYY-MM-DD') expiry_month, source
       from miles_lots where user_id = $1 ${program ? "and program = $2" : ""}
       order by expiry_month nulls last, created_at`,
    program ? [userId, program] : [userId]
  );
}

const left = (rows: LotRow[]) => rows.map((r) => Number(r.amount) - Number(r.used));

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("logging points", () => {
  it("KrisFlyer lots default to 36 months; Altitude has no expiry; UOB needs one", async () => {
    const u = await createUser(db);
    const sb = rpcClientAs(db, u);
    await applyMilesAction(sb, u, { action: "addLot", program: "krisflyer", amount: 1300, earnedMonth: ym(-13) });
    await applyMilesAction(sb, u, { action: "addLot", program: "dbs_altitude", amount: 17500 });
    await expect(applyMilesAction(sb, u, { action: "addLot", program: "uob", amount: 10 })).rejects.toThrow(
      "Enter the expiry date the UOB app shows"
    );
    await expect(
      applyMilesAction(sb, u, { action: "addLot", program: "dbs_womans_world", amount: 10, expiryMonth: ym(3) })
    ).rejects.toThrow("Log Woman's World points by expiry month");
    const rows = await lots(u);
    expect(rows.map((r) => [r.program, r.expiry_month])).toEqual([
      ["krisflyer", monthToYmd(NOW - 13 + 36)],
      ["dbs_altitude", null],
    ]);
  });

  it("Woman's World buckets are set to the DBS app figure, and 0 removes one", async () => {
    const u = await createUser(db);
    const sb = rpcClientAs(db, u);
    await applyMilesAction(sb, u, { action: "setExpiryBucket", expiryMonth: ym(13), amount: 300 });
    await applyMilesAction(sb, u, { action: "setExpiryBucket", expiryMonth: ym(13), amount: 1500 });
    expect(left(await lots(u))).toEqual([1500]);
    await applyMilesAction(sb, u, { action: "setExpiryBucket", expiryMonth: ym(13), amount: 0 });
    expect(await lots(u)).toEqual([]);
  });

  it("a UOB balance increase goes into this quarter; a decrease comes off the oldest UNI$", async () => {
    const u = await createUser(db);
    const sb = rpcClientAs(db, u);
    await applyMilesAction(sb, u, { action: "addLot", program: "uob", amount: 1500, expiryMonth: ym(10) });
    const r = (await applyMilesAction(sb, u, { action: "setUobBalance", balance: 4500 })) as { delta: number };
    expect(Number(r.delta)).toBe(3000);
    let rows = await lots(u);
    expect(rows.map((x) => [x.expiry_month, Number(x.amount)])).toEqual([
      [monthToYmd(NOW + 10), 1500],
      [monthToYmd(quarterEnd(NOW) + 24), 3000],
    ]);
    await applyMilesAction(sb, u, { action: "setUobBalance", balance: 5200 });
    await applyMilesAction(sb, u, { action: "setUobBalance", balance: 5000 });
    rows = await lots(u);
    expect(left(rows)).toEqual([1300, 3700]);
  });
});

describe("conversions, redemptions and undo", () => {
  async function setup() {
    const u = await createUser(db);
    const sb = rpcClientAs(db, u);
    await applyMilesAction(sb, u, { action: "setExpiryBucket", expiryMonth: ym(1), amount: 2000 });
    await applyMilesAction(sb, u, { action: "setExpiryBucket", expiryMonth: ym(4), amount: 4700 });
    await applyMilesAction(sb, u, { action: "setExpiryBucket", expiryMonth: ym(10), amount: 4900 });
    await applyMilesAction(sb, u, { action: "addLot", program: "krisflyer", amount: 1300, earnedMonth: ym(-13) });
    return { u, sb };
  }

  it("converts whole blocks, oldest points first, into a 36-month KrisFlyer lot", async () => {
    const { u, sb } = await setup();
    await expect(
      applyMilesAction(sb, u, { action: "convert", program: "dbs_womans_world", month: ym(0), points: 7000 })
    ).rejects.toThrow("Convert in blocks of 5,000 points");
    await expect(
      applyMilesAction(sb, u, { action: "convert", program: "dbs_womans_world", month: ym(0), points: 15000 })
    ).rejects.toThrow("You only have 11,600 points available in that month");
    await expect(
      applyMilesAction(sb, u, { action: "convert", program: "dbs_womans_world", month: ym(1), points: 5000 })
    ).rejects.toThrow("Pick this month or an earlier one");

    await applyMilesAction(sb, u, { action: "convert", program: "dbs_womans_world", month: ym(0), points: 10000 });
    expect(left(await lots(u, "dbs_womans_world"))).toEqual([0, 0, 1600]);
    const kf = await lots(u, "krisflyer");
    expect(kf.map((r) => [Number(r.amount), r.source, r.expiry_month])).toEqual([
      [1300, "earned", monthToYmd(NOW - 13 + 36)],
      [20000, "conversion", monthToYmd(NOW + 36)],
    ]);
  });

  it("redeems oldest miles first; undo order is enforced and restores everything", async () => {
    const { u, sb } = await setup();
    const conv = (await applyMilesAction(sb, u, {
      action: "convert", program: "dbs_womans_world", month: ym(0), points: 10000,
    })) as { activity: { id: string } };
    const red = (await applyMilesAction(sb, u, {
      action: "redeem", month: ym(0), miles: 5000, description: "SIN to Tokyo",
    })) as { activity: { id: string } };
    expect(left(await lots(u, "krisflyer"))).toEqual([0, 16300]);
    await expect(applyMilesAction(sb, u, { action: "redeem", month: ym(0), miles: 20000 })).rejects.toThrow(
      "You only have 16,300 KrisFlyer miles available in that month"
    );

    await expect(applyMilesAction(sb, u, { action: "undo", activityId: conv.activity.id })).rejects.toThrow(
      "Some of these miles went into a redemption. Undo that redemption first."
    );
    await applyMilesAction(sb, u, { action: "undo", activityId: red.activity.id });
    await applyMilesAction(sb, u, { action: "undo", activityId: conv.activity.id });
    expect(left(await lots(u))).toEqual([2000, 4700, 4900, 1300]);
    expect(await count(db, "select count(*) n from miles_activity where user_id = $1", [u])).toBe(0);
  });

  it("protects drawn-on and converted lots from deletion", async () => {
    const { u, sb } = await setup();
    await applyMilesAction(sb, u, { action: "convert", program: "dbs_womans_world", month: ym(0), points: 5000 });
    const [first] = await lots(u, "dbs_womans_world");
    const conversionLot = (await lots(u, "krisflyer")).find((r) => r.source === "conversion")!;
    await expect(applyMilesAction(sb, u, { action: "deleteLot", lotId: first.id })).rejects.toThrow(
      "Some of these points were already converted or redeemed. Undo that first."
    );
    await expect(applyMilesAction(sb, u, { action: "deleteLot", lotId: conversionLot.id })).rejects.toThrow(
      "These miles came from a conversion. Undo the conversion instead."
    );
  });

  it("updating a bucket after a conversion stops undo from adding points back to it", async () => {
    const { u, sb } = await setup();
    const conv = (await applyMilesAction(sb, u, {
      action: "convert", program: "dbs_womans_world", month: ym(0), points: 5000,
    })) as { activity: { id: string } };
    // The DBS app now shows the reduced figure for the second month: 4700 - 3000.
    await applyMilesAction(sb, u, { action: "setExpiryBucket", expiryMonth: ym(4), amount: 1700 });
    await applyMilesAction(sb, u, { action: "undo", activityId: conv.activity.id });
    expect(left(await lots(u, "dbs_womans_world"))).toEqual([2000, 1700, 4900]);
  });

  it("same idempotency key converts once; other users can't see or act", async () => {
    const { u, sb } = await setup();
    const input = { action: "convert", program: "dbs_womans_world", month: ym(0), points: 5000, clientRequestId: "miles-req-0001" };
    const a = (await applyMilesAction(sb, u, input)) as { replayed: boolean };
    const b = (await applyMilesAction(sb, u, input)) as { replayed: boolean };
    expect([a.replayed, b.replayed]).toEqual([false, true]);
    expect(await count(db, "select count(*) n from miles_activity where user_id = $1", [u])).toBe(1);

    const [act] = await db.query<{ id: string }>("select id from miles_activity where user_id = $1", [u]);
    const mallory = await createUser(db);
    await expect(applyMilesAction(rpcClientAs(db, mallory), mallory, { action: "undo", activityId: act.id })).rejects.toThrow(
      "Activity not found"
    );
    await expect(applyMilesAction(rpcClientAs(db, mallory), u, { action: "undo", activityId: act.id })).rejects.toThrow(
      "Forbidden"
    );
  });

  it("rejects malformed input before reaching the database", async () => {
    const u = await createUser(db);
    const sb = rpcClientAs(db, u);
    await expect(applyMilesAction(sb, u, { action: "nope" })).rejects.toThrow("Invalid action");
    await expect(applyMilesAction(sb, u, { action: "redeem", month: "soon", miles: 1 })).rejects.toThrow("Pick a month");
    await expect(applyMilesAction(sb, u, { action: "convert", program: "krisflyer", month: ym(0), points: 5000 })).rejects.toThrow(
      "Only card points can be converted"
    );
  });
});

describe.skipIf(!hasRealPostgres)("miles concurrency (real Postgres)", () => {
  it("parallel conversions can't spend the same points twice", async () => {
    const u = await createUser(db);
    await applyMilesAction(rpcClientAs(db, u), u, { action: "setExpiryBucket", expiryMonth: ym(2), amount: 12000 });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        applyMilesAction(rpcClientAs(db, u), u, { action: "convert", program: "dbs_womans_world", month: ym(0), points: 5000 })
      )
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(left(await lots(u, "dbs_womans_world"))).toEqual([2000]);
  });
});
