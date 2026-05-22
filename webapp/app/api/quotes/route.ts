import { NextRequest, NextResponse } from "next/server";

export type QuoteResult = {
  price: number;
  updatedAt: string;
};

const CONCURRENCY = 4;
const YAHOO_UA = "Mozilla/5.0 (compatible; SGFinancePlanner/1.0)";

async function fetchYahooQuote(symbol: string): Promise<QuoteResult | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      console.warn("[api/quotes] Yahoo error", symbol, res.status);
      return null;
    }
    const data = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number; regularMarketTime?: number };
        }>;
      };
    };
    const meta = data.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== "number" || price <= 0) {
      console.warn("[api/quotes] Yahoo no price", symbol);
      return null;
    }
    const updatedAt = meta?.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString();
    return { price, updatedAt };
  } catch (e) {
    console.warn("[api/quotes] Yahoo fetch failed", symbol, e);
    return null;
  }
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

export async function POST(req: NextRequest) {
  let body: { symbols?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const symbols = (body.symbols ?? [])
    .map((s) => String(s).trim().toUpperCase())
    .filter((s) => s && s !== "—");

  if (symbols.length === 0) {
    return NextResponse.json({ quotes: {}, source: "yahoo" });
  }

  const pairs = await mapPool(symbols, CONCURRENCY, async (symbol) => {
    const quote = await fetchYahooQuote(symbol);
    return { symbol, quote };
  });

  const quotes: Record<string, QuoteResult> = {};
  for (const { symbol, quote } of pairs) {
    if (quote) quotes[symbol] = quote;
  }

  console.info("[api/quotes] Yahoo fetched", {
    requested: symbols.length,
    ok: Object.keys(quotes).length,
  });

  return NextResponse.json({ quotes, source: "yahoo" });
}
