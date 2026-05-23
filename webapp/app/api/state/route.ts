import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { stripSaveBudgetLines } from "@/lib/finance/budget";
import { createEmptyState, mergeWithDefaults } from "@/lib/finance/defaults";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import {
  migrateSavingsFromDashboardJson,
  needsSavingsMigration,
} from "@/lib/savings/migrate-from-dashboard";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import {
  isPersistedDashboardSnapshot,
  isValidDashboardState,
} from "@/lib/validate-state";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    console.info("[api/state] GET — Supabase not configured, returning defaults");
    return NextResponse.json({
      data: createEmptyState(),
      updatedAt: null,
      source: "defaults",
    });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const supabase = await createAuthedSupabaseClient();
  const { data: row, error } = await supabase
    .from("dashboard_state")
    .select("data, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[api/state] GET error", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const raw = row?.data;
  const hasData = isPersistedDashboardSnapshot(raw);

  let state = hasData
    ? mergeWithDefaults(raw as Partial<ReturnType<typeof createEmptyState>>)
    : createEmptyState();

  await ensureUserHousehold(supabase, user.id);

  if (hasData && needsSavingsMigration(raw)) {
    const migrated = await migrateSavingsFromDashboardJson(
      supabase,
      user.id,
      state
    );
    state = mergeWithDefaults(migrated);
    const { error: migErr } = await supabase.from("dashboard_state").upsert({
      user_id: user.id,
      data: state,
      updated_at: new Date().toISOString(),
    });
    if (migErr) {
      console.error("[api/state] migration persist failed", migErr.message);
    } else {
      console.info("[api/state] savings v1 migration persisted", { userId: user.id });
    }
  }

  const payloadSize = JSON.stringify(state).length;
  console.info("[api/state] GET ok", {
    userId: user.id,
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
  if (!isSupabaseAuthConfigured()) {
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
    console.info("[api/state] PUT — Supabase not configured, accepted in-memory only");
    return NextResponse.json({
      data: state,
      updatedAt: new Date().toISOString(),
      source: "memory",
      warning: "Supabase not configured — data not persisted",
    });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

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

  const merged = mergeWithDefaults(incoming);
  const state = {
    ...merged,
    accounts: [],
    goals: [],
    budget: stripSaveBudgetLines(merged.budget),
  };
  const payloadSize = JSON.stringify(state).length;

  const supabase = await createAuthedSupabaseClient();
  await ensureUserHousehold(supabase, user.id);
  const { data: row, error } = await supabase
    .from("dashboard_state")
    .upsert({
      user_id: user.id,
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
    userId: user.id,
    updatedAt: row.updated_at,
    payloadBytes: payloadSize,
  });

  return NextResponse.json({
    data: state,
    updatedAt: row.updated_at,
    source: "database",
  });
}
