import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * OPS-002: every API route handler must be wrapped in withRequestId(), which is what puts the
 * request ID into the error JSON, the response header and the log lines. A new route that
 * forgets it still works but its errors cannot be matched to the logs, so fail the build instead.
 */
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) routeFiles(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}

describe("API route handlers (OPS-002)", () => {
  const files = routeFiles(__dirname);

  it("finds the routes", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files.map((f) => [path.relative(__dirname, f), f]))("%s wraps every handler in withRequestId", (_name, file) => {
    const src = fs.readFileSync(file as string, "utf8");
    for (const m of METHODS) {
      const bareExport = new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`);
      expect(bareExport.test(src), `${m} is exported without withRequestId()`).toBe(false);
      // \S pins the match to the first non-space character after "=", so it cannot backtrack into the spaces.
      const constExport = new RegExp(`export\\s+const\\s+${m}\\s*=\\s*(?!withRequestId\\()\\S`);
      expect(constExport.test(src), `${m} is exported without withRequestId()`).toBe(false);
    }
  });
});
