import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { isPublicMessage } from "@/lib/api/public-messages";

/**
 * Drift guard: every deliberate, human-written message in the source (thrown or returned as
 * `error: "…"`) must be on the allow-list, otherwise users would silently see the generic
 * text. Config/internal messages are intentionally not listed (they stay masked).
 */
const ROOT = path.resolve(__dirname, "../..");
const INTERNAL =
  /SUPABASE_|AUTH_BYPASS_DEV|CRON_SECRET|TELEGRAM_BOT_TOKEN|Supabase URL|Invalid JSON from|fetchAllRows|non-finite|invalid_json|\.message/;
const PATTERNS = [
  /throw new Error\(\s*(["`'])((?:\\.|(?!\1)[\s\S])*)\1\s*[,)]/g,
  /new SaveError\(\s*(["`'])((?:\\.|(?!\1)[\s\S])*)\1\s*,/g,
  /\berror:\s*(["`'])((?:\\.|(?!\1)[\s\S])*)\1/g,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") && !p.includes(".test.")) out.push(p);
  }
  return out;
}

/** Sample text for a literal: template placeholders become a plausible value. */
function sample(lit: string): string {
  return lit.replace(/\$\{[^}]*\}/g, "42");
}

describe("public error message allow-list (SEC-006)", () => {
  it("covers every deliberate message in lib/ and app/api/", () => {
    const files = [...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "app/api"))];
    const missing = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const re of PATTERNS) {
        for (const m of src.matchAll(re)) {
          const lit = m[2];
          if (INTERNAL.test(lit)) continue;
          if (!isPublicMessage(sample(lit))) missing.add(`${path.relative(ROOT, f)}: ${lit}`);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("does not allow database-style messages", () => {
    for (const m of [
      'duplicate key value violates unique constraint "x"',
      'new row violates row-level security policy for table "y"',
      "permission denied for table z",
    ]) {
      expect(isPublicMessage(m)).toBe(false);
    }
  });
});
