import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import { simulate5y, simulateCPF } from "./projection";

const PARAMS = { growth: 3.5, invAdd: 0, invRet: 6, useMargin: true };

describe("simulate5y", () => {
  it("starts from the given today, not a fixed calendar date", () => {
    const series = simulate5y(DEFAULTS, PARAMS, "2026-08-15");
    expect(series[0].label).toBe("Now");
    expect(series[series.length - 1].label).toBe("2031");
  });

  it("shifts the whole 5-year window when today is a different year", () => {
    const series = simulate5y(DEFAULTS, PARAMS, "2030-01-01");
    expect(series[series.length - 1].label).toBe("2035");
  });

  it("still produces a full window for a today far past the old hardcoded end date", () => {
    const series = simulate5y(DEFAULTS, PARAMS, "2033-06-01");
    expect(series.length).toBeGreaterThan(1);
    expect(series[series.length - 1].label).toBe("2038");
  });
});

describe("simulateCPF", () => {
  it("starts from the given today, not a fixed calendar date", () => {
    const series = simulateCPF(DEFAULTS, 3.5, "2026-08-15");
    expect(series[0].label).toBe("Now");
    expect(series[series.length - 1].label).toBe("2031");
  });

  it("shifts the whole 5-year window when today is a different year", () => {
    const series = simulateCPF(DEFAULTS, 3.5, "2030-01-01");
    expect(series[series.length - 1].label).toBe("2035");
  });
});
