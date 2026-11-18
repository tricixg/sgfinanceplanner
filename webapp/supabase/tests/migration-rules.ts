/**
 * Naming/ordering rules for supabase/migrations, checked by migrations.test.ts
 * (part of `npm test`, so it runs in CI).
 */

/** Migrations before this number predate the "must be re-runnable" rule. */
export const IDEMPOTENT_FROM = 69;

export function checkMigrationNames(files: string[]): string[] {
  const problems: string[] = [];
  const sorted = [...files].sort();
  let expected = 1;
  const seen = new Map<number, string>();
  for (const f of sorted) {
    const m = /^(\d{3})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/.exec(f);
    if (!m) {
      problems.push(`${f}: name must be NNN_snake_case.sql`);
      continue;
    }
    const n = Number(m[1]);
    const prev = seen.get(n);
    if (prev) {
      problems.push(`${f}: number ${m[1]} already used by ${prev}`);
      continue;
    }
    seen.set(n, f);
    if (n !== expected) {
      problems.push(`${f}: expected number ${String(expected).padStart(3, "0")} (no gaps)`);
    }
    expected = n + 1;
  }
  return problems;
}
