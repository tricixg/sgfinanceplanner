import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { createEmptyState, mergeWithDefaults } from "@/lib/finance/defaults";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { migrateAllDomainsFromDashboard } from "@/lib/migrate-all-domains";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { isPersistedDashboardSnapshot } from "@/lib/validate-state";
import type { DashboardState } from "@/lib/types";

type PrefsPayload = {
  prefs?: DashboardState["prefs"];
  _migrated_v2?: boolean;
};

function prefsOnlyFromRaw(raw: unknown): PrefsPayload {
  if (!raw || typeof raw !== "object") return { prefs: {} };
  const d = raw as Record<string, unknown>;
  return {
    prefs: (d.prefs as DashboardState["prefs"]) ?? {},
    _migrated_v2: Boolean(d._migrated_v2),
  };
}

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    console.info("[api/state] GET — Supabase not configured, returning prefs defaults");
    return NextResponse.json({
      data: { prefs: {} },
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
  const rawObj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const alreadyV2 = Boolean(rawObj?._migrated_v2);
  const hasLegacyBlob = isPersistedDashboardSnapshot(raw);

  await ensureUserHousehold(supabase, user.id);

  if (alreadyV2) {
    const slim = prefsOnlyFromRaw(raw);
    return NextResponse.json({
      data: slim,
      updatedAt: row?.updated_at ?? null,
      source: "database",
    });
  }

  if (hasLegacyBlob) {
    const full = mergeWithDefaults(raw as Partial<DashboardState>);
    const migrated = await migrateAllDomainsFromDashboard(
      supabase,
      user.id,
      full,
      raw
    );
    const slim: PrefsPayload = {
      prefs: migrated.prefs ?? {},
      _migrated_v2: true,
    };
    const { error: migErr } = await supabase.from("dashboard_state").upsert({
      user_id: user.id,
      data: slim,
      updated_at: new Date().toISOString(),
    });
    if (migErr) {
      console.error("[api/state] v2 migration persist failed", migErr.message);
    } else {
      console.info("[api/state] v2 migration persisted", { userId: user.id });
    }

    return NextResponse.json({
      data: slim,
      updatedAt: new Date().toISOString(),
      source: "database",
      migrated: true,
    });
  }

  const slim = prefsOnlyFromRaw(raw);
  console.info("[api/state] GET ok (prefs only)", { userId: user.id });

  return NextResponse.json({
    data: slim,
    updatedAt: row?.updated_at ?? null,
    source: row ? "database" : "defaults",
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
    const prefs =
      incoming && typeof incoming === "object" && "prefs" in (incoming as object)
        ? (incoming as PrefsPayload).prefs
        : {};
    console.info("[api/state] PUT — Supabase not configured, prefs only");
    return NextResponse.json({
      data: { prefs: prefs ?? {} },
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

  const prefs =
    incoming && typeof incoming === "object" && "prefs" in (incoming as object)
      ? (incoming as PrefsPayload).prefs ?? {}
      : {};

  const slim: PrefsPayload = { prefs, _migrated_v2: true };

  const supabase = await createAuthedSupabaseClient();
  await ensureUserHousehold(supabase, user.id);
  const { data: row, error } = await supabase
    .from("dashboard_state")
    .upsert({
      user_id: user.id,
      data: slim,
      updated_at: new Date().toISOString(),
    })
    .select("updated_at")
    .single();

  if (error) {
    console.error("[api/state] PUT error", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.info("[api/state] PUT ok (prefs only)", { userId: user.id });

  return NextResponse.json({
    data: slim,
    updatedAt: row.updated_at,
    source: "database",
  });
}
