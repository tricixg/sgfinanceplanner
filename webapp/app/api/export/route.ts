import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { exportUserDataChunks } from "@/lib/export/user-data";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { sgtTodayYmd } from "@/lib/time/sgt";

export const dynamic = "force-dynamic";

/**
 * GET /api/export — download everything the signed-in user owns as JSON.
 * Read-only. Streamed so large accounts don't hit the serverless response
 * size limit; the trailing `summary.complete` says whether every table was read.
 */
export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const supabase = await createAuthedSupabaseClient();
  const chunks = exportUserDataChunks(supabase, { id: user.id, email: user.email });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) {
          controller.close();
          console.info("[api/export] export streamed", { userId: user.id });
        } else {
          controller.enqueue(encoder.encode(value));
        }
      } catch (e) {
        console.error("[api/export] export failed", e instanceof Error ? e.message : e);
        controller.error(e);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="sgfinanceplanner-export-${sgtTodayYmd()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
