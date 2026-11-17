import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * SEC-006: secrets and personal/financial data must not be written to logs.
 * Scans every console.info/warn/log call that logs an object and fails if it carries one of
 * the banned keys (amounts, emails, link codes, Telegram identifiers, balances …).
 */
const ROOT = path.resolve(__dirname, "../..");
const DIRS = ["app", "lib", "components", "hooks", "contexts"];
const BANNED = [
  "amount", "amt", "amountTotal", "profit", "loss", "balanceAfter", "newOutstanding",
  "nextOutstanding", "outstanding", "delta", "email", "inviteeEmail", "code", "oa", "sa", "ma",
  "chatId", "telegramChatId", "telegramUserId", "username", "note", "cashAvailable",
  "statementDue", "pay", "perShare", "qty", "btPayment", "payToNonBt", "newPaid", "gross",
  "reimburseAmount", "restoreAmount", "deposited",
];
const KEY_RE = new RegExp(`(?:[{,]\\s*)(${BANNED.join("|")})\\s*(?::|,|\\})`);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p) && !p.includes(".test.")) out.push(p);
  }
  return out;
}

function callArgs(src: string, start: number): string {
  let depth = 1;
  let i = start;
  let quote: string | null = null;
  for (; i < src.length && depth > 0; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
  }
  return src.slice(start, i - 1);
}

describe("log hygiene (SEC-006)", () => {
  it("no console.info/warn/log call logs amounts, emails, codes or chat identifiers", () => {
    const offenders: string[] = [];
    for (const dir of DIRS) {
      for (const file of walk(path.join(ROOT, dir))) {
        const src = readFileSync(file, "utf8");
        for (const m of src.matchAll(/console\.(?:info|warn|log)\(/g)) {
          const args = callArgs(src, m.index! + m[0].length);
          // Skip the leading message literal; only inspect what is logged after it.
          const rest = args.replace(/^\s*(["'`])(?:\\.|(?!\1)[\s\S])*\1/, "");
          const hit = rest.match(KEY_RE);
          if (hit) {
            const line = src.slice(0, m.index).split("\n").length;
            offenders.push(`${path.relative(ROOT, file)}:${line} logs "${hit[1]}"`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
