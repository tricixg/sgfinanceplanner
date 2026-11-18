import { connection, NextResponse } from "next/server";
import { createHealthClient, runHealthCheck } from "@/lib/health/check";

/**
 * GET /api/health — liveness + Supabase reachability for uptime monitors.
 * No session needed; returns no user data. 200 when healthy, 503 otherwise.
 */
export async function GET() {
  // Always evaluate at request time (never prerendered or cached).
  await connection();
  const report = await runHealthCheck(createHealthClient());
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
