import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import {
  BASE_REPORTING_CURRENCY,
  isSupportedCurrency,
  normalizeCurrencyCode,
} from "@/lib/fx/currencies";
import { fetchFxRateToSgd } from "@/lib/fx/frankfurter";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

const RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export async function GET(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const rate = checkRateLimit(`fx:${auth.user.id}`, RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many FX requests. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      }
    );
  }

  const { searchParams } = new URL(req.url);
  const from = normalizeCurrencyCode(searchParams.get("from"));
  const date = searchParams.get("date")?.trim() ?? "";

  if (!isSupportedCurrency(from)) {
    return NextResponse.json({ error: `Unsupported currency: ${from}` }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date (use YYYY-MM-DD)" }, { status: 400 });
  }

  if (from === BASE_REPORTING_CURRENCY) {
    return NextResponse.json({
      configured: true,
      from,
      to: BASE_REPORTING_CURRENCY,
      rate: 1,
      rateDate: date,
      source: "identity",
    });
  }

  const result = await fetchFxRateToSgd(from, date);
  if (!result) {
    return NextResponse.json(
      { error: `No FX rate found for ${from} on ${date}` },
      { status: 404 }
    );
  }

  console.info("[api/fx] resolved", {
    userId: auth.user.id,
    from,
    date: result.rateDate,
    rate: result.rate,
    source: result.source,
  });

  return NextResponse.json({
    configured: true,
    from: result.from,
    to: result.to,
    rate: result.rate,
    rateDate: result.rateDate,
    source: result.source,
  });
}
