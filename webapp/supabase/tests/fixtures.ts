import type { TestDb } from "./test-db";

/** Insert helpers (owner context, bypass RLS) for ledger tests. */
export async function one<T>(db: TestDb, sql: string, params: unknown[] = []): Promise<T> {
  const rows = await db.query(sql, params);
  return rows[0] as T;
}

export async function newAccount(db: TestDb, userId: string, balance: number): Promise<string> {
  return (
    await one<{ id: string }>(
      db,
      "insert into user_savings_accounts (user_id, name, balance) values ($1, 'Cash', $2) returning id",
      [userId, balance]
    )
  ).id;
}

export async function newHousehold(db: TestDb, members: string[]): Promise<string> {
  const { id } = await one<{ id: string }>(db, "insert into households default values returning id");
  for (const m of members) {
    await db.query("insert into household_members (household_id, user_id) values ($1, $2)", [id, m]);
  }
  return id;
}

export async function newPool(db: TestDb, householdId: string, balance: number): Promise<string> {
  return (
    await one<{ id: string }>(
      db,
      "insert into savings_pools (household_id, name, balance) values ($1, 'Joint', $2) returning id",
      [householdId, balance]
    )
  ).id;
}

export async function newGoal(
  db: TestDb,
  opts: { ownerUserId?: string; householdId?: string; saved?: number; name?: string }
): Promise<string> {
  const scope = opts.ownerUserId ? "individual" : "shared";
  return (
    await one<{ id: string }>(
      db,
      `insert into savings_goals (scope, owner_user_id, household_id, name, saved_amount)
       values ($1, $2, $3, $4, $5) returning id`,
      [scope, opts.ownerUserId ?? null, opts.householdId ?? null, opts.name ?? "Goal", opts.saved ?? 0]
    )
  ).id;
}

export async function newExpense(db: TestDb, userId: string, amount: number): Promise<string> {
  return (
    await one<{ id: string }>(
      db,
      "insert into expenses (user_id, amount, category, spent_at) values ($1, $2, 'Food', '2026-11-01') returning id",
      [userId, amount]
    )
  ).id;
}

export async function balanceOf(db: TestDb, table: string, id: string, column = "balance"): Promise<number> {
  const row = await one<Record<string, unknown>>(db, `select ${column} as v from ${table} where id = $1`, [id]);
  return Number(row.v);
}

export async function count(db: TestDb, sql: string, params: unknown[] = []): Promise<number> {
  const row = await one<{ n: string | number }>(db, sql, params);
  return Number(row.n);
}

export async function newFund(db: TestDb, userId: string, balance: number): Promise<string> {
  return (
    await one<{ id: string }>(
      db,
      "insert into investment_funds (user_id, name, balance) values ($1, 'Fund', $2) returning id",
      [userId, balance]
    )
  ).id;
}
