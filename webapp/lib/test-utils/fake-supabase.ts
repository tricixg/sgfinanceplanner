import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Filter = { col: string; op: "eq" | "in" | "neq" | "or"; val: unknown };

export type FakeOp = {
  table: string;
  kind: "select" | "insert" | "update" | "delete" | "upsert";
  filters: Filter[];
  payload?: unknown;
};

/**
 * Tiny in-memory stand-in for the PostgREST client used in write-path tests.
 * Supports from().select/insert/update/delete with eq/in/neq filters and
 * records every operation so tests can assert what was (not) deleted.
 * Optional `failOn` makes matching operations return an error.
 */
export function createFakeSupabase(
  seed: Record<string, Row[]> = {},
  opts: {
    failOn?: (op: FakeOp) => string | null;
    /** Handlers for supabase.rpc(name, args). Unknown names return a "function not found" error. */
    rpc?: Record<
      string,
      (args: unknown) => { data?: unknown; error?: { message: string; code?: string } | null }
    >;
  } = {}
) {
  const rpcCalls: { name: string; args: unknown }[] = [];
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  const ops: FakeOp[] = [];
  let seq = 0;

  const rowsOf = (t: string) => (tables[t] ??= []);
  const matches = (row: Row, filters: Filter[]): boolean =>
    filters.every((f) => {
      if (f.op === "eq") return row[f.col] === f.val;
      if (f.op === "neq") return row[f.col] !== f.val;
      if (f.op === "or") return (f.val as Filter[]).some((g) => matches(row, [g]));
      return (f.val as unknown[]).includes(row[f.col]);
    });

  function builder(table: string) {
    const filters: Filter[] = [];
    let kind: FakeOp["kind"] = "select";
    let payload: unknown;
    let wantRows = false;
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let single = false;
    let rangeFrom: number | null = null;
    let rangeTo = 0;

    const exec = (): { data: unknown; error: { message: string } | null } => {
      const r = run();
      if (single && !r.error) {
        const rows = (r.data as Row[] | null) ?? [];
        return { data: rows[0] ?? null, error: null };
      }
      return r;
    };

    const run = (): { data: unknown; error: { message: string } | null } => {
      const op: FakeOp = { table, kind, filters: [...filters], payload };
      ops.push(op);
      const failMsg = opts.failOn?.(op) ?? null;
      if (failMsg) return { data: null, error: { message: failMsg } };
      const rows = rowsOf(table);
      if (kind === "upsert") {
        // INSERT ... ON CONFLICT (cols) DO NOTHING (ignoreDuplicates) / DO UPDATE.
        const cols = (upsertOpts.onConflict ?? "id").split(",").map((c) => c.trim());
        const out: Row[] = [];
        for (const p of Array.isArray(payload) ? payload : [payload]) {
          const hit = rows.find((r) => cols.every((c) => r[c] === (p as Row)[c]));
          if (hit) {
            if (!upsertOpts.ignoreDuplicates) {
              Object.assign(hit, p as Row);
              out.push(hit);
            }
            continue;
          }
          const row = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, ...(p as Row) };
          rows.push(row);
          out.push(row);
        }
        return { data: wantRows ? out : null, error: null };
      }
      if (kind === "insert") {
        const inserted = (Array.isArray(payload) ? payload : [payload]).map((p) => ({
          id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
          ...(p as Row),
        }));
        rows.push(...inserted);
        return { data: wantRows ? inserted : null, error: null };
      }
      const hit = rows.filter((r) => matches(r, filters));
      if (kind === "update") {
        hit.forEach((r) => Object.assign(r, payload as Row));
        return { data: wantRows ? hit : null, error: null };
      }
      if (kind === "delete") {
        tables[table] = rows.filter((r) => !hit.includes(r));
        return { data: wantRows ? hit : null, error: null };
      }
      const page = rangeFrom === null ? hit : hit.slice(rangeFrom, rangeTo + 1);
      return { data: page, error: null };
    };

    const api: Record<string, unknown> = {
      select: () => {
        wantRows = true;
        return api;
      },
      insert: (p: unknown) => {
        kind = "insert";
        payload = p;
        return api;
      },
      upsert: (p: unknown, o?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        kind = "upsert";
        payload = p;
        upsertOpts = o ?? {};
        return api;
      },
      update: (p: unknown) => {
        kind = "update";
        payload = p;
        return api;
      },
      delete: () => {
        kind = "delete";
        return api;
      },
      single: () => ((single = true), (wantRows = true), api),
      maybeSingle: () => ((single = true), (wantRows = true), api),
      order: () => api,
      range: (a: number, b: number) => ((rangeFrom = a), (rangeTo = b), api),
      or: (expr: string) => {
        const parts = expr.split(",").map((p) => {
          const [col, op, ...rest] = p.split(".");
          return { col, op: op as "eq", val: rest.join(".") } as Filter;
        });
        filters.push({ col: "", op: "or", val: parts });
        return api;
      },
      limit: () => api,
      // Not evaluated by the fake — enough for read paths whose result a test seeds directly.
      ilike: () => api,
      lte: () => api,
      gte: () => api,
      not: () => api,
      eq: (col: string, val: unknown) => (filters.push({ col, op: "eq", val }), api),
      neq: (col: string, val: unknown) => (filters.push({ col, op: "neq", val }), api),
      in: (col: string, val: unknown[]) => (filters.push({ col, op: "in", val }), api),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(exec()).then(res, rej),
    };
    return api;
  }

  const client = {
    from: (t: string) => builder(t),
    rpc: async (name: string, args?: unknown) => {
      rpcCalls.push({ name, args });
      const h = opts.rpc?.[name];
      if (!h) {
        return {
          data: null,
          error: { message: `Could not find the function public.${name}`, code: "PGRST202" },
        };
      }
      const r = h(args);
      return { data: r.data ?? null, error: r.error ?? null };
    },
  } as unknown as SupabaseClient;
  return {
    client,
    ops,
    rpcCalls,
    table: (t: string) => rowsOf(t),
    deletes: (t?: string) =>
      ops.filter((o) => o.kind === "delete" && (!t || o.table === t)),
  };
}
