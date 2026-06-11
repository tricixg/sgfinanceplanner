import { BASE_REPORTING_CURRENCY, normalizeCurrencyCode } from "./currencies";

export type FxRateResult = {
  from: string;
  to: string;
  rate: number;
  rateDate: string;
  source: "frankfurter" | "yahoo";
};

const YAHOO_UA = "Mozilla/5.0 (compatible; SGFinancePlanner/1.0)";

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Parse Frankfurter v2 `/rate/{base}/{quote}/{date}` JSON (flat `rate` field). */
export function parseFrankfurterV2Rate(
  data: unknown,
  from: string,
  to: string,
  date: string
): FxRateResult | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  const flatRate = Number(obj.rate);
  if (Number.isFinite(flatRate) && flatRate > 0) {
    return {
      from: String(obj.base ?? from),
      to: String(obj.quote ?? to),
      rate: flatRate,
      rateDate: String(obj.date ?? date),
      source: "frankfurter",
    };
  }

  const rates = obj.rates;
  if (Array.isArray(rates) && rates.length > 0) {
    const row = rates[0] as Record<string, unknown>;
    const rate = Number(row.rate);
    if (Number.isFinite(rate) && rate > 0) {
      return {
        from,
        to,
        rate,
        rateDate: String(row.date ?? obj.date ?? date),
        source: "frankfurter",
      };
    }
  }

  return null;
}

async function fetchFrankfurterV2(
  from: string,
  to: string,
  date: string
): Promise<FxRateResult | null> {
  const url = `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(from)}/${encodeURIComponent(to)}/${date}`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) {
      console.warn("[fx/frankfurter] v2 failed", { from, to, date, status: res.status });
      return null;
    }
    const data = await res.json();
    const parsed = parseFrankfurterV2Rate(data, from, to, date);
    if (!parsed) {
      console.warn("[fx/frankfurter] v2 unparseable response", { from, to, date, data });
    }
    return parsed;
  } catch (e) {
    console.warn("[fx/frankfurter] v2 fetch error", { from, to, date, e });
    return null;
  }
}

async function fetchFrankfurterV1(
  from: string,
  to: string,
  date: string
): Promise<FxRateResult | null> {
  const url = `https://api.frankfurter.app/v1/${date}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      date?: string;
      rates?: Record<string, number>;
    };
    const rate = Number(data.rates?.[to]);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return {
      from,
      to,
      rate,
      rateDate: String(data.date ?? date),
      source: "frankfurter",
    };
  } catch (e) {
    console.warn("[fx/frankfurter] v1 fetch error", { from, to, date, e });
    return null;
  }
}

async function fetchYahooToSgd(from: string): Promise<FxRateResult | null> {
  const symbol = `${from}${BASE_REPORTING_CURRENCY}=X`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      console.warn("[fx/frankfurter] yahoo failed", { from, symbol, status: res.status });
      return null;
    }
    const data = (await res.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
    const rate = Number(data.chart?.result?.[0]?.meta?.regularMarketPrice);
    if (!Number.isFinite(rate) || rate <= 0) {
      console.warn("[fx/frankfurter] yahoo no price", { from, symbol });
      return null;
    }
    const today = new Date().toISOString().slice(0, 10);
    return {
      from,
      to: BASE_REPORTING_CURRENCY,
      rate,
      rateDate: today,
      source: "yahoo",
    };
  } catch (e) {
    console.warn("[fx/frankfurter] yahoo fallback failed", { from, e });
    return null;
  }
}

/** How many SGD per 1 unit of `from` on `date` (YYYY-MM-DD). */
export async function fetchFxRateToSgd(
  fromCurrency: string,
  date: string
): Promise<FxRateResult | null> {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = BASE_REPORTING_CURRENCY;
  if (from === to) {
    return { from, to, rate: 1, rateDate: date, source: "frankfurter" };
  }
  if (!isYmd(date)) {
    console.warn("[fx/frankfurter] invalid date", date);
    return null;
  }

  const v2 = await fetchFrankfurterV2(from, to, date);
  if (v2) {
    console.info("[fx/frankfurter] rate resolved", {
      from,
      date: v2.rateDate,
      rate: v2.rate,
    });
    return v2;
  }

  const v1 = await fetchFrankfurterV1(from, to, date);
  if (v1) {
    console.info("[fx/frankfurter] v1 rate resolved", {
      from,
      date: v1.rateDate,
      rate: v1.rate,
    });
    return v1;
  }

  const yahoo = await fetchYahooToSgd(from);
  if (yahoo) {
    console.info("[fx/frankfurter] yahoo fallback used", {
      from,
      rate: yahoo.rate,
      rateDate: yahoo.rateDate,
    });
    return yahoo;
  }

  return null;
}
