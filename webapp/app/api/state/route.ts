import { NextRequest, NextResponse } from "next/server";
import { DEFAULTS, mergeWithDefaults } from "@/lib/finance/defaults";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import { isValidDashboardState } from "@/lib/validate-state";

const ROW_ID = "default";

function checkWriteSecret(req: NextRequest): boolean {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) return true;
  return req.headers.get("x-dashboard-secret") === secret;
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    console.info("[api/state] GET — Supabase not configured, returning defaults");
    return NextResponse.json({
      data: DEFAULTS,
      updatedAt: null,
      source: "defaults",
    });
  }

  const supabase = createAdminClient()!;
  const { data: row, error } = await supabase
    .from("dashboard_state")
    .select("data, updated_at")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) {
    console.error("[api/state] GET error", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const raw = row?.data;
  const hasData =
    raw &&
    typeof raw === "object" &&
    Object.keys(raw as object).length > 0;

  const state = hasData
    ? mergeWithDefaults(raw as Partial<typeof DEFAULTS>)
    : DEFAULTS;

  const payloadSize = JSON.stringify(state).length;
  console.info("[api/state] GET ok", {
    updatedAt: row?.updated_at ?? null,
    payloadBytes: payloadSize,
    source: hasData ? "database" : "defaults",
  });

  return NextResponse.json({
    data: state,
    updatedAt: row?.updated_at ?? null,
    source: hasData ? "database" : "defaults",
  });
}

export async function PUT(req: NextRequest) {
  if (!checkWriteSecret(req)) {
    console.warn("[api/state] PUT rejected — invalid secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const incoming =
    body && typeof body === "object" && "data" in (body as object)
      ? (body as { data: unknown }).data
      : body;

  if (!isValidDashboardState(incoming)) {
    return NextResponse.json({ error: "Invalid dashboard state" }, { status: 400 });
  }

  const state = mergeWithDefaults(incoming);
  const payloadSize = JSON.stringify(state).length;

  if (!isSupabaseConfigured()) {
    console.info("[api/state] PUT — Supabase not configured, accepted in-memory only", {
      payloadBytes: payloadSize,
    });
    return NextResponse.json({
      data: state,
      updatedAt: new Date().toISOString(),
      source: "memory",
      warning: "Supabase not configured — data not persisted",
    });
  }

  const supabase = createAdminClient()!;
  const { data: row, error } = await supabase
    .from("dashboard_state")
    .upsert({
      id: ROW_ID,
      data: state,
      updated_at: new Date().toISOString(),
    })
    .select("updated_at")
    .single();

  if (error) {
    console.error("[api/state] PUT error", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.info("[api/state] PUT ok", {
    updatedAt: row.updated_at,
    payloadBytes: payloadSize,
  });

  return NextResponse.json({
    data: state,
    updatedAt: row.updated_at,
    source: "database",
  });
}
