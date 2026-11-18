/**
 * Throwaway database for SQL tests: the Supabase shim + every migration in
 * supabase/migrations, applied in order.
 *
 * - Default: in-process PGlite (real Postgres compiled to WASM). No setup;
 *   runs in `npx vitest run` and in CI. One connection, so statements never
 *   overlap — fine for correctness, NOT for concurrency.
 * - TEST_DATABASE_URL=postgres://user@host:port/postgres: creates a fresh
 *   database on that server, runs migrations, drops it afterwards. Real
 *   connections, so the concurrency tests run too (CI does this).
 *
 * Never point TEST_DATABASE_URL at a real Supabase project.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_DIR = path.resolve(__dirname, "..");
export const MIGRATIONS_DIR = path.join(SUPABASE_DIR, "migrations");

export type DbError = Error & { code?: string };
export type Row = Record<string, unknown>;

export interface TestDb {
  readonly kind: "pglite" | "postgres";
  /** Runs a multi-statement script (no parameters) as the database owner. */
  exec(sql: string): Promise<void>;
  /** Runs as the database owner (bypasses RLS). */
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs inside one transaction as role `authenticated` with auth.uid() = userId. */
  asUser<T extends Row = Row>(userId: string, sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
}

function shimSql(): string {
  return readFileSync(path.join(__dirname, "supabase-shim.sql"), "utf8");
}

function toDbError(e: unknown): DbError {
  const err = e as { message?: string; code?: string };
  const out = new Error(err?.message ?? String(e)) as DbError;
  out.code = err?.code;
  return out;
}

async function createPglite(): Promise<TestDb> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(shimSql());
  for (const f of migrationFiles()) {
    try {
      await db.exec(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    } catch (e) {
      throw new Error(`migration ${f} failed: ${(e as Error).message}`);
    }
  }
  return {
    kind: "pglite",
    async exec(sql: string) {
      try {
        await db.exec(sql);
      } catch (e) {
        throw toDbError(e);
      }
    },
    async query<T extends Row>(sql: string, params: unknown[] = []) {
      try {
        return (await db.query<T>(sql, params)).rows;
      } catch (e) {
        throw toDbError(e);
      }
    },
    async asUser<T extends Row>(userId: string, sql: string, params: unknown[] = []) {
      try {
        return await db.transaction(async (tx) => {
          await tx.query("set local role authenticated");
          await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
          return (await tx.query<T>(sql, params)).rows;
        });
      } catch (e) {
        throw toDbError(e);
      }
    },
    async close() {
      await db.close();
    },
  };
}

async function createPostgres(url: string): Promise<TestDb> {
  const pg = await import("pg");
  const name = `ledger_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = new pg.default.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const dbUrl = new URL(url);
  dbUrl.pathname = `/${name}`;
  const pool = new pg.default.Pool({ connectionString: dbUrl.toString(), max: 20 });
  const setup = await pool.connect();
  try {
    await setup.query(shimSql());
    for (const f of migrationFiles()) {
      try {
        await setup.query(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
      } catch (e) {
        throw new Error(`migration ${f} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    setup.release();
  }

  return {
    kind: "postgres",
    async exec(sql: string) {
      try {
        await pool.query(sql);
      } catch (e) {
        throw toDbError(e);
      }
    },
    async query<T extends Row>(sql: string, params: unknown[] = []) {
      try {
        return (await pool.query(sql, params)).rows as T[];
      } catch (e) {
        throw toDbError(e);
      }
    },
    async asUser<T extends Row>(userId: string, sql: string, params: unknown[] = []) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("set local role authenticated");
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
        const res = await client.query(sql, params);
        await client.query("commit");
        return res.rows as T[];
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw toDbError(e);
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
      const admin2 = new pg.default.Client({ connectionString: url });
      await admin2.connect();
      await admin2.query(`drop database if exists ${name} with (force)`);
      await admin2.end();
    },
  };
}

export async function createTestDb(): Promise<TestDb> {
  const url = process.env.TEST_DATABASE_URL;
  return url ? createPostgres(url) : createPglite();
}

export const hasRealPostgres = Boolean(process.env.TEST_DATABASE_URL);

let userSeq = 0;
/** Creates an auth user and returns its id. */
export async function createUser(db: TestDb): Promise<string> {
  userSeq += 1;
  const rows = await db.query<{ id: string }>(
    "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
    [`user${userSeq}-${Math.random().toString(36).slice(2, 8)}@test.local`]
  );
  return rows[0]!.id;
}

/**
 * Minimal stand-in for a Supabase client whose `.rpc()` runs the real SQL
 * function as `userId` (RLS applies), the way PostgREST would. Only `.rpc`
 * is implemented — wrappers under test must not need anything else.
 */
export function rpcClientAs(db: TestDb, userId: string): SupabaseClient {
  return {
    async rpc(fn: string, args: Record<string, unknown> = {}) {
      const keys = Object.keys(args);
      const named = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
      const params = keys.map((k) => {
        const v = args[k];
        if (v !== null && typeof v === "object") return JSON.stringify(v);
        return v === undefined ? null : v;
      });
      try {
        const rows = await db.asUser<{ result: unknown }>(
          userId,
          `select public.${fn}(${named}) as result`,
          params
        );
        return { data: rows[0]?.result ?? null, error: null };
      } catch (e) {
        const err = e as DbError;
        return { data: null, error: { message: err.message, code: err.code } };
      }
    },
    from() {
      throw new Error("rpcClientAs: .from() is not supported in SQL-backed tests");
    },
  } as unknown as SupabaseClient;
}
