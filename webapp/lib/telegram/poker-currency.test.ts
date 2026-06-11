import { describe, expect, it, vi } from "vitest";
import { BASE_REPORTING_CURRENCY } from "@/lib/fx/currencies";
import { resolveSessionFx } from "@/lib/poker/resolve-fx";
import { parsePokerSessionBody } from "@/lib/poker/session-input";
import { buildPokerBodyFromPayload } from "@/lib/telegram/account-step";

vi.mock("@/lib/fx/frankfurter", () => ({
  fetchFxRateToSgd: vi.fn(async () => {
    throw new Error("fetchFxRateToSgd should not run for Telegram SGD sessions");
  }),
}));

describe("Telegram poker currency", () => {
  it("buildPokerBodyFromPayload sets SGD for cash game", () => {
    const body = buildPokerBodyFromPayload({
      pokerSessionType: "cash_game",
      gameId: "g-1",
      buyIn: 200,
      cashOut: 350,
      playedAt: "2026-05-20T18:00:00+08:00",
      location: "Home",
    });
    expect(body).toMatchObject({
      sessionType: "cash_game",
      currency: BASE_REPORTING_CURRENCY,
      fxRateToSgd: 1,
      fxRateManual: false,
    });
  });

  it("buildPokerBodyFromPayload sets SGD for tournament", () => {
    const body = buildPokerBodyFromPayload({
      pokerSessionType: "tournament",
      tournamentName: "APT",
      eventName: "Main",
      tournamentResult: "placed",
      buyIn: 500,
      amountWon: 1200,
      playedAt: "2026-05-20T18:00:00+08:00",
    });
    expect(body).toMatchObject({
      sessionType: "tournament",
      currency: BASE_REPORTING_CURRENCY,
      fxRateToSgd: 1,
      fxRateManual: false,
    });
  });

  it("telegram body parses and resolves FX without external fetch", async () => {
    const body = buildPokerBodyFromPayload({
      pokerSessionType: "cash_game",
      gameId: "g-1",
      buyIn: 100,
      cashOut: 180,
      playedAt: "2026-05-20T18:00:00+08:00",
    });
    expect(body).not.toBeNull();

    const parsed = parsePokerSessionBody(body!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.data.currency).toBe(BASE_REPORTING_CURRENCY);
    expect(parsed.data.fxRateToSgd).toBe(1);
    expect(parsed.data.fxRateManual).toBe(false);

    const fx = await resolveSessionFx(body!, parsed.data.playedAt);
    expect(fx.ok).toBe(true);
    if (fx.ok) {
      expect(fx.fx).toEqual({
        currency: BASE_REPORTING_CURRENCY,
        fxRateToSgd: 1,
        fxRateManual: false,
      });
    }
  });
});
