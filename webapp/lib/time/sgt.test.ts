import { describe, expect, it } from "vitest";
import { sgtNowInputDateTime, sgtTodayYmd, sgtYmdDaysAgo } from "@/lib/time/sgt";

describe("SGT time helpers", () => {
  it("formats SGT date and datetime-local values", () => {
    const utc = new Date("2026-05-28T16:30:00.000Z"); // 2026-05-29 00:30 in SGT
    expect(sgtTodayYmd(utc)).toBe("2026-05-29");
    expect(sgtNowInputDateTime(utc)).toBe("2026-05-29T00:30");
  });

  it("computes SGT days-ago date", () => {
    const utc = new Date("2026-05-28T16:30:00.000Z"); // 2026-05-29 in SGT
    expect(sgtYmdDaysAgo(29, utc)).toBe("2026-04-30");
  });
});

