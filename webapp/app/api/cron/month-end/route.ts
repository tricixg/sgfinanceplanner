import { apiError } from "@/lib/api/api-error";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { verifyCronSecret } from "@/lib/jobs/cron-auth";
import {
  listProfileUserIds,
  monthEndInfo,
  processUserMonthEnd,
  runMonthEnd,
} from "@/lib/jobs/month-end";
import { sgtTodayYmd } from "@/lib/time/sgt";
import { withRequestId } from "@/lib/api/with-request-id";

// Many users are processed in one invocation.
export const maxDuration = 60;

/**
 * Month-end job (Vercel Cron, see vercel.json): on the last day of each month
 * in Singapore time, records every user's net-worth snapshot for the month
 * and freezes that month's insurance / ILP / loan figures.
 *
 * Authenticated by `Authorization: Bearer $CRON_SECRET`, not by a user
 * session — it uses the service-role client and filters every query by
 * user id. `?force=1` runs it for the current month on any day (still needs
 * the secret); a later run on the real last day overwrites that month's rows.
 */
export const GET = withRequestId(async function GET(req: Request) {
  const auth = verifyCronSecret(req);
  if (auth === "unconfigured") {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (auth !== "ok") {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const { ym, isLastDay } = monthEndInfo(sgtTodayYmd());
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!isLastDay && !force) {
    return NextResponse.json({ skipped: true, reason: "not the last day of the month (SGT)", month: ym });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 503 });
  }

  try {
    const userIds = await listProfileUserIds(admin);
    const summary = await runMonthEnd({
      userIds,
      ym,
      processUser: (userId, month) => processUserMonthEnd(admin, userId, month),
    });
    console.info("[cron/month-end] done", summary);
    return NextResponse.json({ ok: true, forced: force && !isLastDay, ...summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Month-end job failed";
    console.error("[cron/month-end] failed", msg);
    return apiError("api/cron/month-end", msg, { fallback: "Month-end job failed" });
  }
});
