/**
 * Read-only in-memory stand-in for the Supabase query builder, for loader /
 * aggregation tests (the write-path fake lives in fake-supabase.ts).
 *
 * Supports the filters the app's aggregations use and — importantly — mimics
 * PostgREST's silent 1,000-row cap on every response, so a loader that forgets
 * to page returns a truncated result here exactly like it would in production.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
type Result = { data: Row[]; error: null };

export const FAKE_MAX_ROWS = 1000;

class FakeReadQuery implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;

  constructor(
    private readonly rows: Row[],
    private readonly entry: { table: string; ranges: [number, number][]; ordered: boolean }
  ) {}

  select(): this {
    return this;
  }
  eq(col: string, v: unknown): this {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  neq(col: string, v: unknown): this {
    this.filters.push((r) => r[col] !== v);
    return this;
  }
  in(col: string, vs: unknown[]): this {
    this.filters.push((r) => vs.includes(r[col]));
    return this;
  }
  is(col: string, v: null): this {
    this.filters.push((r) => (r[col] ?? null) === v);
    return this;
  }
  not(col: string, op: string, v: null): this {
    if (op === "is") this.filters.push((r) => (r[col] ?? null) !== v);
    return this;
  }
  gte(col: string, v: string | number): this {
    this.filters.push((r) => String(r[col]) >= String(v));
    return this;
  }
  lte(col: string, v: string | number): this {
    this.filters.push((r) => String(r[col]) <= String(v));
    return this;
  }
  lt(col: string, v: string | number): this {
    this.filters.push((r) => String(r[col]) < String(v));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col, asc: opts?.ascending ?? true });
    this.entry.ordered = true;
    return this;
  }
  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    this.entry.ranges.push([from, to]);
    return this;
  }

  private run(): Result {
    let out = this.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.orders.length) {
      out = [...out].sort((a, b) => {
        for (const { col, asc } of this.orders) {
          const x = String(a[col] ?? "");
          const y = String(b[col] ?? "");
          if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
        }
        return 0;
      });
    }
    const from = this.rangeFrom ?? 0;
    const to = this.rangeTo ?? Number.POSITIVE_INFINITY;
    // PostgREST caps every response at max_rows, with or without a range.
    const end = Math.min(to + 1, from + FAKE_MAX_ROWS);
    return { data: out.slice(from, end), error: null };
  }

  then<R1 = Result, R2 = never>(
    onfulfilled?: ((v: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((e: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export function createFakeReadSupabase(tables: Record<string, Row[]>) {
  const queries: { table: string; ranges: [number, number][]; ordered: boolean }[] = [];
  const client = {
    from(table: string) {
      const entry = { table, ranges: [] as [number, number][], ordered: false };
      queries.push(entry);
      return new FakeReadQuery(tables[table] ?? [], entry);
    },
  } as unknown as SupabaseClient;
  return { client, queries };
}
