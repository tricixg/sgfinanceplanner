import { describe, expect, it } from "vitest";
import { config } from "@/middleware";

// The matcher is "/" followed by one capture group; Next anchors the whole thing.
const GROUP = config.matcher[0].slice(1);
const pattern = new RegExp(`^/${GROUP}$`);

function runsMiddleware(path: string): boolean {
  return pattern.test(path);
}

describe("middleware matcher (SEC-003)", () => {
  it("still skips static assets outside /api", () => {
    expect(runsMiddleware("/_next/static/chunk.js")).toBe(false);
    expect(runsMiddleware("/favicon.ico")).toBe(false);
    expect(runsMiddleware("/logo.png")).toBe(false);
    expect(runsMiddleware("/images/a/b.svg")).toBe(false);
  });

  it("runs on pages and API routes", () => {
    expect(runsMiddleware("/dashboard")).toBe(true);
    expect(runsMiddleware("/api/expenses")).toBe(true);
    expect(runsMiddleware("/api/expenses/abc")).toBe(true);
  });

  it.each(["png", "jpg", "jpeg", "gif", "webp", "svg"])(
    "runs on .%s-suffixed API paths",
    (ext) => {
      expect(runsMiddleware(`/api/expenses/abc.${ext}`)).toBe(true);
      expect(runsMiddleware(`/api/x/y/z.${ext}`)).toBe(true);
    }
  );
});
