import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

// The matcher is "/" followed by one capture group; Next anchors the whole thing.
const GROUP = config.matcher[0].slice(1);
const pattern = new RegExp(`^/${GROUP}$`);

function runsProxy(path: string): boolean {
  return pattern.test(path);
}

describe("proxy matcher (SEC-003)", () => {
  it("still skips static assets outside /api", () => {
    expect(runsProxy("/_next/static/chunk.js")).toBe(false);
    expect(runsProxy("/favicon.ico")).toBe(false);
    expect(runsProxy("/logo.png")).toBe(false);
    expect(runsProxy("/images/a/b.svg")).toBe(false);
  });

  it("runs on pages and API routes", () => {
    expect(runsProxy("/dashboard")).toBe(true);
    expect(runsProxy("/api/expenses")).toBe(true);
    expect(runsProxy("/api/expenses/abc")).toBe(true);
  });

  it.each(["png", "jpg", "jpeg", "gif", "webp", "svg"])(
    "runs on .%s-suffixed API paths",
    (ext) => {
      expect(runsProxy(`/api/expenses/abc.${ext}`)).toBe(true);
      expect(runsProxy(`/api/x/y/z.${ext}`)).toBe(true);
    }
  );
});
