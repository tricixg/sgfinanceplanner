import { BASE_REPORTING_CURRENCY, isSupportedCurrency, normalizeCurrencyCode } from "@/lib/fx/currencies";
import { fetchFxRateToSgd } from "@/lib/fx/frankfurter";
import { pokerPlayedAtYmd } from "@/lib/poker/played-at";
import type { PokerSessionBody } from "@/lib/poker/session-input";

export type ResolvedSessionFx = {
  currency: string;
  fxRateToSgd: number;
  fxRateManual: boolean;
};

export async function resolveSessionFx(
  body: PokerSessionBody,
  playedAt: string
): Promise<{ ok: true; fx: ResolvedSessionFx } | { ok: false; error: string }> {
  const currency = normalizeCurrencyCode(body.currency);
  if (!isSupportedCurrency(currency)) {
    return { ok: false, error: `Unsupported currency: ${currency}` };
  }

  if (body.fxRateManual === true) {
    const rate = typeof body.fxRateToSgd === "number" ? body.fxRateToSgd : NaN;
    if (!Number.isFinite(rate) || rate <= 0) {
      return { ok: false, error: "Valid FX rate required when using manual override" };
    }
    return {
      ok: true,
      fx: {
        currency,
        fxRateToSgd: Math.round(rate * 1_000_000) / 1_000_000,
        fxRateManual: true,
      },
    };
  }

  if (currency === BASE_REPORTING_CURRENCY) {
    return {
      ok: true,
      fx: { currency, fxRateToSgd: 1, fxRateManual: false },
    };
  }

  const date = pokerPlayedAtYmd(playedAt);
  const fetched = await fetchFxRateToSgd(currency, date);
  if (!fetched) {
    return {
      ok: false,
      error: `Could not fetch FX rate for ${currency} on ${date}. Try manual rate.`,
    };
  }

  return {
    ok: true,
    fx: {
      currency,
      fxRateToSgd: fetched.rate,
      fxRateManual: false,
    },
  };
}
