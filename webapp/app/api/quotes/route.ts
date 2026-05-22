import { NextRequest, NextResponse } from "next/server";

export type QuoteResult = {
  price: number;
  updatedAt: string;
};

const CONCURRENCY = 4;

async function fetchQuote(
  symbol: string,
  apiKey: string
): Promise<QuoteResult | null> {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    console.warn("[api/quotes] Finnhub error", symbol, res.status);
    return null;
  }
  const data = (await res.json()) as { c?: number; t?: number };
  if (typeof data.c !== "number" || data.c <= 0) {
    console.warn("[api/quotes] no price for", symbol);
    return null;
  }
  const updatedAt = data.t
    ? new Date(data.t * 1000).toISOString()
    : new Date().toISOString();
  return { price: data.c, updatedAt };
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
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.info("[api/quotes] FINNHUB_API_KEY not set");
    return NextResponse.json(
      { error: "no_api_key", quotes: {}, source: null },
      { status: 503 }
    );
  }

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
    return NextResponse.json({ quotes: {}, source: "finnhub" });
  }

  const pairs = await mapPool(symbols, CONCURRENCY, async (symbol) => {
    const quote = await fetchQuote(symbol, apiKey);
    return { symbol, quote };
  });

  const quotes: Record<string, QuoteResult> = {};
  for (const { symbol, quote } of pairs) {
    if (quote) quotes[symbol] = quote;
  }

  console.info("[api/quotes] fetched", {
    requested: symbols.length,
    ok: Object.keys(quotes).length,
  });

  return NextResponse.json({ quotes, source: "finnhub" });
}
