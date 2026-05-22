import { NextRequest, NextResponse } from "next/server";
import { isUnlockedRequest } from "@/lib/auth/pin";
import { createEmptyState, mergeWithDefaults } from "@/lib/finance/defaults";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  isPersistedDashboardSnapshot,
  isValidDashboardState,
} from "@/lib/validate-state";

const ROW_ID = "default";

function checkWriteSecret(req: NextRequest): boolean {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) return true;
  return req.headers.get("x-dashboard-secret") === secret;
}

async function requirePin(req: NextRequest) {
  if (!(await isUnlockedRequest(req))) {
    return NextResponse.json({ error: "PIN required" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await requirePin(req);
  if (denied) return denied;
  if (!isSupabaseConfigured()) {
    console.info("[api/state] GET — Supabase not configured, returning defaults");
    return NextResponse.json({
      data: createEmptyState(),
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
  const hasData = isPersistedDashboardSnapshot(raw);

  const state = hasData
    ? mergeWithDefaults(raw as Partial<ReturnType<typeof createEmptyState>>)
    : createEmptyState();

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
  const denied = await requirePin(req);
  if (denied) return denied;

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
